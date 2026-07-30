-- V14__classroom_materials.sql
--
-- Google Classroom's `courseWorkMaterials` resource — reference
-- material a teacher posts (slides, readings, links, files) that isn't
-- an assignment (no due date, nothing to submit) and isn't an
-- announcement (it's attached course content, not a feed post).
-- Distinct from both `classroom_coursework` and
-- `classroom_announcements`, same one-table-per-Classroom-resource
-- shape those two already use.
--
-- `seen` is what makes "tell me when new material shows up" possible
-- without polling infrastructure beyond what already exists
-- (`scheduler.rs` already ticks `run_google_classroom_sync` every 30
-- minutes while the app is open) — new rows land with `seen = 0`;
-- `mark_classroom_materials_seen` is the only thing that flips it to 1.
-- Re-syncing an already-known `material_id` (the common case — most
-- ticks find nothing new) must NOT reset `seen` back to 0, or
-- previously-viewed material would "become new again" on every sync;
-- `course_log::insert_log`'s "never silently rewrite history" instinct
-- applies here too, just to a boolean instead of a body of text —
-- `upsert_classroom_material` deliberately leaves `seen` out of its
-- `ON CONFLICT ... DO UPDATE SET` clause to guarantee this.

CREATE TABLE classroom_materials (
    material_id     TEXT PRIMARY KEY,
    course_id       TEXT NOT NULL,
    title           TEXT NOT NULL,
    material_type   TEXT,
    posted_at       TEXT,
    fetched_at      TEXT NOT NULL,
    seen            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_classroom_materials_course_id ON classroom_materials(course_id);
