-- V13__course_logs.sql
--
-- "Course Log" — a running, timestamped journal per course, distinct
-- from `courses.notes` (V12). `notes` is one editable block of
-- standing context about the course as a whole ("participation-heavy,
-- prof grades the midterm hard"); a log is an append-only stream of
-- dated entries ("missed lecture 7/29, need notes from Priya",
-- "quiz moved to next Monday") — the shape a busy, not-always-
-- organized student actually reaches for over the course of a
-- semester, closer to a diary than a settings field.
--
-- No `ON DELETE CASCADE` here, matching this schema's existing
-- convention (see `course::delete_cascade`'s doc comment — no table in
-- this database enforces FKs at the SQLite level; `PRAGMA foreign_keys`
-- is never turned on in `connection.rs`). Deleting a course's logs
-- alongside the course itself is handled in application code instead,
-- the same place `deadlines` cascade already lives.

CREATE TABLE course_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL REFERENCES courses(id),
    body        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Every read of this table is "logs for one course, newest first"
-- (`course_log::list_by_course`) — this index is what keeps that fast
-- as a semester's log entries accumulate.
CREATE INDEX idx_course_logs_course_id ON course_logs(course_id);
