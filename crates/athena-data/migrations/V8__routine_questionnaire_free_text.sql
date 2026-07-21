-- V8__routine_questionnaire_free_text.sql
--
-- Replaces the 1-5 numeric self-ratings on the daily/weekly routine
-- questionnaires (`energy_level`, `focus_rating`,
-- `overall_energy_trend`, `satisfaction_with_progress`) with free-text
-- reflection fields. A check-in reduced to number sliders reads as a
-- form, not a check-in — the qualitative signal (how the day/week
-- actually went, in the user's own words) is what's worth capturing.
--
-- Confirmed safe to drop rather than keep-and-deprecate: grepped
-- `athena-reasoning` and `athena-events` for all four column names and
-- for any reference to `daily_routine_responses` / `routine` at all —
-- zero hits in either crate. `athena_domain::planner::replan` does not
-- read them either (the V6 migration's own doc comment calls this a
-- "future `replan` call", never wired up). The only readers were
-- `commands::routine` (pass-through) and this table's own repository —
-- both updated alongside this migration. So this is case (a) from the
-- brief: free-text-only is safe, no replacement signal or no-op shim
-- needed.
--
-- `hours_available_tonight` is NOT touched — it's a plain hours
-- estimate, not a 1-5 rating, and it's the one daily field with a real
-- documented future consumer (`available_minutes_tonight`).
--
-- Column drops use SQLite's native `ALTER TABLE ... DROP COLUMN`
-- (supported by the bundled SQLite version behind rusqlite 0.31, which
-- is well past the 3.35.0 floor this needs). This is the one migration
-- in this schema that isn't purely additive (see V2-V7's doc comments
-- for that precedent) — a deliberate, narrow exception: these columns
-- have no readers anywhere in the codebase, so keeping them around as
-- permanently-NULL dead weight would just be schema debt with no
-- upside, unlike V2-V7's additive changes which all preserved live
-- data.

ALTER TABLE daily_routine_responses DROP COLUMN energy_level;
ALTER TABLE daily_routine_responses DROP COLUMN focus_rating;

-- "How'd today go?" — the primary open-ended daily prompt.
ALTER TABLE daily_routine_responses
    ADD COLUMN reflection TEXT NOT NULL DEFAULT '';

ALTER TABLE weekly_routine_responses DROP COLUMN overall_energy_trend;
ALTER TABLE weekly_routine_responses DROP COLUMN satisfaction_with_progress;

-- "What's working, what's not?" — the primary open-ended weekly
-- prompt. `notes` (V6) already covers "anything you want to change
-- going into next week?" so it's reused as-is rather than duplicated.
ALTER TABLE weekly_routine_responses
    ADD COLUMN reflection TEXT NOT NULL DEFAULT '';
