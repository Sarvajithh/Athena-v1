-- V15__classroom_material_linking.sql
--
-- Two additions, both in service of "materials should show up under
-- the actual course, not a loose Classroom-named group":
--
-- 1. `courses.classroom_course_id` — an explicit, person-confirmed link
--    from a local `courses` row to the Google Classroom course it
--    corresponds to. Deliberately explicit rather than auto-matched by
--    name/code: course titles/codes on Classroom and in a person's own
--    semester setup are free text typed independently in two different
--    places, and a wrong auto-match (two courses with similar names)
--    would silently show one course's materials under another — worse
--    than just asking the person to pick once. NULL means "not linked
--    yet"; nothing about the sync depends on this being set, materials
--    still sync and are still visible from the standalone Materials
--    tab either way.
--
-- 2. `classroom_materials.studied` — separate from `seen` (V14).
--    `seen` is passive/automatic ("this tab has been opened since this
--    landed"); `studied` is an explicit, person-set "I actually went
--    through this" checkbox. Conflating the two would mean opening the
--    Materials tab silently marks everything as studied, which isn't
--    true and isn't the point of the feature.

ALTER TABLE courses ADD COLUMN classroom_course_id TEXT;
CREATE INDEX idx_courses_classroom_course_id ON courses(classroom_course_id);

ALTER TABLE classroom_materials ADD COLUMN studied INTEGER NOT NULL DEFAULT 0;
