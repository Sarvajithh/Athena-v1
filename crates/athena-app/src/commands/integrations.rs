//! IPC surface for 07_INTEGRATIONS.md's Version 1 connectors. Every
//! command here is a thin translation — IPC in, `athena_ingestion`
//! connector call (if any network/file work is needed), `athena_data`
//! repository write, typed response out — matching
//! `commands::bootstrap`'s own "thin translation" precedent.
//!
//! Nothing in this file runs on app startup (`main.rs`'s `setup` never
//! calls into this module) — every sync here is user-triggered (a
//! button in the Connectors step) or scheduler-triggered on its own
//! background tick (`scheduler.rs`), never blocking the window from
//! opening (07_INTEGRATIONS.md's "never block startup waiting for
//! integrations").

use std::sync::Mutex;

use athena_data::repositories::integrations as integrations_repo;
use athena_ingestion::connectors::{calendar_ics, codeforces, csv_import, github, leetcode, pdf_import};
use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::keychain;

fn now_iso8601() -> String {
    // Matches the exact format SQLite's own `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    // default column produces, so `last_synced_at` values are directly
    // comparable/sortable regardless of whether SQLite or this code
    // wrote them.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}Z", chrono_like_iso_date(now.as_secs()), now.subsec_millis())
}

// Small local helper so this file doesn't pull in a full date/time
// crate for one timestamp format (same reasoning as
// `athena_ingestion::connectors::github`'s own `chrono_like_30_days_ago`).
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

// ---------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------

/// One connector's status, plus (GitHub only) whether a token is
/// currently stored — computed here rather than persisted, since the
/// token's presence lives in the keychain, not `data_sources` (§4/§6:
/// the token itself never enters SQLite even indirectly).
#[derive(Debug, Clone, Serialize)]
pub struct DataSourceDto {
    pub source_key: String,
    pub kind: String,
    pub status: String,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub config_json: Option<String>,
    pub has_credential: bool,
}

fn to_dto(row: athena_data::repositories::integrations::DataSourceRow) -> DataSourceDto {
    let has_credential = row.source_key == "github" && keychain::has_github_token();
    DataSourceDto {
        source_key: row.source_key,
        kind: row.kind,
        status: row.status,
        last_synced_at: row.last_synced_at,
        last_error: row.last_error,
        config_json: row.config_json,
        has_credential,
    }
}

/// Every connector's current status — the one read the Connectors step
/// boots from, same "one IPC round trip" precedent as `get_bootstrap_state`.
#[tauri::command]
pub fn list_data_sources(db: State<'_, Mutex<Connection>>) -> Result<Vec<DataSourceDto>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let rows = integrations_repo::list_data_sources(&conn).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(to_dto).collect())
}

// ---------------------------------------------------------------------
// Codeforces (§1.1)
// ---------------------------------------------------------------------

/// Saves the handle (§1.1's config, e.g. a change from the one already
/// on `user_profile.codeforces_handle`) and syncs immediately so the
/// Connectors step shows a real result, not just "saved."
#[tauri::command]
pub async fn sync_codeforces(
    db: State<'_, Mutex<Connection>>,
    handle: String,
) -> Result<DataSourceDto, String> {
    run_codeforces_sync(&db, &handle).await
}

/// The actual sync, independent of the Tauri `State` extractor, so
/// `scheduler.rs`'s background task (which only has an `AppHandle`, not
/// a command invocation) can call the exact same logic on its own timer
/// tick rather than duplicating it (07_INTEGRATIONS.md §5's polling
/// cadence).
pub async fn run_codeforces_sync(db: &Mutex<Connection>, handle: &str) -> Result<DataSourceDto, String> {
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let config = serde_json::json!({ "handle": handle }).to_string();
        integrations_repo::set_data_source_config(&conn, "codeforces", &config).map_err(|e| e.to_string())?;
        integrations_repo::mark_syncing(&conn, "codeforces").map_err(|e| e.to_string())?;
    }

    match codeforces::fetch_snapshot(handle).await {
        Ok(snapshot) => {
            let conn = db.lock().map_err(|e| e.to_string())?;
            integrations_repo::insert_codeforces_snapshot(
                &conn,
                &integrations_repo::NewCodeforcesSnapshot {
                    handle: snapshot.handle,
                    rating: snapshot.rating,
                    max_rating: snapshot.max_rating,
                    rank: snapshot.rank,
                    solved_count: snapshot.solved_count,
                },
            )
            .map_err(|e| e.to_string())?;
            integrations_repo::mark_synced_ok(&conn, "codeforces", &now_iso8601()).map_err(|e| e.to_string())?;
            let row = integrations_repo::get_data_source(&conn, "codeforces")
                .map_err(|e| e.to_string())?
                .ok_or("codeforces data_source row missing")?;
            Ok(to_dto(row))
        }
        Err(e) => {
            let conn = db.lock().map_err(|e| e.to_string())?;
            integrations_repo::mark_synced_error(&conn, "codeforces", &e.to_string()).map_err(|e| e.to_string())?;
            let row = integrations_repo::get_data_source(&conn, "codeforces")
                .map_err(|e| e.to_string())?
                .ok_or("codeforces data_source row missing")?;
            // Ok(_), not Err(_): a failed sync is a normal, displayable
            // outcome (§5's degrade path), not an IPC-layer failure —
            // the frontend reads `status`/`last_error` off the DTO.
            Ok(to_dto(row))
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CodeforcesSnapshotDto {
    pub handle: String,
    pub rating: Option<i64>,
    pub max_rating: Option<i64>,
    pub rank: Option<String>,
    pub solved_count: i64,
    pub fetched_at: String,
}

#[tauri::command]
pub fn get_latest_codeforces_snapshot(
    db: State<'_, Mutex<Connection>>,
) -> Result<Option<CodeforcesSnapshotDto>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let row = integrations_repo::latest_codeforces_snapshot(&conn).map_err(|e| e.to_string())?;
    Ok(row.map(|r| CodeforcesSnapshotDto {
        handle: r.handle,
        rating: r.rating,
        max_rating: r.max_rating,
        rank: r.rank,
        solved_count: r.solved_count,
        fetched_at: r.fetched_at,
    }))
}

// ---------------------------------------------------------------------
// LeetCode (§1.2)
// ---------------------------------------------------------------------

#[tauri::command]
pub async fn sync_leetcode(
    db: State<'_, Mutex<Connection>>,
    handle: String,
) -> Result<DataSourceDto, String> {
    run_leetcode_sync(&db, &handle).await
}

/// See `run_codeforces_sync`'s doc comment — same reasoning, for the
/// scheduler's LeetCode tick.
pub async fn run_leetcode_sync(db: &Mutex<Connection>, handle: &str) -> Result<DataSourceDto, String> {
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let config = serde_json::json!({ "handle": handle }).to_string();
        integrations_repo::set_data_source_config(&conn, "leetcode", &config).map_err(|e| e.to_string())?;
        integrations_repo::mark_syncing(&conn, "leetcode").map_err(|e| e.to_string())?;
    }

    match leetcode::fetch_snapshot(handle).await {
        Ok(snapshot) => {
            let conn = db.lock().map_err(|e| e.to_string())?;
            integrations_repo::insert_dsa_practice_log(
                &conn,
                &integrations_repo::NewDsaPracticeLog {
                    source: "leetcode".into(),
                    handle: snapshot.handle,
                    total_solved: snapshot.total_solved,
                    easy_solved: snapshot.easy_solved,
                    medium_solved: snapshot.medium_solved,
                    hard_solved: snapshot.hard_solved,
                },
            )
            .map_err(|e| e.to_string())?;
            integrations_repo::mark_synced_ok(&conn, "leetcode", &now_iso8601()).map_err(|e| e.to_string())?;
            let row = integrations_repo::get_data_source(&conn, "leetcode")
                .map_err(|e| e.to_string())?
                .ok_or("leetcode data_source row missing")?;
            Ok(to_dto(row))
        }
        Err(e) => {
            let conn = db.lock().map_err(|e| e.to_string())?;
            integrations_repo::mark_synced_error(&conn, "leetcode", &e.to_string()).map_err(|e| e.to_string())?;
            let row = integrations_repo::get_data_source(&conn, "leetcode")
                .map_err(|e| e.to_string())?
                .ok_or("leetcode data_source row missing")?;
            Ok(to_dto(row))
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DsaPracticeLogDto {
    pub handle: String,
    pub total_solved: i64,
    pub easy_solved: i64,
    pub medium_solved: i64,
    pub hard_solved: i64,
    pub fetched_at: String,
}

#[tauri::command]
pub fn get_latest_leetcode_snapshot(
    db: State<'_, Mutex<Connection>>,
) -> Result<Option<DsaPracticeLogDto>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let row = integrations_repo::latest_dsa_practice_log(&conn, "leetcode").map_err(|e| e.to_string())?;
    Ok(row.map(|r| DsaPracticeLogDto {
        handle: r.handle,
        total_solved: r.total_solved,
        easy_solved: r.easy_solved,
        medium_solved: r.medium_solved,
        hard_solved: r.hard_solved,
        fetched_at: r.fetched_at,
    }))
}

// ---------------------------------------------------------------------
// GitHub (§1.3)
// ---------------------------------------------------------------------

/// Saves the token to the OS keychain (never SQLite, §4). Takes an
/// `Option<String>` so `None`/empty clears it — the same action as
/// `delete_github_token`, exposed once so the Connectors step's single
/// "Save" button covers both directions.
#[tauri::command]
pub fn save_github_token(token: String) -> Result<(), String> {
    if token.trim().is_empty() {
        keychain::delete_github_token()
    } else {
        keychain::save_github_token(token.trim())
    }
}

#[tauri::command]
pub fn delete_github_token() -> Result<(), String> {
    keychain::delete_github_token()
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkedGithubRepoDto {
    pub repo_full_name: String,
    pub added_at: String,
}

#[tauri::command]
pub fn link_github_repo(db: State<'_, Mutex<Connection>>, repo_full_name: String) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    integrations_repo::link_github_repo(&conn, repo_full_name.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unlink_github_repo(db: State<'_, Mutex<Connection>>, repo_full_name: String) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    integrations_repo::unlink_github_repo(&conn, repo_full_name.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_linked_github_repos(db: State<'_, Mutex<Connection>>) -> Result<Vec<LinkedGithubRepoDto>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let rows = integrations_repo::list_linked_github_repos(&conn).map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| LinkedGithubRepoDto {
            repo_full_name: r.repo_full_name,
            added_at: r.added_at,
        })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectStatusSnapshotDto {
    pub repo_full_name: String,
    pub commit_count_30d: i64,
    pub open_pr_count: i64,
    pub open_issue_count: i64,
    pub last_commit_at: Option<String>,
    pub fetched_at: String,
}

/// Syncs every linked repo. One repo failing (rate limit, repo renamed/
/// deleted) does not abort the rest — each repo's outcome is
/// independent, matching §5's per-source degrade path applied at the
/// per-repo granularity this connector actually operates at.
#[tauri::command]
pub async fn sync_github(db: State<'_, Mutex<Connection>>) -> Result<DataSourceDto, String> {
    run_github_sync(&db).await
}

/// See `run_codeforces_sync`'s doc comment — same reasoning, for the
/// scheduler's GitHub tick.
pub async fn run_github_sync(db: &Mutex<Connection>) -> Result<DataSourceDto, String> {
    let repos = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        integrations_repo::mark_syncing(&conn, "github").map_err(|e| e.to_string())?;
        integrations_repo::list_linked_github_repos(&conn).map_err(|e| e.to_string())?
    };

    if repos.is_empty() {
        let conn = db.lock().map_err(|e| e.to_string())?;
        integrations_repo::mark_synced_error(&conn, "github", "no repos linked yet").map_err(|e| e.to_string())?;
        let row = integrations_repo::get_data_source(&conn, "github")
            .map_err(|e| e.to_string())?
            .ok_or("github data_source row missing")?;
        return Ok(to_dto(row));
    }

    let token = keychain::get_github_token()?;
    let mut last_error: Option<String> = None;
    let mut any_success = false;

    for repo in &repos {
        match github::fetch_repo_snapshot(&repo.repo_full_name, token.as_deref()).await {
            Ok(snapshot) => {
                any_success = true;
                let conn = db.lock().map_err(|e| e.to_string())?;
                integrations_repo::insert_project_status_snapshot(
                    &conn,
                    &integrations_repo::NewProjectStatusSnapshot {
                        repo_full_name: snapshot.repo_full_name,
                        commit_count_30d: snapshot.commit_count_30d,
                        open_pr_count: snapshot.open_pr_count,
                        open_issue_count: snapshot.open_issue_count,
                        last_commit_at: snapshot.last_commit_at,
                    },
                )
                .map_err(|e| e.to_string())?;
            }
            Err(e) => last_error = Some(format!("{}: {e}", repo.repo_full_name)),
        }
    }

    let conn = db.lock().map_err(|e| e.to_string())?;
    if any_success {
        // At least one linked repo synced — the connector as a whole is
        // "ok" (`last_synced_at` moves forward); a single repo's error
        // (renamed, rate-limited, deleted) is informational, not fatal
        // to the connector's overall status. If every repo fails, that
        // is reported below instead.
        integrations_repo::mark_synced_ok(&conn, "github", &now_iso8601()).map_err(|e| e.to_string())?;
    } else if let Some(err) = last_error {
        integrations_repo::mark_synced_error(&conn, "github", &err).map_err(|e| e.to_string())?;
    }

    let row = integrations_repo::get_data_source(&conn, "github")
        .map_err(|e| e.to_string())?
        .ok_or("github data_source row missing")?;
    Ok(to_dto(row))
}

#[tauri::command]
pub fn list_project_status_snapshots(
    db: State<'_, Mutex<Connection>>,
) -> Result<Vec<ProjectStatusSnapshotDto>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let rows = integrations_repo::latest_project_status_snapshots(&conn).map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| ProjectStatusSnapshotDto {
            repo_full_name: r.repo_full_name,
            commit_count_30d: r.commit_count_30d,
            open_pr_count: r.open_pr_count,
            open_issue_count: r.open_issue_count,
            last_commit_at: r.last_commit_at,
            fetched_at: r.fetched_at,
        })
        .collect())
}

// ---------------------------------------------------------------------
// Calendar Import (§1.4), CSV Import (§1.6), PDF Import (§1.5)
// ---------------------------------------------------------------------
//
// A deliberate, documented deviation from the most literal reading of
// §1.4/§1.5/§1.6 ("commits" / "mapped directly onto existing typed
// entities"): none of these three commands writes to `deadlines`
// directly. `commands::onboarding::commit_semester_setup` is the one
// place a `semesters` row (and everything that references it via
// `semester_id`) gets created — and Semester Setup's wizard, where
// every one of these three imports is triggered (§1.4/§1.5/§1.6's own
// text: "through Semester Setup"), runs *before* that commit. There is
// no `semester_id` yet for these commands to write against.
//
// Resolved by having every import command here do parsing/extraction
// only and hand back data shaped exactly like `DeadlineInput`
// (`ipc/bindings.ts`) — the same shape the wizard's own Deadlines step
// already collects by hand. The wizard merges the returned rows into
// its existing local `deadlines` state (pre-filling, editable, removable
// like any manually-typed row) and they are committed the one existing
// way, through `commit_semester_setup`, alongside everything else. This
// is *more* consistent with "extraction always ends in a confirmation
// step" (§1.5) than a separate one-shot commit command would have
// been — the confirmation step is the Deadlines step the user was
// already going to review.

#[derive(Debug, Clone, Serialize)]
pub struct ParsedDeadlineDto {
    pub title: String,
    pub category: String,
    pub due_at: String,
    pub leverage_class: String,
    pub notes: Option<String>,
}

/// Parses `.ics` content already read client-side (the browser's own
/// File API — no new Tauri file-system plugin needed for a one-time,
/// user-initiated file read) into deadline-shaped rows for the wizard
/// to stage. `category = 'academic'` (the common case for calendar-
/// exported class/exam events; the user can recategorize any row
/// afterward, in the wizard or later, like any other deadline).
/// `due_at` is passed through as parsed; the frontend (which already
/// owns date/time-zone handling, per `commands::planner`'s precedent)
/// normalizes an all-day `DTSTART` (`YYYYMMDD`) vs. a timed one.
#[tauri::command]
pub fn import_calendar_ics(
    db: State<'_, Mutex<Connection>>,
    ics_content: String,
) -> Result<Vec<ParsedDeadlineDto>, String> {
    let events = calendar_ics::parse_ics(&ics_content).map_err(|e| e.to_string())?;

    let parsed: Vec<ParsedDeadlineDto> = events
        .into_iter()
        .filter_map(|event| {
            event.dtstart.map(|due_at| ParsedDeadlineDto {
                title: event.summary,
                category: "academic".to_string(),
                due_at,
                leverage_class: "medium".to_string(),
                notes: event.description,
            })
        })
        .collect();

    // A successful parse is this import connector's definition of
    // "synced" (§5) — it has no server-side persistence step of its
    // own to hang that status on otherwise.
    let conn = db.lock().map_err(|e| e.to_string())?;
    integrations_repo::mark_synced_ok(&conn, "calendar_ics", &now_iso8601()).map_err(|e| e.to_string())?;

    Ok(parsed)
}

/// One CSV row parsed but not yet mapped to any typed field — returned
/// to the frontend so the person can choose which column means what
/// before anything is staged into the wizard, same confirm-before-
/// commit discipline §1.5 requires for PDF import.
#[derive(Debug, Clone, Serialize)]
pub struct CsvRowDto {
    pub cells: std::collections::HashMap<String, String>,
}

#[tauri::command]
pub fn preview_csv_import(db: State<'_, Mutex<Connection>>, csv_content: String) -> Result<Vec<CsvRowDto>, String> {
    let rows = csv_import::parse_csv(&csv_content).map_err(|e| e.to_string())?;

    let conn = db.lock().map_err(|e| e.to_string())?;
    integrations_repo::mark_synced_ok(&conn, "csv_import", &now_iso8601()).map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|cells| CsvRowDto { cells }).collect())
}

#[derive(Debug, Clone, Serialize)]
pub struct CandidateAchievementDto {
    /// `"project"` | `"publication"` | `"certification"`.
    pub kind: String,
    pub title: String,
    pub source_excerpt: String,
}

/// `pdf_base64` is the file's raw bytes, base64-encoded client-side
/// (the browser's `FileReader.readAsDataURL`, stripped of its data-URL
/// prefix) — no new Tauri file-system plugin needed, same approach as
/// `import_calendar_ics`. Extraction only, into `CandidateAchievement`s
/// the person reviews and edits freely before the wizard's Deadlines
/// step ever includes them (§1.5: "extraction always ends in a
/// confirmation step") — the frontend maps whichever candidates the
/// person keeps into `DeadlineInput` (`category = 'research'` for a
/// publication, `'career'` otherwise), the same client-side mapping
/// `import_calendar_ics` already does for its own source shape.
#[tauri::command]
pub fn preview_pdf_import(
    db: State<'_, Mutex<Connection>>,
    pdf_base64: String,
) -> Result<Vec<CandidateAchievementDto>, String> {
    let bytes = decode_base64(&pdf_base64).map_err(|e| format!("invalid base64 payload: {e}"))?;
    let text = pdf_import::extract_text(&bytes).map_err(|e| e.to_string())?;
    let candidates = pdf_import::extract_candidate_achievements(&text);

    let conn = db.lock().map_err(|e| e.to_string())?;
    integrations_repo::mark_synced_ok(&conn, "pdf_import", &now_iso8601()).map_err(|e| e.to_string())?;

    Ok(candidates
        .into_iter()
        .map(|c| CandidateAchievementDto {
            kind: c.kind.to_string(),
            title: c.title,
            source_excerpt: c.source_excerpt,
        })
        .collect())
}

/// Minimal base64 decoder (standard alphabet, `=` padding) — avoids
/// pulling in the `base64` crate for the one call site this command
/// needs (Implementation Plan §4, same reasoning as
/// `athena_ingestion::connectors::github`'s hand-rolled date helper).
fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    fn value(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }

    let cleaned: Vec<u8> = input.bytes().filter(|b| *b != b'\n' && *b != b'\r' && *b != b' ').collect();
    let trimmed: Vec<u8> = cleaned.into_iter().take_while(|b| *b != b'=').collect();

    let mut out = Vec::with_capacity(trimmed.len() * 3 / 4 + 3);
    for chunk in trimmed.chunks(4) {
        let vals: Vec<u8> = chunk
            .iter()
            .map(|b| value(*b).ok_or_else(|| "invalid base64 character".to_string()))
            .collect::<Result<_, _>>()?;
        match vals.len() {
            4 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
                out.push((vals[1] << 4) | (vals[2] >> 2));
                out.push((vals[2] << 6) | vals[3]);
            }
            3 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
                out.push((vals[1] << 4) | (vals[2] >> 2));
            }
            2 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
            }
            _ => return Err("truncated base64 payload".to_string()),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_base64_round_trips_a_known_string() {
        // "hello" -> "aGVsbG8="
        let bytes = decode_base64("aGVsbG8=").unwrap();
        assert_eq!(bytes, b"hello");
    }
}
