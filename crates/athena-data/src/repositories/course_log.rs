//! `course_logs` repository (V13__course_logs.sql) — a running,
//! timestamped journal per course. See that migration's doc comment
//! for how this differs from `courses.notes` (one standing block vs.
//! an append-only stream of dated entries).

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::DataError;

#[derive(Debug, Clone, Serialize)]
pub struct CourseLogRow {
    pub id: i64,
    pub course_id: i64,
    pub body: String,
    pub created_at: String,
}

fn row_to_log(row: &rusqlite::Row<'_>) -> rusqlite::Result<CourseLogRow> {
    Ok(CourseLogRow {
        id: row.get(0)?,
        course_id: row.get(1)?,
        body: row.get(2)?,
        created_at: row.get(3)?,
    })
}

/// Appends one entry. Never updates an existing row — a log is a
/// diary, not a form field; correcting an entry means adding a new one
/// or deleting the wrong one, not silently rewriting history.
pub fn insert_log(conn: &Connection, course_id: i64, body: &str) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO course_logs (course_id, body) VALUES (?1, ?2)",
        params![course_id, body],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Newest first — a log is read like a diary/activity feed, most
/// recent entry on top, not like a form the person fills in order.
pub fn list_by_course(conn: &Connection, course_id: i64) -> Result<Vec<CourseLogRow>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, course_id, body, created_at FROM course_logs \
         WHERE course_id = ?1 ORDER BY created_at DESC, id DESC",
    )?;
    let rows = stmt
        .query_map(params![course_id], row_to_log)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// `true` if a row existed and was removed — same idempotent-not-fussy
/// contract as `deadline::delete`/`course::delete_cascade`.
pub fn delete_log(conn: &Connection, log_id: i64) -> Result<bool, DataError> {
    let affected = conn.execute("DELETE FROM course_logs WHERE id = ?1", params![log_id])?;
    Ok(affected > 0)
}

/// Deletes every log entry belonging to `course_id` — called from
/// `course::delete_cascade` so a deleted course doesn't leave orphaned
/// log rows behind, same manual-cascade reasoning that function's doc
/// comment already lays out for `deadlines`.
pub fn delete_by_course(conn: &Connection, course_id: i64) -> Result<i64, DataError> {
    let affected = conn.execute("DELETE FROM course_logs WHERE course_id = ?1", params![course_id])?;
    Ok(affected as i64)
}
