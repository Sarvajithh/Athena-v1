//! `courses` repository (04_DATA_MODEL.md §2).

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::DataError;

/// A single weekly meeting time, stored as JSON on `courses.meeting_pattern`
/// (04_DATA_MODEL.md §2 — a fixed attribute of the course, not a
/// separate time-series table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSlot {
    pub day: String,
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CourseRow {
    pub id: i64,
    pub semester_id: i64,
    pub code: String,
    pub title: String,
    pub credits: i64,
    pub leverage_class: String,
    pub instructor: Option<String>,
    pub target_grade: Option<String>,
    pub meeting_pattern: Vec<MeetingSlot>,
    pub status: String,
    pub created_at: String,
}

/// Fields collected by Semester Setup Step 1 (03_ONBOARDING.md §3 Step 1).
#[derive(Debug, Clone)]
pub struct NewCourse {
    pub code: String,
    pub title: String,
    pub credits: i64,
    pub leverage_class: String,
    pub instructor: Option<String>,
    pub target_grade: Option<String>,
    pub meeting_pattern: Vec<MeetingSlot>,
}

fn row_to_course(row: &rusqlite::Row<'_>) -> rusqlite::Result<CourseRow> {
    let meeting_pattern_json: Option<String> = row.get(8)?;
    let meeting_pattern = meeting_pattern_json
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    Ok(CourseRow {
        id: row.get(0)?,
        semester_id: row.get(1)?,
        code: row.get(2)?,
        title: row.get(3)?,
        credits: row.get(4)?,
        leverage_class: row.get(5)?,
        instructor: row.get(6)?,
        target_grade: row.get(7)?,
        meeting_pattern,
        status: row.get(9)?,
        created_at: row.get(10)?,
    })
}

pub fn list_by_semester(conn: &Connection, semester_id: i64) -> Result<Vec<CourseRow>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, semester_id, code, title, credits, leverage_class, instructor, target_grade, \
         meeting_pattern, status, created_at FROM courses WHERE semester_id = ?1 ORDER BY id",
    )?;
    let rows = stmt
        .query_map(params![semester_id], row_to_course)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Inserts every course entered in Semester Setup Step 1, inside an
/// already-open transaction (see `semester::create_semester`).
pub fn insert_courses(
    tx: &rusqlite::Transaction<'_>,
    semester_id: i64,
    courses: &[NewCourse],
) -> Result<Vec<i64>, DataError> {
    let mut ids = Vec::with_capacity(courses.len());
    for course in courses {
        let meeting_pattern_json = serde_json::to_string(&course.meeting_pattern)?;

        tx.execute(
            "INSERT INTO courses (semester_id, code, title, credits, leverage_class, instructor, \
             target_grade, meeting_pattern, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active')",
            params![
                semester_id,
                course.code,
                course.title,
                course.credits,
                course.leverage_class,
                course.instructor,
                course.target_grade,
                meeting_pattern_json,
            ],
        )?;
        ids.push(tx.last_insert_rowid());
    }
    Ok(ids)
}

/// How many deadlines currently reference `course_id` — read before
/// deleting a course so the caller can surface an honest count in a
/// confirm prompt ("this will also delete N linked deadlines") rather
/// than deleting blind.
pub fn count_linked_deadlines(conn: &Connection, course_id: i64) -> Result<i64, DataError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deadlines WHERE course_id = ?1",
        params![course_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Deletes one course and every deadline that references it
/// (`deadlines.course_id`). Cascade, not unlink: nothing in this schema
/// enforces the `REFERENCES courses(id)` FK at the SQLite level (no
/// `PRAGMA foreign_keys = ON` anywhere in `connection.rs`), so a plain
/// `DELETE FROM courses` alone would leave orphaned `course_id` values
/// behind rather than erroring — cascading explicitly here is what
/// keeps the row honest, and matches student intent ("this course is
/// gone, so is its stuff") rather than silently detaching deadlines
/// from a course that no longer exists. Both deletes happen in one
/// transaction so a failure partway through never leaves the course
/// gone with its deadlines still around, or vice versa. Returns
/// `(course_deleted, deadlines_deleted)`; `false`/`0` if `id` didn't
/// exist, same idempotent-not-fussy contract as `deadline::delete`.
pub fn delete_cascade(conn: &mut Connection, course_id: i64) -> Result<(bool, i64), DataError> {
    let tx = conn.transaction()?;
    let deadlines_deleted =
        tx.execute("DELETE FROM deadlines WHERE course_id = ?1", params![course_id])? as i64;
    let course_deleted = tx.execute("DELETE FROM courses WHERE id = ?1", params![course_id])? > 0;
    tx.commit()?;
    Ok((course_deleted, deadlines_deleted))
}

/// Same normalization `deadline::search` uses — duplicated rather than
/// shared across crate-internal repository modules to keep each
/// repository file self-contained (this crate's existing convention:
/// no `repositories::util` grab-bag module exists, and a two-line
/// string helper doesn't justify starting one).
fn normalize_for_search(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last_was_space = false;
    for ch in text.to_lowercase().chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            last_was_space = false;
        } else if !last_was_space {
            out.push(' ');
            last_was_space = true;
        }
    }
    out.trim().to_string()
}

/// Ask Athena rebuild Part 1's `get_course` tool: accepts either an
/// exact-ish course code ("CS5590") or a fuzzy name fragment
/// ("machine learning class"), matching whichever one the student
/// actually typed. Tries an exact (normalized) code match first —
/// codes are short and usually typed correctly — then falls back to
/// the same substring/word-overlap matching `deadline::search` uses
/// against `title`. Returns at most one row: a "get" tool, not a
/// "list" tool, so the first (best) match is what's returned; `None`
/// if nothing matches well enough to be worth guessing.
pub fn find_fuzzy(conn: &Connection, identifier: &str) -> Result<Option<CourseRow>, DataError> {
    let normalized_identifier = normalize_for_search(identifier);
    if normalized_identifier.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT id, semester_id, code, title, credits, leverage_class, instructor, target_grade, \
         meeting_pattern, status, created_at FROM courses",
    )?;
    let all: Vec<CourseRow> = stmt.query_map([], row_to_course)?.collect::<Result<Vec<_>, _>>()?;

    // Exact (normalized) code match first.
    if let Some(row) = all
        .iter()
        .find(|c| normalize_for_search(&c.code) == normalized_identifier)
    {
        return Ok(Some(row.clone()));
    }

    let identifier_words: std::collections::HashSet<&str> = normalized_identifier.split(' ').collect();
    let mut best: Option<(i64, &CourseRow)> = None;
    for row in &all {
        let normalized_title = normalize_for_search(&row.title);
        let score = if normalized_title.contains(&normalized_identifier) {
            1000
        } else {
            let title_words: std::collections::HashSet<&str> = normalized_title.split(' ').collect();
            identifier_words.intersection(&title_words).count() as i64
        };
        if score > 0 && best.as_ref().map(|(best_score, _)| score > *best_score).unwrap_or(true) {
            best = Some((score, row));
        }
    }
    Ok(best.map(|(_, row)| row.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::open_and_migrate;
    use crate::repositories::semester;
    use tempfile::NamedTempFile;

    #[test]
    fn insert_and_list_courses() {
        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        insert_courses(
            &tx,
            semester_id,
            &[NewCourse {
                code: "CS5590".into(),
                title: "Statistical Machine Learning".into(),
                credits: 4,
                leverage_class: "high".into(),
                instructor: None,
                target_grade: None,
                meeting_pattern: vec![],
            }],
        )
        .unwrap();
        tx.commit().unwrap();

        let courses = list_by_semester(&conn, semester_id).unwrap();
        assert_eq!(courses.len(), 1);
        assert_eq!(courses[0].code, "CS5590");
    }

    #[test]
    fn find_fuzzy_matches_exact_code_then_falls_back_to_title_words() {
        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        insert_courses(
            &tx,
            semester_id,
            &[NewCourse {
                code: "CS5590".into(),
                title: "Statistical Machine Learning".into(),
                credits: 4,
                leverage_class: "high".into(),
                instructor: None,
                target_grade: None,
                meeting_pattern: vec![],
            }],
        )
        .unwrap();
        tx.commit().unwrap();

        let by_code = find_fuzzy(&conn, "cs5590").unwrap();
        assert_eq!(by_code.unwrap().code, "CS5590");

        let by_name = find_fuzzy(&conn, "machine learning class").unwrap();
        assert_eq!(by_name.unwrap().code, "CS5590");

        let no_match = find_fuzzy(&conn, "underwater basket weaving").unwrap();
        assert!(no_match.is_none());
    }

    #[test]
    fn delete_cascade_removes_course_and_its_linked_deadlines() {
        use crate::repositories::deadline;

        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        let course_ids = insert_courses(
            &tx,
            semester_id,
            &[NewCourse {
                code: "CS5590".into(),
                title: "Statistical Machine Learning".into(),
                credits: 4,
                leverage_class: "high".into(),
                instructor: None,
                target_grade: None,
                meeting_pattern: vec![],
            }],
        )
        .unwrap();
        let course_id = course_ids[0];
        deadline::insert_deadlines(
            &tx,
            semester_id,
            &[
                deadline::NewDeadline {
                    course_id: Some(course_id),
                    title: "Assignment 1".into(),
                    category: "academic".into(),
                    due_at: "2026-08-10T23:59:00".into(),
                    leverage_class: "high".into(),
                    notes: None,
                },
                deadline::NewDeadline {
                    course_id: Some(course_id),
                    title: "Assignment 2".into(),
                    category: "academic".into(),
                    due_at: "2026-08-20T23:59:00".into(),
                    leverage_class: "high".into(),
                    notes: None,
                },
                deadline::NewDeadline {
                    course_id: None,
                    title: "Unrelated deadline".into(),
                    category: "career".into(),
                    due_at: "2026-08-25T23:59:00".into(),
                    leverage_class: "medium".into(),
                    notes: None,
                },
            ],
        )
        .unwrap();
        tx.commit().unwrap();

        assert_eq!(count_linked_deadlines(&conn, course_id).unwrap(), 2);

        let (course_deleted, deadlines_deleted) = delete_cascade(&mut conn, course_id).unwrap();
        assert!(course_deleted);
        assert_eq!(deadlines_deleted, 2);

        assert_eq!(list_by_semester(&conn, semester_id).unwrap().len(), 0);
        // The unrelated deadline (no course_id) survives the cascade.
        assert_eq!(deadline::list_by_semester(&conn, semester_id).unwrap().len(), 1);

        // Idempotent: deleting an already-gone course id is not an error.
        let (course_deleted_again, deadlines_deleted_again) =
            delete_cascade(&mut conn, course_id).unwrap();
        assert!(!course_deleted_again);
        assert_eq!(deadlines_deleted_again, 0);
    }
}
