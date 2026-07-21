//! `ask_athena_messages` repository (V9 migration). Persists Ask
//! Athena's chat scrollback across sessions — insert-only, one row per
//! bubble (both `role: 'user'` and `role: 'athena'` turns), mirroring
//! `repositories::routine`'s own insert/list-recent shape (no update,
//! no delete; a chat transcript is never edited in place).

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::DataError;

#[derive(Debug, Clone, Serialize)]
pub struct AskAthenaMessageRow {
    pub id: i64,
    /// `"user"` or `"athena"` — enforced at the schema level by V9's
    /// `CHECK (role IN ('user', 'athena'))`.
    pub role: String,
    pub text: String,
    /// `Recommendation::source` (`athena-reasoning/src/output.rs`) —
    /// `None` for `role: "user"` rows, since only Athena's own replies
    /// carry provenance.
    pub source: Option<String>,
    /// `Recommendation::confidence` — same "only on athena rows" rule
    /// as `source`.
    pub confidence: Option<String>,
    pub created_at: String,
}

/// Fields needed to insert one chat-history row.
#[derive(Debug, Clone)]
pub struct NewAskAthenaMessage {
    pub role: String,
    pub text: String,
    pub source: Option<String>,
    pub confidence: Option<String>,
}

const SELECT_COLUMNS: &str = "id, role, text, source, confidence, created_at";

fn row_to_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<AskAthenaMessageRow> {
    Ok(AskAthenaMessageRow {
        id: row.get(0)?,
        role: row.get(1)?,
        text: row.get(2)?,
        source: row.get(3)?,
        confidence: row.get(4)?,
        created_at: row.get(5)?,
    })
}

/// Inserts one chat-history row (a user turn or an Athena turn).
pub fn insert_message(conn: &Connection, new: &NewAskAthenaMessage) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO ask_athena_messages (role, text, source, confidence) VALUES (?1, ?2, ?3, ?4)",
        params![new.role, new.text, new.source, new.confidence],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Most recent messages, oldest first — the order a chat scrollback is
/// rendered in. (Fetches newest-first via `LIMIT`, then reverses, so
/// "most recent `limit`" and "chronological" are both satisfied without
/// a second query.)
pub fn list_recent_messages(conn: &Connection, limit: i64) -> Result<Vec<AskAthenaMessageRow>, DataError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM ask_athena_messages ORDER BY created_at DESC, id DESC LIMIT ?1"
    ))?;
    let mut rows = stmt
        .query_map(params![limit], row_to_message)?
        .collect::<Result<Vec<_>, _>>()?;
    rows.reverse();
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::open_and_migrate;
    use tempfile::NamedTempFile;

    #[test]
    fn insert_and_list_messages_oldest_first() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        insert_message(
            &conn,
            &NewAskAthenaMessage {
                role: "user".into(),
                text: "what should I prioritize?".into(),
                source: None,
                confidence: None,
            },
        )
        .unwrap();

        insert_message(
            &conn,
            &NewAskAthenaMessage {
                role: "athena".into(),
                text: "Work on X first.".into(),
                source: Some("gemini".into()),
                confidence: Some("insufficient_data".into()),
            },
        )
        .unwrap();

        let messages = list_recent_messages(&conn, 50).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].source, None);
        assert_eq!(messages[1].role, "athena");
        assert_eq!(messages[1].source.as_deref(), Some("gemini"));
    }

    #[test]
    fn list_recent_messages_respects_limit_and_stays_chronological() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        for i in 0..5 {
            insert_message(
                &conn,
                &NewAskAthenaMessage {
                    role: "user".into(),
                    text: format!("message {i}"),
                    source: None,
                    confidence: None,
                },
            )
            .unwrap();
        }

        let messages = list_recent_messages(&conn, 3).unwrap();
        assert_eq!(messages.len(), 3);
        // The 3 most recent, still oldest-first: messages 2, 3, 4.
        assert_eq!(messages[0].text, "message 2");
        assert_eq!(messages[1].text, "message 3");
        assert_eq!(messages[2].text, "message 4");
    }
}
