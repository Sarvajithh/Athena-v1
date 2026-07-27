//! `deadlines` repository (04_DATA_MODEL.md §5).

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::DataError;

#[derive(Debug, Clone, Serialize)]
pub struct DeadlineRow {
    pub id: i64,
    pub semester_id: i64,
    pub course_id: Option<i64>,
    pub title: String,
    pub category: String,
    pub due_at: String,
    pub leverage_class: String,
    pub status: String,
    pub created_at: String,
    pub notes: Option<String>,
}

/// Fields collected by Semester Setup Step 2 (03_ONBOARDING.md §3 Step 2).
#[derive(Debug, Clone)]
pub struct NewDeadline {
    pub course_id: Option<i64>,
    pub title: String,
    pub category: String,
    pub due_at: String,
    pub leverage_class: String,
    pub notes: Option<String>,
}

fn row_to_deadline(row: &rusqlite::Row<'_>) -> rusqlite::Result<DeadlineRow> {
    Ok(DeadlineRow {
        id: row.get(0)?,
        semester_id: row.get(1)?,
        course_id: row.get(2)?,
        title: row.get(3)?,
        category: row.get(4)?,
        due_at: row.get(5)?,
        leverage_class: row.get(6)?,
        status: row.get(7)?,
        created_at: row.get(8)?,
        notes: row.get(9)?,
    })
}

pub fn list_by_semester(conn: &Connection, semester_id: i64) -> Result<Vec<DeadlineRow>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, semester_id, course_id, title, category, due_at, leverage_class, status, \
         created_at, notes FROM deadlines WHERE semester_id = ?1 ORDER BY due_at",
    )?;
    let rows = stmt
        .query_map(params![semester_id], row_to_deadline)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Every open deadline across all semesters, most urgent first — the
/// evidence Priority Resolution reads (01_ARCHITECTURE.md §3.2 Stage 1).
pub fn list_open(conn: &Connection) -> Result<Vec<DeadlineRow>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, semester_id, course_id, title, category, due_at, leverage_class, status, \
         created_at, notes FROM deadlines WHERE status = 'open' ORDER BY due_at",
    )?;
    let rows = stmt.query_map([], row_to_deadline)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Open, `category = 'career'` deadlines — the real read model behind
/// Trajectory's "Career threads" section (04_DATA_MODEL.md §5.2).
pub fn list_open_career(conn: &Connection) -> Result<Vec<DeadlineRow>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, semester_id, course_id, title, category, due_at, leverage_class, status, \
         created_at, notes FROM deadlines WHERE status = 'open' AND category = 'career' ORDER BY due_at",
    )?;
    let rows = stmt.query_map([], row_to_deadline)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Fields Feature 1's edit affordance is allowed to change — mirrors
/// `UpdateDeadlineInput` (`commands::deadlines`), deliberately excluding
/// `semester_id`/`id` (04_DATA_MODEL.md §5: a deadline never changes
/// which semester it belongs to via this path).
#[derive(Debug, Clone)]
pub struct DeadlineUpdate {
    pub title: String,
    pub category: String,
    pub due_at: String,
    pub leverage_class: String,
    pub notes: Option<String>,
}

/// Updates the editable fields of one existing deadline in place and
/// returns the row as it now stands. `status`/`course_id`/`semester_id`
/// are untouched here — Feature 2's `mark_overdue_as_missed` is the only
/// writer of `status` outside of `insert_deadlines`'s initial `'open'`.
pub fn update(conn: &Connection, id: i64, update: &DeadlineUpdate) -> Result<DeadlineRow, DataError> {
    conn.execute(
        "UPDATE deadlines SET title = ?1, category = ?2, due_at = ?3, leverage_class = ?4, notes = ?5 \
         WHERE id = ?6",
        params![update.title, update.category, update.due_at, update.leverage_class, update.notes, id],
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, semester_id, course_id, title, category, due_at, leverage_class, status, \
         created_at, notes FROM deadlines WHERE id = ?1",
    )?;
    // No dedicated "not found" `DataError` variant exists in this crate
    // (see `error.rs`'s doc comment — only three real variants ship);
    // `QueryReturnedNoRows` folds into `DataError::Connection` like any
    // other `rusqlite::Error` does elsewhere in this file.
    Ok(stmt.query_row(params![id], row_to_deadline)?)
}

/// Flips every `status = 'open'` deadline whose `due_at` has passed to
/// `'missed'` (04_DATA_MODEL.md §5: `missed` is a valid `DeadlineStatus`
/// but nothing previously set it). Returns the ids that were flipped so
/// callers can log/react if useful; comparison happens in SQL against
/// `due_at`'s own `YYYY-MM-DDTHH:MM:SS`-shaped text so no separate
/// "now" argument needs to be threaded in from `athena-app` (this
/// repository, like every other one in this crate, takes no date/time
/// dependency of its own).
pub fn mark_overdue_as_missed(conn: &Connection) -> Result<Vec<i64>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id FROM deadlines WHERE status = 'open' AND due_at < strftime('%Y-%m-%dT%H:%M:%S', 'now')",
    )?;
    let ids: Vec<i64> = stmt.query_map([], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;

    if !ids.is_empty() {
        conn.execute(
            "UPDATE deadlines SET status = 'missed' \
             WHERE status = 'open' AND due_at < strftime('%Y-%m-%dT%H:%M:%S', 'now')",
            [],
        )?;
    }

    Ok(ids)
}

/// Deletes one deadline row outright. Returns whether a row was
/// actually deleted (`false` if `id` didn't exist) rather than erroring
/// on a missing row — same "idempotent, not fussy about already-gone
/// state" reasoning `mark_overdue_as_missed` above already leans on.
pub fn delete(conn: &Connection, id: i64) -> Result<bool, DataError> {
    let affected = conn.execute("DELETE FROM deadlines WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

/// Normalizes text for fuzzy matching: lowercased, punctuation
/// stripped to spaces, whitespace collapsed. Applied to both the
/// stored `title` (via SQL `LOWER`/`REPLACE` is impractical for
/// arbitrary punctuation, so normalization happens on the Rust side
/// against every open row instead — this table is small enough per
/// semester that an in-memory scan is simpler and faster to get right
/// than a matching SQL expression) and the caller's query, so "that
/// postcolonial paper!" matches a stored "Postcolonial Paper" title.
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

/// Fuzzy, substring-based search over every open deadline's title —
/// Ask Athena rebuild Part 1's `search_deadlines` tool. A messy student
/// types "that essay thing" or "postcolonial paper," not the literal
/// stored title, so this normalizes both sides (lowercase, punctuation
/// stripped) and matches on substring containment rather than an exact
/// or SQL `LIKE` match against raw text. Ranks whole-word-overlap
/// matches above pure substring matches so "postcolonial paper"
/// outranks a coincidental substring hit; caps at `limit` rows so a
/// single vague query can't flood the evidence payload. See this
/// module's doc comment (elevation note) for the FTS5/`strsim`
/// upgrade path if this ever proves too literal in practice.
pub fn search(conn: &Connection, query: &str, limit: i64) -> Result<Vec<DeadlineRow>, DataError> {
    let normalized_query = normalize_for_search(query);
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }
    let query_words: std::collections::HashSet<&str> = normalized_query.split(' ').collect();

    let all_open = list_open(conn)?;
    let mut scored: Vec<(i64, DeadlineRow)> = all_open
        .into_iter()
        .filter_map(|row| {
            let normalized_title = normalize_for_search(&row.title);
            if !normalized_title.contains(&normalized_query) {
                // Fall back to whole-word overlap for multi-word
                // queries where the words are out of order or partial
                // ("essay postcolonial" vs. "Postcolonial Essay").
                let title_words: std::collections::HashSet<&str> = normalized_title.split(' ').collect();
                let overlap = query_words.intersection(&title_words).count();
                if overlap == 0 {
                    return None;
                }
                return Some((overlap as i64, row));
            }
            // A direct substring hit outranks any word-overlap score.
            Some((1000 + normalized_title.len() as i64 - normalized_query.len() as i64, row))
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(scored.into_iter().take(limit.max(0) as usize).map(|(_, row)| row).collect())
}

pub fn insert_deadlines(
    tx: &rusqlite::Transaction<'_>,
    semester_id: i64,
    deadlines: &[NewDeadline],
) -> Result<Vec<i64>, DataError> {
    let mut ids = Vec::with_capacity(deadlines.len());
    for deadline in deadlines {
        tx.execute(
            "INSERT INTO deadlines (semester_id, course_id, title, category, due_at, leverage_class, status, notes) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7)",
            params![
                semester_id,
                deadline.course_id,
                deadline.title,
                deadline.category,
                deadline.due_at,
                deadline.leverage_class,
                deadline.notes,
            ],
        )?;
        ids.push(tx.last_insert_rowid());
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::open_and_migrate;
    use crate::repositories::semester;
    use tempfile::NamedTempFile;

    #[test]
    fn insert_and_list_deadlines() {
        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        insert_deadlines(
            &tx,
            semester_id,
            &[NewDeadline {
                course_id: None,
                title: "Test deadline".into(),
                category: "career".into(),
                due_at: "2026-08-10T23:59:00".into(),
                leverage_class: "high".into(),
                notes: None,
            }],
        )
        .unwrap();
        tx.commit().unwrap();

        let deadlines = list_by_semester(&conn, semester_id).unwrap();
        assert_eq!(deadlines.len(), 1);
        let open = list_open(&conn).unwrap();
        assert_eq!(open.len(), 1);
        let career = list_open_career(&conn).unwrap();
        assert_eq!(career.len(), 1);
    }

    #[test]
    fn update_edits_editable_fields_only() {
        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        let ids = insert_deadlines(
            &tx,
            semester_id,
            &[NewDeadline {
                course_id: None,
                title: "Original title".into(),
                category: "academic".into(),
                due_at: "2026-08-10T23:59:00".into(),
                leverage_class: "medium".into(),
                notes: None,
            }],
        )
        .unwrap();
        tx.commit().unwrap();

        let updated = update(
            &conn,
            ids[0],
            &DeadlineUpdate {
                title: "Updated title".into(),
                category: "career".into(),
                due_at: "2026-09-01T12:00:00".into(),
                leverage_class: "high".into(),
                notes: Some("edited".into()),
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Updated title");
        assert_eq!(updated.category, "career");
        assert_eq!(updated.due_at, "2026-09-01T12:00:00");
        assert_eq!(updated.leverage_class, "high");
        assert_eq!(updated.notes.as_deref(), Some("edited"));
        assert_eq!(updated.semester_id, semester_id);
        assert_eq!(updated.status, "open");
    }

    #[test]
    fn mark_overdue_as_missed_flips_only_past_due_open_rows() {
        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        insert_deadlines(
            &tx,
            semester_id,
            &[
                NewDeadline {
                    course_id: None,
                    title: "Long past due".into(),
                    category: "academic".into(),
                    due_at: "2000-01-01T00:00:00".into(),
                    leverage_class: "medium".into(),
                    notes: None,
                },
                NewDeadline {
                    course_id: None,
                    title: "Far future".into(),
                    category: "academic".into(),
                    due_at: "2999-01-01T00:00:00".into(),
                    leverage_class: "medium".into(),
                    notes: None,
                },
            ],
        )
        .unwrap();
        tx.commit().unwrap();

        let flipped = mark_overdue_as_missed(&conn).unwrap();
        assert_eq!(flipped.len(), 1);

        let open = list_open(&conn).unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].title, "Far future");

        // Idempotent: a second sweep finds nothing left to flip.
        let flipped_again = mark_overdue_as_missed(&conn).unwrap();
        assert!(flipped_again.is_empty());
    }

    #[test]
    fn search_matches_a_vague_lowercase_punctuation_stripped_query() {
        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        insert_deadlines(
            &tx,
            semester_id,
            &[
                NewDeadline {
                    course_id: None,
                    title: "Postcolonial Literature Essay".into(),
                    category: "academic".into(),
                    due_at: "2026-08-10T23:59:00".into(),
                    leverage_class: "high".into(),
                    notes: None,
                },
                NewDeadline {
                    course_id: None,
                    title: "DSA practice log".into(),
                    category: "dsa".into(),
                    due_at: "2026-08-11T23:59:00".into(),
                    leverage_class: "low".into(),
                    notes: None,
                },
            ],
        )
        .unwrap();
        tx.commit().unwrap();

        let results = search(&conn, "that essay thing", 5).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Postcolonial Literature Essay");

        let results2 = search(&conn, "postcolonial paper!!", 5).unwrap();
        assert_eq!(results2.len(), 1);
        assert_eq!(results2[0].title, "Postcolonial Literature Essay");

        let no_match = search(&conn, "quantum physics finals", 5).unwrap();
        assert!(no_match.is_empty());
    }

    #[test]
    fn delete_removes_the_row_and_is_idempotent() {
        let tmp = NamedTempFile::new().unwrap();
        let mut conn = open_and_migrate(tmp.path()).unwrap();
        let tx = conn.transaction().unwrap();
        let semester_id = semester::create_semester(&tx, "Monsoon 2026", "2026-07-15", "2026-11-30").unwrap();
        let ids = insert_deadlines(
            &tx,
            semester_id,
            &[NewDeadline {
                course_id: None,
                title: "To be deleted".into(),
                category: "academic".into(),
                due_at: "2026-08-10T23:59:00".into(),
                leverage_class: "medium".into(),
                notes: None,
            }],
        )
        .unwrap();
        tx.commit().unwrap();

        assert!(delete(&conn, ids[0]).unwrap());
        assert_eq!(list_by_semester(&conn, semester_id).unwrap().len(), 0);

        // Deleting an already-gone (or never-existed) id is not an error.
        assert!(!delete(&conn, ids[0]).unwrap());
    }
}
