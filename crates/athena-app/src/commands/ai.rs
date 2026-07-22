//! IPC surface for 06_AI_ENGINE.md's AI layer. Every command here is a
//! thin translation, same precedent as `bootstrap.rs`/`planner.rs`:
//! fetch the same Decision Engine verdict the rest of the app already
//! computes (never a second scoring path — this file calls
//! `athena_domain::priority::resolve_priority` / `athena_domain::planner`
//! directly, the identical functions `bootstrap.rs`/`planner.rs` call),
//! hand it to `athena_reasoning::capabilities::*` to phrase, and return
//! the typed `Recommendation`. `athena_reasoning::Recommendation` already
//! derives `Serialize` (this crate owns its own `serde` dependency,
//! unlike `athena-domain`), so no DTO remapping happens here.
//!
//! Blocking by construction: `Synthesizer::synthesize` calls a blocking
//! HTTP client (see `athena-reasoning/Cargo.toml`'s dependency comment
//! for why). Every command below wraps that call in
//! `tauri::async_runtime::spawn_blocking` so a slow or unreachable LLM
//! provider never stalls the Tauri IPC thread — 07_INTEGRATIONS.md's
//! "never block startup waiting for integrations," extended to "never
//! block the UI thread waiting for an LLM call" (06_AI_ENGINE.md §10's
//! offline-first requirement applies just as much to responsiveness as
//! to availability).
//!
//! Nothing in this file runs on app startup, same as `commands::integrations`
//! — every AI call here is user-triggered (opening a screen that renders
//! a phrased verdict) or scheduler-triggered, never blocking the window
//! from opening.

use std::sync::Mutex;

use athena_data::repositories::{deadline, disruption, profile};
use athena_domain::planner::{self, DisruptionType, ScheduleDisruption};
use athena_domain::priority::{self, DeadlineCandidate};
use athena_reasoning::capabilities::{ask_athena, daily_briefing, routine_conversation, weakness_analysis, weekly_planning};
use athena_reasoning::providers::cloud::AnthropicProvider;
use athena_reasoning::providers::gemini::GeminiProvider;
use athena_reasoning::providers::hf::HuggingFaceProvider;
use athena_reasoning::providers::local::OllamaProvider;
use athena_reasoning::{LlmProvider, Recommendation, Synthesizer};
use rusqlite::Connection;
use tauri::State;

use crate::keychain;

const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";
// Best free-tier model for JSON instruction-following as of 2026-07.
// Swap to "meta-llama/Llama-3.3-70B-Instruct" or
// "mistralai/Mistral-7B-Instruct-v0.3" for a faster/lighter option.
const DEFAULT_HF_MODEL: &str = "Qwen/Qwen2.5-7B-Instruct";
const DEFAULT_GEMINI_MODEL: &str = "gemini-2.5-flash";
const DEFAULT_OLLAMA_BASE_URL: &str = "http://localhost:11434";
// Pinned to whatever model the user has actually pulled via `ollama pull`
// — Ollama has no built-in model, so this must match the tag exactly
// (`ollama list` on the user's machine), or every call 404s.
const DEFAULT_OLLAMA_MODEL: &str = "qwen2.5:7b";

// Duplicated in `commands::integrations` as `now_iso8601`/`chrono_like_iso_date`/
// `civil_from_days` — same reasoning that file's own doc comment gives
// for its date helper: one timestamp format doesn't justify a full
// date/time crate dependency for a second call site.
fn now_iso8601() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}Z", chrono_like_iso_date(now.as_secs()), now.subsec_millis())
}
fn chrono_like_iso_date(total_secs: u64) -> String {
    let days = total_secs / 86_400;
    let secs_of_day = total_secs % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}")
}
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d)
}

/// Cascade: Anthropic (paid) → Gemini (free) → Hugging Face (free) → Ollama (local).
/// Each cloud provider is only added if its credential is configured; Ollama is always
/// attempted last (it just returns ProviderUnavailable immediately if the local
/// server isn't running). Built fresh per call so a newly-saved key takes effect
/// without a restart. Shared by `build_synthesizer` (Recommendation-shaped
/// capabilities) and `routine_conversation`'s two commands (which call
/// `LlmProvider` directly, bypassing `Synthesizer` — see that module's doc
/// comment) — both need the identical, identically-ordered provider list.
fn build_providers() -> Vec<Box<dyn LlmProvider>> {
    let mut providers: Vec<Box<dyn LlmProvider>> = Vec::new();

    // 1. Anthropic Claude — paid, cloud, fastest
    match keychain::get_anthropic_api_key() {
        Ok(Some(api_key)) => {
            tracing::debug!(event = "cascade_step", provider = "anthropic", "key found, adding to cascade");
            providers.push(Box::new(AnthropicProvider::new(
                api_key,
                DEFAULT_ANTHROPIC_MODEL.to_string(),
            )));
        }
        Ok(None) => tracing::debug!(event = "cascade_step", provider = "anthropic", "no key saved, skipping"),
        Err(e) => tracing::debug!(event = "cascade_step", provider = "anthropic", error = %e, "key lookup failed, skipping"),
    }

    // 2. Google Gemini — free tier, cloud, no billing required
    match keychain::get_gemini_api_key() {
        Ok(Some(api_key)) => {
            tracing::debug!(event = "cascade_step", provider = "gemini", "key found, adding to cascade");
            providers.push(Box::new(GeminiProvider::new(
                api_key,
                DEFAULT_GEMINI_MODEL.to_string(),
            )));
        }
        Ok(None) => tracing::debug!(event = "cascade_step", provider = "gemini", "no key saved, skipping"),
        Err(e) => tracing::debug!(event = "cascade_step", provider = "gemini", error = %e, "key lookup failed, skipping"),
    }

    // 3. Hugging Face — free tier, cloud, no billing required
    match keychain::get_hf_api_token() {
        Ok(Some(token)) => {
            tracing::debug!(event = "cascade_step", provider = "huggingface", "token found, adding to cascade");
            providers.push(Box::new(HuggingFaceProvider::new(
                token,
                DEFAULT_HF_MODEL.to_string(),
            )));
        }
        Ok(None) => tracing::debug!(event = "cascade_step", provider = "huggingface", "no token saved, skipping"),
        Err(e) => tracing::debug!(event = "cascade_step", provider = "huggingface", error = %e, "token lookup failed, skipping"),
    }

    // 4. Ollama — local, always in the list; ProviderUnavailable if not running
    tracing::debug!(event = "cascade_step", provider = "ollama", "always added, local fallback");
    providers.push(Box::new(OllamaProvider::new(
        DEFAULT_OLLAMA_BASE_URL.to_string(),
        DEFAULT_OLLAMA_MODEL.to_string(),
    )));

    tracing::debug!(event = "cascade_built", provider_count = providers.len(), "provider cascade built");
    providers
}

fn build_synthesizer() -> Synthesizer {
    Synthesizer::new(build_providers())
}

fn open_candidates(conn: &Connection) -> Result<Vec<DeadlineCandidate>, String> {
    let rows = deadline::list_open(conn).map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|d| DeadlineCandidate {
            id: d.id,
            title: d.title.clone(),
            due_at: d.due_at.clone(),
            leverage_class: d.leverage_class.clone(),
        })
        .collect())
}

/// Daily Pass, on demand (§4.1) — phrases the exact same Priority
/// Resolution verdict `get_bootstrap_state` computes for `Now`.
#[tauri::command]
pub async fn get_daily_briefing(db: State<'_, Mutex<Connection>>) -> Result<Recommendation, String> {
    let candidates = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        open_candidates(&conn)?
    };
    let verdict = priority::resolve_priority(&candidates);
    let freshness_note = format!("as of {}", now_iso8601());

    tauri::async_runtime::spawn_blocking(move || {
        let synthesizer = build_synthesizer();
        daily_briefing::build_daily_briefing(&synthesizer, &verdict, freshness_note)
    })
    .await
    .map_err(|e| e.to_string())
}

/// Weekly Digest, on demand (§4.2) — rolls up the same
/// `athena_domain::planner::replan` verdict every disruption-affected
/// day already produced (the identical function `commands::planner::log_disruption`
/// calls), one call per distinct date already logged, most recent 7
/// first. Introduces no new scoring: every per-day verdict here is
/// recomputed by the same deterministic function, never invented.
#[tauri::command]
pub async fn get_weekly_plan(db: State<'_, Mutex<Connection>>) -> Result<Recommendation, String> {
    let (candidates, base_window_minutes, days): (Vec<DeadlineCandidate>, i64, Vec<(String, Vec<ScheduleDisruption>)>) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let candidates = open_candidates(&conn)?;
        let base_window_minutes = profile::get_current_profile(&conn)
            .map_err(|e| e.to_string())?
            .and_then(|p| planner::base_window_minutes(&p.deep_work_window_start, &p.deep_work_window_end))
            .unwrap_or(240);

        let recent = disruption::list_recent(&conn, 100).map_err(|e| e.to_string())?;
        let mut dates: Vec<String> = recent.iter().map(|r| r.date.clone()).collect();
        dates.sort();
        dates.dedup();
        dates.reverse();
        dates.truncate(7);

        let days = dates
            .into_iter()
            .map(|date| {
                let disruptions: Vec<ScheduleDisruption> = recent
                    .iter()
                    .filter(|r| r.date == date)
                    .filter_map(|r| {
                        DisruptionType::from_str(&r.disruption_type).map(|t| ScheduleDisruption {
                            disruption_type: t,
                            duration_minutes: r.duration_minutes,
                        })
                    })
                    .collect();
                (date, disruptions)
            })
            .collect();

        (candidates, base_window_minutes, days)
    };

    tauri::async_runtime::spawn_blocking(move || {
        let replans: Vec<(String, planner::ReplanResult)> = days
            .into_iter()
            .map(|(date, disruptions)| {
                let result = planner::replan(&candidates, base_window_minutes, &disruptions);
                (date, result)
            })
            .collect();
        let synthesizer = build_synthesizer();
        weekly_planning::build_weekly_plan(&synthesizer, &replans, format!("as of {}", now_iso8601()))
    })
    .await
    .map_err(|e| e.to_string())
}

/// Weakness Analysis, on demand (§4.4). Honest gap, matching
/// `athena_domain::planner`'s own documented precedent: `drift_signals`/
/// `bottlenecks` don't exist in this schema yet
/// (`crates/athena-data/migrations/` stops at `V5`), so there is no
/// repository to call. Calling this today correctly returns
/// `insufficient_data` — never a fabricated pattern — and the one line
/// that changes once those tables land is the empty slice below being
/// replaced with a real repository read.
#[tauri::command]
pub async fn get_weakness_analysis() -> Result<Recommendation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let synthesizer = build_synthesizer();
        weakness_analysis::build_weakness_analysis(&synthesizer, &[], format!("as of {}", now_iso8601()))
    })
    .await
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------
// Anthropic API key (§9's cloud provider config) — same shape as
// `commands::integrations`'s `save_github_token`/`delete_github_token`,
// exposed here rather than in `integrations.rs` since the AI layer is
// not a data-source connector, but the credential handling is identical.
// ---------------------------------------------------------------------

#[tauri::command]
pub fn save_anthropic_api_key(key: String) -> Result<(), String> {
    keychain::save_anthropic_api_key(&key)
}

#[tauri::command]
pub fn delete_anthropic_api_key() -> Result<(), String> {
    keychain::delete_anthropic_api_key()
}

#[tauri::command]
pub fn has_anthropic_api_key() -> Result<bool, String> {
    Ok(keychain::has_anthropic_api_key())
}

// ---------------------------------------------------------------------
// Hugging Face API token management — same shape as the Anthropic key
// commands above. Free-tier token from huggingface.co/settings/tokens
// (role: "Inference"). Absence means HF is skipped in the cascade;
// it is never an error.
// ---------------------------------------------------------------------

#[tauri::command]
pub fn save_hf_api_key(key: String) -> Result<(), String> {
    keychain::save_hf_api_token(&key)
}

#[tauri::command]
pub fn delete_hf_api_key() -> Result<(), String> {
    keychain::delete_hf_api_token()
}

#[tauri::command]
pub fn has_hf_api_key() -> Result<bool, String> {
    Ok(keychain::has_hf_api_token())
}

// ---------------------------------------------------------------------
// Gemini API key management — same shape as the Anthropic/HF key
// commands above. Free-tier key from https://aistudio.google.com/app/apikey.
// Absence means Gemini is skipped in the cascade; it is never an error.
// ---------------------------------------------------------------------

#[tauri::command]
pub fn save_gemini_api_key(key: String) -> Result<(), String> {
    keychain::save_gemini_api_key(&key)
}

#[tauri::command]
pub fn delete_gemini_api_key() -> Result<(), String> {
    keychain::delete_gemini_api_key()
}

#[tauri::command]
pub fn has_gemini_api_key() -> Result<bool, String> {
    Ok(keychain::has_gemini_api_key())
}

// ---------------------------------------------------------------------
// Ask Athena (new capability, additive — see
// `athena_reasoning::capabilities::ask_athena`). Persistent, free-form
// chat that needs neither a Verdict nor an open deadline to answer:
// unlike every command above, this one calls no `athena_domain`
// scoring function at all before reaching the synthesizer — the user's
// message is the only input. Still goes through the identical
// Synthesizer cascade/grounding/template-fallback pipeline as every
// other capability; `build_synthesizer` is untouched.
// ---------------------------------------------------------------------

#[tauri::command]
pub async fn ask_athena_command(message: String) -> Result<Recommendation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let synthesizer = build_synthesizer();
        ask_athena::build_ask_athena_response(&synthesizer, message, format!("as of {}", now_iso8601()))
    })
    .await
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------
// Ask Athena chat history (V9 migration, extended by V10 with
// `conversation_id`) — persists the screen's chat as separate
// conversations, ChatGPT/Gemini-style, capped at the 5 most recently
// active (`ask_athena_history::MAX_RETAINED_CONVERSATIONS`) rather than
// one unbounded scrollback, so this never grows storage without limit.
// Mirrors `commands::routine`'s submit/fetch shape (typed input struct
// in, typed DTO out, `Mutex<Connection>` state) rather than
// `ask_athena_command` above: this is a plain repository read/write,
// not a Synthesizer call, so it stays synchronous and needs no
// `spawn_blocking` — same reasoning
// `commands::routine::submit_daily_routine_response` already applies to
// its own DB-only commands.
// ---------------------------------------------------------------------

/// One persisted chat bubble. Mirrors
/// `athena_data::repositories::ask_athena_history::AskAthenaMessageRow`
/// field-for-field — `source`/`confidence` are `None` on `role: "user"`
/// rows, matching `ChatMessage.meta` being optional client-side
/// (`screens/AskAthena/index.tsx`).
#[derive(Debug, Clone, serde::Serialize)]
pub struct AskAthenaMessageDto {
    pub id: i64,
    pub conversation_id: String,
    pub role: String,
    pub text: String,
    pub source: Option<String>,
    pub confidence: Option<String>,
    pub created_at: String,
}

/// One entry in the "recent chats" list. Mirrors
/// `ask_athena_history::ConversationSummaryRow` field-for-field.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AskAthenaConversationDto {
    pub conversation_id: String,
    pub title: String,
    pub last_message_at: String,
    pub message_count: i64,
}

fn ask_athena_message_to_dto(
    row: athena_data::repositories::ask_athena_history::AskAthenaMessageRow,
) -> AskAthenaMessageDto {
    AskAthenaMessageDto {
        id: row.id,
        conversation_id: row.conversation_id,
        role: row.role,
        text: row.text,
        source: row.source,
        confidence: row.confidence,
        created_at: row.created_at,
    }
}

fn ask_athena_conversation_to_dto(
    row: athena_data::repositories::ask_athena_history::ConversationSummaryRow,
) -> AskAthenaConversationDto {
    AskAthenaConversationDto {
        conversation_id: row.conversation_id,
        title: row.title,
        last_message_at: row.last_message_at,
        message_count: row.message_count,
    }
}

/// Typed input for `save_ask_athena_message` — `role` is validated at
/// the schema level (V9's `CHECK (role IN ('user', 'athena'))`), so an
/// invalid value here surfaces as a normal `Result::Err` from the
/// insert rather than needing a second check in this file.
/// `conversation_id` is client-generated (`crypto.randomUUID()` in
/// `AskAthena.tsx`, one per "New chat") — this command never invents
/// one, so the frontend's optimistic local state and the persisted row
/// always agree on which conversation a turn belongs to.
#[derive(Debug, serde::Deserialize)]
pub struct SaveAskAthenaMessageInput {
    pub conversation_id: String,
    pub role: String,
    pub text: String,
    pub source: Option<String>,
    pub confidence: Option<String>,
}

/// Persists one chat bubble (called once for the user's message and
/// once for Athena's reply — see `AskAthena.tsx`). Additive to the
/// existing optimistic local `setMessages` flow, never a replacement
/// for it: the frontend still renders from local state immediately and
/// this call just makes the same turn durable across a refresh/restart.
/// Also prunes down to the 5 most recently active conversations as a
/// side effect of the insert (`ask_athena_history::insert_message`'s
/// own doc comment) — a conversation that falls out of that window is
/// deleted here, not just hidden from the list.
#[tauri::command]
pub fn save_ask_athena_message(
    db: State<'_, Mutex<Connection>>,
    input: SaveAskAthenaMessageInput,
) -> Result<AskAthenaMessageDto, String> {
    use athena_data::repositories::ask_athena_history;

    let conn = db.lock().map_err(|e| e.to_string())?;
    let id = ask_athena_history::insert_message(
        &conn,
        &ask_athena_history::NewAskAthenaMessage {
            conversation_id: input.conversation_id.clone(),
            role: input.role,
            text: input.text,
            source: input.source,
            confidence: input.confidence,
        },
    )
    .map_err(|e| e.to_string())?;

    let messages = ask_athena_history::list_messages_for_conversation(&conn, &input.conversation_id)
        .map_err(|e| e.to_string())?;
    messages
        .into_iter()
        .find(|r| r.id == id)
        .map(ask_athena_message_to_dto)
        .ok_or_else(|| "Ask Athena message vanished immediately after insert.".to_string())
}

/// The most recently active conversations, most recent first — capped
/// at `ask_athena_history::MAX_RETAINED_CONVERSATIONS` (5) by the
/// repository itself, so `AskAthena.tsx` never has to think about the
/// limit when rendering this list.
#[tauri::command]
pub fn list_ask_athena_conversations(
    db: State<'_, Mutex<Connection>>,
) -> Result<Vec<AskAthenaConversationDto>, String> {
    use athena_data::repositories::ask_athena_history;

    let conn = db.lock().map_err(|e| e.to_string())?;
    let rows = ask_athena_history::list_conversations(&conn, ask_athena_history::MAX_RETAINED_CONVERSATIONS)
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(ask_athena_conversation_to_dto).collect())
}

/// Every message in one conversation, oldest first — what
/// `AskAthena.tsx` loads when the user opens a conversation from the
/// recent-chats list (and on mount, for the most recently active one).
#[tauri::command]
pub fn get_ask_athena_conversation(
    db: State<'_, Mutex<Connection>>,
    conversation_id: String,
) -> Result<Vec<AskAthenaMessageDto>, String> {
    use athena_data::repositories::ask_athena_history;

    let conn = db.lock().map_err(|e| e.to_string())?;
    let rows = ask_athena_history::list_messages_for_conversation(&conn, &conversation_id)
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(ask_athena_message_to_dto).collect())
}

/// Deletes one conversation and every message in it — the "Delete
/// chat" action on each entry in `AskAthena.tsx`'s "Recent chats" list.
/// Idempotent, same "nothing to remove is success" precedent every
/// other delete command in this codebase follows.
#[tauri::command]
pub fn delete_ask_athena_conversation(
    db: State<'_, Mutex<Connection>>,
    conversation_id: String,
) -> Result<(), String> {
    use athena_data::repositories::ask_athena_history;

    let conn = db.lock().map_err(|e| e.to_string())?;
    ask_athena_history::delete_conversation(&conn, &conversation_id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------
// Daily routine check-in as an AI conversation (replaces
// `RoutineQuestionnaireCard.tsx`'s numeric-slider form) — see
// `athena_reasoning::capabilities::routine_conversation` for why these
// two calls bypass `Synthesizer`/`build_synthesizer` and call
// `LlmProvider` via `build_providers()` directly. Neither command
// touches `commands::routine::SubmitDailyRoutineInput` or the Adaptive
// Planner: the frontend calls `extract_daily_routine_answers`, gets
// back plain fields, fills in `date` itself, and calls the existing,
// unmodified `submit_daily_routine_response` — this file only adds the
// AI step in front of that unchanged path.
// ---------------------------------------------------------------------

/// `context_summary` is one or two sentences of already-fetched
/// context (e.g. today's top deadline, whether a disruption was
/// already logged) — never a new retrieval, just a short string the
/// frontend already has from `get_bootstrap_state`.
#[tauri::command]
pub async fn generate_daily_routine_questions(context_summary: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let providers = build_providers();
        routine_conversation::generate_daily_questions(&providers, &context_summary)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `transcript` is the full question/answer conversation as plain
/// text (e.g. `"Q: ...\nA: ...\n\nQ: ...\nA: ..."`), built client-side
/// from the questions `generate_daily_routine_questions` returned and
/// the user's free-text replies.
#[tauri::command]
pub async fn extract_daily_routine_answers(
    transcript: String,
) -> Result<routine_conversation::DailyRoutineExtraction, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let providers = build_providers();
        routine_conversation::extract_daily_routine(&providers, &transcript)
    })
    .await
    .map_err(|e| e.to_string())?
}