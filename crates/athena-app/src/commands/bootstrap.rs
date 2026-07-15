//! The one read command every screen boots from. Per
//! 01_ARCHITECTURE.md §2.1 (the canonical read path), this is a thin
//! translation of IPC -> repository calls -> typed response; no
//! transformation of domain meaning happens here beyond the one
//! deterministic call into `athena_domain::priority`.

use std::sync::Mutex;

use athena_data::repositories::{course, deadline, decision, profile, semester};
use athena_domain::priority::{self, DeadlineCandidate};
use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

/// Mirrors `athena_domain::priority::RankedCandidate` (see `VerdictDto`'s
/// own doc comment for why this mapping happens here rather than via
/// `Serialize` on the domain type itself).
#[derive(Debug, Clone, Serialize)]
pub struct RankedCandidateDto {
    pub id: i64,
    pub headline: String,
    pub reasoning: String,
}

/// Mirrors `athena_domain::priority::Verdict`, mapped to owned strings
/// for serialization — `athena-domain` deliberately takes no
/// third-party dependencies (including serde), per its Cargo.toml, so
/// this mapping happens here rather than by deriving `Serialize` on the
/// domain type itself.
#[derive(Debug, Clone, Serialize)]
pub struct VerdictDto {
    pub headline: String,
    pub reasoning: String,
    pub confidence: String,
    pub grounded_in_deadline_id: Option<i64>,
    /// Populated only when the Closeness Threshold trips
    /// (09_DECISION_ENGINE.md §4) — see `Now`'s `VerdictCard`.
    pub runners_up: Vec<RankedCandidateDto>,
}

/// Everything the frontend needs to render `Now`, `Trajectory`,
/// `Decision Log`, and to decide whether onboarding is required
/// (03_ONBOARDING.md §1) — one IPC round trip, real persisted data,
/// unmodified in shape.
#[derive(Debug, Clone, Serialize)]
pub struct BootstrapState {
    pub has_profile: bool,
    pub profile: Option<profile::ProfileRow>,
    pub current_semester: Option<semester::SemesterRow>,
    pub courses: Vec<course::CourseRow>,
    pub deadlines: Vec<deadline::DeadlineRow>,
    /// Real read model behind Trajectory's "Career threads" section
    /// (04_DATA_MODEL.md §5.2) — `deadlines WHERE category = 'career'`.
    pub career_deadlines: Vec<deadline::DeadlineRow>,
    pub decisions: Vec<decision::DecisionRow>,
    pub verdict: VerdictDto,
}

#[tauri::command]
pub fn get_bootstrap_state(db: State<'_, Mutex<Connection>>) -> Result<BootstrapState, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let has_profile = profile::has_profile(&conn).map_err(|e| e.to_string())?;
    let profile_row = profile::get_current_profile(&conn).map_err(|e| e.to_string())?;
    let current_semester = semester::get_current_semester(&conn).map_err(|e| e.to_string())?;

    let (courses, deadlines) = match &current_semester {
        Some(sem) => (
            course::list_by_semester(&conn, sem.id).map_err(|e| e.to_string())?,
            deadline::list_by_semester(&conn, sem.id).map_err(|e| e.to_string())?,
        ),
        None => (Vec::new(), Vec::new()),
    };

    let career_deadlines = deadline::list_open_career(&conn).map_err(|e| e.to_string())?;
    let decisions = decision::list_recent(&conn, 8).map_err(|e| e.to_string())?;

    let open_deadlines = deadline::list_open(&conn).map_err(|e| e.to_string())?;
    let candidates: Vec<DeadlineCandidate> = open_deadlines
        .iter()
        .map(|d| DeadlineCandidate {
            id: d.id,
            title: d.title.clone(),
            due_at: d.due_at.clone(),
            leverage_class: d.leverage_class.clone(),
        })
        .collect();
    let verdict = priority::resolve_priority(&candidates);
    let verdict_dto = VerdictDto {
        headline: verdict.headline,
        reasoning: verdict.reasoning,
        confidence: match verdict.confidence {
            priority::Confidence::Inferred => "inferred".to_string(),
            priority::Confidence::InsufficientData => "insufficient_data".to_string(),
        },
        grounded_in_deadline_id: verdict.grounded_in_deadline_id,
        runners_up: verdict
            .runners_up
            .into_iter()
            .map(|r| RankedCandidateDto {
                id: r.id,
                headline: r.headline,
                reasoning: r.reasoning,
            })
            .collect(),
    };

    Ok(BootstrapState {
        has_profile,
        profile: profile_row,
        current_semester,
        courses,
        deadlines,
        career_deadlines,
        decisions,
        verdict: verdict_dto,
    })
}
