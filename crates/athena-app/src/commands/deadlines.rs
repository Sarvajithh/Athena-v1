//! Direct `deadlines` row mutations that don't belong in `onboarding`
//! (which owns *creating* deadlines, in bulk, against a semester) or
//! `integrations` (which owns *extracting* deadline candidates from a
//! connector). This file owns editing one already-existing row.

use std::sync::Mutex;

use athena_data::repositories::deadline::{self, DeadlineRow, DeadlineUpdate};
use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;

/// Fields the Deadlines screen's edit affordance may change. Mirrors
/// `DeadlineUpdate` (`athena_data::repositories::deadline`) field for
/// field; `semester_id`/`id`/`course_id`/`status` are deliberately not
/// here — this command never reassigns a deadline to a different
/// semester or course, and never touches `status` (that's
/// `mark_overdue_as_missed`'s job, folded into `get_bootstrap_state`).
#[derive(Debug, Deserialize)]
pub struct UpdateDeadlineInput {
    pub title: String,
    pub category: String,
    pub due_at: String,
    pub leverage_class: String,
    pub notes: Option<String>,
}

/// Edits one existing deadline's title/category/due_at/leverage_class/
/// notes in place. Matches every other command's `Result<T, String>` +
/// `.map_err(|e| e.to_string())` convention (see `commands::integrations`).
#[tauri::command]
pub fn update_deadline(
    db: State<'_, Mutex<Connection>>,
    id: i64,
    input: UpdateDeadlineInput,
) -> Result<DeadlineRow, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    deadline::update(
        &conn,
        id,
        &DeadlineUpdate {
            title: input.title,
            category: input.category,
            due_at: input.due_at,
            leverage_class: input.leverage_class,
            notes: input.notes,
        },
    )
    .map_err(|e| e.to_string())
}

/// Deletes one deadline outright — the Deadlines screen's "Delete"
/// affordance, next to Feature 1's "Edit." Returns whether a row was
/// actually removed (`false` for an id that was already gone/never
/// existed) rather than erroring, matching `deadline::delete`'s own
/// idempotent contract; the frontend can still choose to surface
/// `false` as "already deleted" if it wants to.
#[tauri::command]
pub fn delete_deadline(db: State<'_, Mutex<Connection>>, id: i64) -> Result<bool, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    deadline::delete(&conn, id).map_err(|e| e.to_string())
}
