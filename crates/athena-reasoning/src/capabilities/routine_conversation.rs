//! Daily routine check-in as an AI conversation (replaces
//! `RoutineQuestionnaireCard.tsx`'s numeric-slider form). Bypasses
//! `Synthesizer` deliberately: there is no Decision Engine verdict here
//! to phrase/ground (§3's citation-checking machinery has nothing to
//! check against — a check-in transcript isn't `EvidencePayload`
//! evidence), so this module calls `LlmProvider` directly over the same
//! cascade `build_providers()` already assembles for every other
//! capability, in the same order.
//!
//! Every function here degrades honestly with zero providers
//! configured (06_AI_ENGINE.md §10): `generate_daily_questions` falls
//! back to a fixed, always-available question set, and
//! `extract_daily_routine` returns a `DailyRoutineExtraction` with a
//! empty/neutral defaults rather than erroring — the caller
//! (`commands::routine::submit_daily_routine_response`) still needs
//! *something* to submit even when no LLM answered.

use serde::{Deserialize, Serialize};

use crate::provider::{LlmProvider, PromptRequest};

/// Same shape `commands::routine::SubmitDailyRoutineInput` expects,
/// minus `date` (the frontend fills that in itself, per `ai.rs`'s doc
/// comment) — this is the one line of coupling between the two crates,
/// kept intentionally narrow rather than reusing the Tauri-side struct
/// directly (this crate has no dependency on `athena-app`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyRoutineExtraction {
    pub hours_available_tonight: f64,
    pub had_disruption_today: bool,
    pub disruption_note: Option<String>,
    pub reflection: String,
}

impl DailyRoutineExtraction {
    /// §10's fallback shape when no provider is configured or every
    /// attempt fails to parse — never blocks the check-in, just hands
    /// back neutral defaults for the user to correct via the existing
    /// form if they want to.
    fn fallback(transcript: &str) -> DailyRoutineExtraction {
        DailyRoutineExtraction {
            hours_available_tonight: 0.0,
            had_disruption_today: false,
            disruption_note: None,
            reflection: transcript.trim().to_string(),
        }
    }
}

const QUESTIONS_SYSTEM_PROMPT: &str = "You are Athena, a study-planning assistant conducting a brief, \
    warm daily check-in. Given a one- or two-sentence context summary, write 3 short conversational \
    questions (never more) to ask the user about tonight's study session: how much time they have \
    tonight, whether anything disrupted their day, and how the day went overall. Respond with JSON \
    matching the schema, nothing else.";

const QUESTIONS_OUTPUT_SCHEMA: &str = r#"{"type":"object","properties":{"questions":{"type":"array","items":{"type":"string"},"minItems":3,"maxItems":3}},"required":["questions"]}"#;

/// §10's always-available fallback question set — the same three
/// topics the schema above asks a provider for, phrased directly, used
/// whenever no provider is configured or every provider fails.
fn fallback_questions() -> Vec<String> {
    vec![
        "How much time do you realistically have to study tonight?".to_string(),
        "Did anything disrupt your day today?".to_string(),
        "How'd today go overall?".to_string(),
    ]
}

#[derive(Debug, Deserialize)]
struct QuestionsResponse {
    questions: Vec<String>,
}

/// Tries each provider in `providers` (same cascade order
/// `build_providers()` assembles) in turn, falling back to
/// `fallback_questions()` if every one is unavailable or returns
/// something that doesn't parse — mirrors `Synthesizer::try_provider`'s
/// "unreachable → move on, no retry" rule, just without the
/// grounding-retry step (there's no evidence set to ground against
/// here).
pub fn generate_daily_questions(
    providers: &[Box<dyn LlmProvider>],
    context_summary: &str,
) -> Result<Vec<String>, String> {
    let request = PromptRequest {
        system: QUESTIONS_SYSTEM_PROMPT.to_string(),
        verdict_json: "{}".to_string(),
        evidence_json: serde_json::json!({ "context_summary": context_summary }).to_string(),
        output_schema: QUESTIONS_OUTPUT_SCHEMA.to_string(),
        question: None,
        stricter: false,
    };

    for provider in providers {
        if let Ok(raw) = provider.complete(&request) {
            if let Ok(parsed) = serde_json::from_str::<QuestionsResponse>(&raw) {
                if !parsed.questions.is_empty() {
                    return Ok(parsed.questions);
                }
            }
        }
    }

    Ok(fallback_questions())
}

const EXTRACT_SYSTEM_PROMPT: &str = "You are Athena, extracting structured facts from a daily check-in \
    conversation transcript. Read the Q&A transcript and produce JSON matching the schema: how many \
    hours the user has available to study tonight, whether they reported a disruption today, an \
    optional short note about that disruption, and a one- or two-sentence reflection summarizing how \
    their day went. Never invent facts not present in the transcript — if hours aren't mentioned, use \
    0. Respond with JSON matching the schema, nothing else.";

const EXTRACT_OUTPUT_SCHEMA: &str = r#"{"type":"object","properties":{"hours_available_tonight":{"type":"number"},"had_disruption_today":{"type":"boolean"},"disruption_note":{"type":["string","null"]},"reflection":{"type":"string"}},"required":["hours_available_tonight","had_disruption_today","reflection"]}"#;

/// Same cascade/fallback discipline as `generate_daily_questions`; the
/// fallback here uses the raw transcript itself as `reflection` so the
/// check-in still submits *something* honest even with zero providers
/// configured, rather than losing the user's answers entirely.
pub fn extract_daily_routine(
    providers: &[Box<dyn LlmProvider>],
    transcript: &str,
) -> Result<DailyRoutineExtraction, String> {
    let request = PromptRequest {
        system: EXTRACT_SYSTEM_PROMPT.to_string(),
        verdict_json: "{}".to_string(),
        evidence_json: serde_json::json!({ "transcript": transcript }).to_string(),
        output_schema: EXTRACT_OUTPUT_SCHEMA.to_string(),
        question: None,
        stricter: false,
    };

    for provider in providers {
        if let Ok(raw) = provider.complete(&request) {
            if let Ok(parsed) = serde_json::from_str::<DailyRoutineExtraction>(&raw) {
                return Ok(parsed);
            }
        }
    }

    Ok(DailyRoutineExtraction::fallback(transcript))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ReasoningError;

    #[test]
    fn no_providers_falls_back_to_fixed_questions() {
        let questions = generate_daily_questions(&[], "Top priority: X").unwrap();
        assert_eq!(questions.len(), 3);
    }

    #[test]
    fn no_providers_falls_back_to_transcript_as_reflection() {
        let extraction = extract_daily_routine(&[], "Q: How much time?\nA: 2 hours").unwrap();
        assert!(extraction.reflection.contains("2 hours"));
        assert_eq!(extraction.hours_available_tonight, 0.0);
    }

    struct AlwaysUnavailable;
    impl LlmProvider for AlwaysUnavailable {
        fn name(&self) -> &'static str {
            "unavailable"
        }
        fn complete(&self, _request: &PromptRequest) -> Result<String, ReasoningError> {
            Err(ReasoningError::ProviderUnavailable("no network".into()))
        }
    }

    #[test]
    fn unavailable_provider_falls_back_without_erroring() {
        let providers: Vec<Box<dyn LlmProvider>> = vec![Box::new(AlwaysUnavailable)];
        let questions = generate_daily_questions(&providers, "context").unwrap();
        assert_eq!(questions.len(), 3);
    }
}