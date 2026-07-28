-- V12__course_context.sql
--
-- "Course Context" (Semester Setup reshape): three additive, nullable
-- columns on `courses` so a course can carry more than metadata —
-- free-text notes, extracted syllabus text, and a structured grading
-- breakdown. None of these are required to commit a semester (same
-- `canCommit` rule in SemesterSetup stays: 1 course or 1 deadline).
--
-- Plain ALTER TABLE ADD COLUMN is enough here — unlike V5/V11's
-- `data_sources` rebuild, none of these three add a CHECK constraint,
-- so SQLite's normal ADD COLUMN path applies.

ALTER TABLE courses ADD COLUMN notes TEXT;

-- Raw extracted text of an uploaded syllabus PDF. Reference material
-- only — never auto-parsed into grading_breakdown (a wrong
-- auto-extracted weighting is worse than none); the person types
-- grading_breakdown in themselves, syllabus_text just sits alongside
-- it for their own reading/search.
ALTER TABLE courses ADD COLUMN syllabus_text TEXT;

-- JSON array of {"category": string, "weight": number}. Weights are
-- validated to sum to 100 in the UI before commit, not enforced here —
-- SQLite CHECK constraints can't easily aggregate over a JSON array's
-- contents, and the UI is the only writer of this column.
ALTER TABLE courses ADD COLUMN grading_breakdown TEXT;
