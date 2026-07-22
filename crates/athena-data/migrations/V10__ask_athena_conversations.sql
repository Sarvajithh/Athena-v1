-- V10__ask_athena_conversations.sql
--
-- Turns Ask Athena's persisted history from one flat, unbounded
-- scrollback (V9) into ChatGPT/Gemini-style separate conversations,
-- each identified by `conversation_id`. Purely additive to V9's table
-- (01_ARCHITECTURE.md §6.2) — no row is dropped, every existing row is
-- backfilled into a single `'legacy'` conversation so history from
-- before this migration is still reachable rather than orphaned.
--
-- Deliberately bounded rather than unbounded: keeping every
-- conversation ever had would grow this table without limit
-- ("that is going to take huge memory"). The repository layer
-- (`ask_athena_history::prune_old_conversations`, called after every
-- insert) keeps only the 5 most recently active conversations,
-- deleting older ones' rows outright — same "insert-only, but bounded"
-- shape as nothing else in this schema needing a retention policy yet,
-- because nothing else grows from unbounded free-form chat turns the
-- way this table does.

ALTER TABLE ask_athena_messages
    ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX idx_ask_athena_messages_conversation_id
    ON ask_athena_messages(conversation_id, created_at);
