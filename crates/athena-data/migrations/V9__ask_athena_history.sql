-- V9__ask_athena_history.sql
--
-- Persists Ask Athena chat history across sessions. Purely additive
-- (01_ARCHITECTURE.md §6.2, matching V2-V8's own precedent) — no
-- existing table, column, or row is touched.
--
-- One row per chat bubble (both `role: 'user'` and `role: 'athena'`
-- turns get a row), insert-only, matching `daily_routine_responses` /
-- `weekly_routine_responses`' own append-only shape (V6) rather than a
-- session/thread table — Ask Athena has always been a single
-- unthreaded scrollback (`screens/AskAthena/index.tsx`), so there is
-- no thread concept yet to key rows against.
--
-- `source` / `confidence` mirror `Recommendation::source` /
-- `Recommendation::confidence` (`athena-reasoning/src/output.rs`) and
-- are nullable because a `role: 'user'` row has neither — only
-- `role: 'athena'` rows carry provenance/confidence, same as
-- `ChatMessage.meta` being optional client-side
-- (`screens/AskAthena/index.tsx`).

CREATE TABLE ask_athena_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    role         TEXT    NOT NULL CHECK (role IN ('user', 'athena')),
    text         TEXT    NOT NULL,
    source       TEXT,
    confidence   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_ask_athena_messages_created_at ON ask_athena_messages(created_at);
