//! `ask_athena_messages` repository (V9 migration, extended by V10 with
//! `conversation_id`). Persists Ask Athena's chat history across
//! sessions as separate conversations, ChatGPT/Gemini-style, rather
//! than one flat scrollback — insert-only per row (both `role: 'user'`
//! and `role: 'athena'` turns), but bounded to the 5 most recently
//! active conversations: `prune_old_conversations` deletes everything
//! outside that window after every insert, so this table can never
//! grow without limit the way an unbounded chat log would.

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::DataError;

#[derive(Debug, Clone, Serialize)]
pub struct AskAthenaMessageRow {
    pub id: i64,
    pub conversation_id: String,
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

/// One entry in the recent-conversations list — everything the
/// frontend needs to render a "Recent chats" picker without fetching
/// every message up front.
#[derive(Debug, Clone, Serialize)]
pub struct ConversationSummaryRow {
    pub conversation_id: String,
    /// The first `role: 'user'` message's text, truncated — a short,
    /// human-recognizable label, same idea as every other chat product
    /// titling a thread from its opening line rather than asking the
    /// user to name it.
    pub title: String,
    pub last_message_at: String,
    pub message_count: i64,
}

/// Fields needed to insert one chat-history row.
#[derive(Debug, Clone)]
pub struct NewAskAthenaMessage {
    pub conversation_id: String,
    pub role: String,
    pub text: String,
    pub source: Option<String>,
    pub confidence: Option<String>,
}

/// How many conversations to retain — "just store recent 5 chats."
/// A `const` rather than a caller-supplied parameter everywhere: every
/// call site in this codebase wants the same number, so this matches
/// `provider.rs`'s own precedent of a fixed retry/limit constant rather
/// than threading a magic number through every layer.
pub const MAX_RETAINED_CONVERSATIONS: i64 = 5;

const SELECT_COLUMNS: &str = "id, conversation_id, role, text, source, confidence, created_at";

fn row_to_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<AskAthenaMessageRow> {
    Ok(AskAthenaMessageRow {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        text: row.get(3)?,
        source: row.get(4)?,
        confidence: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// Inserts one chat-history row (a user turn or an Athena turn), then
/// prunes down to [`MAX_RETAINED_CONVERSATIONS`]. Pruning runs on every
/// insert rather than on a schedule: it's a single indexed
/// `DELETE ... NOT IN (...)`, cheap enough that a per-message call is
/// simpler than standing up a separate cleanup task, and it means the
/// table is never even briefly over the cap between messages.
pub fn insert_message(conn: &Connection, new: &NewAskAthenaMessage) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO ask_athena_messages (conversation_id, role, text, source, confidence) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![new.conversation_id, new.role, new.text, new.source, new.confidence],
    )?;
    let id = conn.last_insert_rowid();
    prune_old_conversations(conn, MAX_RETAINED_CONVERSATIONS)?;
    Ok(id)
}

/// Deletes every row belonging to a conversation outside the `keep`
/// most recently active ones (by each conversation's own latest
/// `created_at`). A conversation with zero messages left after this
/// simply doesn't exist as far as `list_conversations` is concerned —
/// there is nothing else to clean up.
pub fn prune_old_conversations(conn: &Connection, keep: i64) -> Result<(), DataError> {
    conn.execute(
        "DELETE FROM ask_athena_messages WHERE conversation_id NOT IN ( \
             SELECT conversation_id FROM ask_athena_messages \
             GROUP BY conversation_id \
             ORDER BY MAX(created_at) DESC \
             LIMIT ?1 \
         )",
        params![keep],
    )?;
    Ok(())
}

/// The most recently active conversations, most recent first — the
/// list a "Recent chats" picker renders. Bounded by
/// [`MAX_RETAINED_CONVERSATIONS`] already (pruning keeps the table
/// itself that small), but `limit` still guards against the interval
/// between "app upgraded, V10 ran" and "the next insert prunes" ever
/// returning more than the frontend asked for.
pub fn list_conversations(conn: &Connection, limit: i64) -> Result<Vec<ConversationSummaryRow>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT conversation_id, \
                (SELECT text FROM ask_athena_messages m2 \
                 WHERE m2.conversation_id = m.conversation_id AND m2.role = 'user' \
                 ORDER BY m2.created_at, m2.id LIMIT 1) AS title, \
                MAX(created_at) AS last_message_at, \
                COUNT(*) AS message_count \
         FROM ask_athena_messages m \
         GROUP BY conversation_id \
         ORDER BY last_message_at DESC \
         LIMIT ?1",
    )?;
    let rows = stmt
        .query_map(params![limit], |row| {
            let raw_title: Option<String> = row.get(1)?;
            const MAX_TITLE_CHARS: usize = 60;
            let title = raw_title
                .filter(|t| !t.trim().is_empty())
                .map(|t| {
                    let trimmed = t.trim();
                    if trimmed.chars().count() > MAX_TITLE_CHARS {
                        let truncated: String = trimmed.chars().take(MAX_TITLE_CHARS).collect();
                        format!("{truncated}…")
                    } else {
                        trimmed.to_string()
                    }
                })
                .unwrap_or_else(|| "New chat".to_string());
            Ok(ConversationSummaryRow {
                conversation_id: row.get(0)?,
                title,
                last_message_at: row.get(2)?,
                message_count: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Deletes every row belonging to one conversation — the "Delete chat"
/// action `AskAthena.tsx` exposes per entry in the "Recent chats" list.
/// Idempotent, same "nothing to remove is still success" precedent as
/// every other delete in this codebase (`keychain::delete_secret`,
/// `disconnect_oauth_source`): deleting an already-gone/never-existed
/// conversation id is not an error.
pub fn delete_conversation(conn: &Connection, conversation_id: &str) -> Result<(), DataError> {
    conn.execute(
        "DELETE FROM ask_athena_messages WHERE conversation_id = ?1",
        params![conversation_id],
    )?;
    Ok(())
}

/// Every message in one conversation, oldest first — the order a chat
/// thread is rendered in. No `limit`: a single conversation's length is
/// already implicitly bounded by normal chat use, unlike the flat
/// scrollback V9 originally had.
pub fn list_messages_for_conversation(
    conn: &Connection,
    conversation_id: &str,
) -> Result<Vec<AskAthenaMessageRow>, DataError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM ask_athena_messages WHERE conversation_id = ?1 \
         ORDER BY created_at, id"
    ))?;
    let rows = stmt
        .query_map(params![conversation_id], row_to_message)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::open_and_migrate;
    use tempfile::NamedTempFile;

    fn new_msg(conversation_id: &str, role: &str, text: &str) -> NewAskAthenaMessage {
        NewAskAthenaMessage {
            conversation_id: conversation_id.into(),
            role: role.into(),
            text: text.into(),
            source: None,
            confidence: None,
        }
    }

    #[test]
    fn insert_and_list_messages_for_one_conversation_oldest_first() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        insert_message(&conn, &new_msg("c1", "user", "what should I prioritize?")).unwrap();
        insert_message(
            &conn,
            &NewAskAthenaMessage {
                conversation_id: "c1".into(),
                role: "athena".into(),
                text: "Work on X first.".into(),
                source: Some("gemini".into()),
                confidence: Some("insufficient_data".into()),
            },
        )
        .unwrap();

        let messages = list_messages_for_conversation(&conn, "c1").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "athena");
        assert_eq!(messages[1].source.as_deref(), Some("gemini"));
    }

    #[test]
    fn list_conversations_titles_from_first_user_message_newest_first() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        insert_message(&conn, &new_msg("c1", "user", "first conversation question")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        insert_message(&conn, &new_msg("c2", "user", "second conversation question")).unwrap();

        let conversations = list_conversations(&conn, 5).unwrap();
        assert_eq!(conversations.len(), 2);
        assert_eq!(conversations[0].conversation_id, "c2");
        assert_eq!(conversations[0].title, "second conversation question");
        assert_eq!(conversations[1].conversation_id, "c1");
    }

    #[test]
    fn only_the_five_most_recently_active_conversations_are_kept() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        for i in 0..7 {
            insert_message(&conn, &new_msg(&format!("c{i}"), "user", "hi")).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let conversations = list_conversations(&conn, 10).unwrap();
        assert_eq!(conversations.len(), 5, "oldest 2 of 7 conversations should have been pruned");
        // Newest first: c6, c5, c4, c3, c2 — c0 and c1 pruned.
        let ids: Vec<_> = conversations.iter().map(|c| c.conversation_id.clone()).collect();
        assert_eq!(ids, vec!["c6", "c5", "c4", "c3", "c2"]);

        assert!(list_messages_for_conversation(&conn, "c0").unwrap().is_empty());
        assert!(list_messages_for_conversation(&conn, "c1").unwrap().is_empty());
    }

    #[test]
    fn an_older_conversation_getting_a_new_message_keeps_it_alive() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        for i in 0..5 {
            insert_message(&conn, &new_msg(&format!("c{i}"), "user", "hi")).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        // c0 is the oldest of the 5 — reply in it, which should refresh
        // its recency and protect it from the next conversation's prune.
        insert_message(&conn, &new_msg("c0", "athena", "reply")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        insert_message(&conn, &new_msg("c5", "user", "a new, 6th conversation")).unwrap();

        let conversations = list_conversations(&conn, 10).unwrap();
        let ids: Vec<_> = conversations.iter().map(|c| c.conversation_id.clone()).collect();
        assert_eq!(ids.len(), 5);
        assert!(ids.contains(&"c0".to_string()), "c0 was touched most recently, should survive");
        assert!(!ids.contains(&"c1".to_string()), "c1 is now the least recently active, should be pruned");
    }

    #[test]
    fn deleting_a_conversation_removes_only_its_own_messages() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        insert_message(&conn, &new_msg("c1", "user", "keep me")).unwrap();
        insert_message(&conn, &new_msg("c2", "user", "delete me")).unwrap();

        delete_conversation(&conn, "c2").unwrap();

        assert!(list_messages_for_conversation(&conn, "c2").unwrap().is_empty());
        assert_eq!(list_messages_for_conversation(&conn, "c1").unwrap().len(), 1);
    }

    #[test]
    fn deleting_a_nonexistent_conversation_is_not_an_error() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();
        assert!(delete_conversation(&conn, "never-existed").is_ok());
    }
}