//! The two onboarding commands (03_ONBOARDING.md): Profile creation
//! (§2) and Semester Setup's commit (§3 Step 5). Kept as two separate
//! commands because they are two separate events in the data model —
//! Profile creation writes its own `user_profile_history` row before
//! Semester Setup ever begins, and Semester Setup writes a second one
//! at its own commit (§3 Step 5's generated-on-commit list) — even
//! though, per the framing in §0, the user experiences them as one
//! continuous flow with no visible seam.

use std::sync::Mutex;

use athena_data::repositories::course::{MeetingSlot, NewCourse};
use athena_data::repositories::deadline::NewDeadline;
use athena_data::repositories::disruption::NewDisruption;
use athena_data::repositories::profile::NewProfile;
use athena_data::repositories::{course, deadline, disruption, event_log, profile, semester};
use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;

/// Every field maps directly to a `user_profile` column
/// (03_ONBOARDING.md §2 — "nothing is collected that isn't stored").
#[derive(Debug, Deserialize)]
pub struct CreateProfileInput {
    pub name: String,
    pub institute: String,
    pub program: String,
    pub target_cgpa: f64,
    pub current_cgpa: Option<f64>,
    pub career_target: String,
    pub masters_target: Option<String>,
    pub codeforces_handle: Option<String>,
    pub deep_work_window_start: String,
    pub deep_work_window_end: String,
    pub timezone: String,
}

/// Commits Profile Creation (03_ONBOARDING.md §2, Step 5). Rejected if a
/// profile already exists — "a one-time event that only happens once,
/// ever, per install" (§0).
#[tauri::command]
pub fn create_profile(db: State<'_, Mutex<Connection>>, input: CreateProfileInput) -> Result<i64, String> {
    let mut conn = db.lock().map_err(|e| e.to_string())?;

    if profile::has_profile(&conn).map_err(|e| e.to_string())? {
        return Err("A profile already exists — Profile creation is a one-time step per install.".to_string());
    }

    let new_profile = NewProfile {
        name: input.name,
        institute: input.institute,
        program: input.program,
        target_cgpa: input.target_cgpa,
        current_cgpa: input.current_cgpa,
        career_target: input.career_target,
        masters_target: input.masters_target,
        codeforces_handle: input.codeforces_handle,
        deep_work_window_start: input.deep_work_window_start,
        deep_work_window_end: input.deep_work_window_end,
        timezone: input.timezone,
    };

    profile::create_profile_with_history(&mut conn, &new_profile).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct MeetingSlotInput {
    pub day: String,
    pub start: String,
    pub end: String,
}

#[derive(Debug, Deserialize)]
pub struct CourseInput {
    pub code: String,
    pub title: String,
    pub credits: i64,
    pub leverage_class: String,
    pub instructor: Option<String>,
    pub target_grade: Option<String>,
    pub meeting_pattern: Vec<MeetingSlotInput>,
}

#[derive(Debug, Deserialize)]
pub struct DeadlineInput {
    /// Index into this same request's `courses` array, resolved to the
    /// real `course_id` after courses are inserted (Step 2's "linked
    /// course (optional dropdown of courses just entered in Step 1)").
    pub course_index: Option<usize>,
    pub title: String,
    pub category: String,
    pub due_at: String,
    pub leverage_class: String,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CommitSemesterSetupInput {
    pub label: String,
    pub starts_on: String,
    pub ends_on: String,
    pub courses: Vec<CourseInput>,
    pub deadlines: Vec<DeadlineInput>,
    /// Selects the `user_profile_history.reason` and `event_log.event_type`
    /// per 03_ONBOARDING.md §3 Step 5 / §7.1.
    pub is_first_run: bool,
}

/// Commits Semester Setup (03_ONBOARDING.md §3 Step 5) as a single
/// transaction: one `semesters` row, one `courses` row per course, one
/// `deadlines` row per deadline, one `user_profile_history` row, one
/// `event_log` entry.
#[tauri::command]
pub fn commit_semester_setup(
    db: State<'_, Mutex<Connection>>,
    input: CommitSemesterSetupInput,
) -> Result<i64, String> {
    let mut conn = db.lock().map_err(|e| e.to_string())?;

    let current_profile = profile::get_current_profile(&conn)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Profile creation must complete before Semester Setup.".to_string())?;

    // 03_ONBOARDING.md §3 Step 1/§4 validation summary: at least one
    // course or deadline is required — Athena cannot produce a
    // meaningful verdict with zero grounded data.
    if input.courses.is_empty() && input.deadlines.is_empty() {
        return Err("At least one course or one deadline is required to start a semester.".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let semester_id = semester::create_semester(&tx, &input.label, &input.starts_on, &input.ends_on)
        .map_err(|e| e.to_string())?;

    let new_courses: Vec<NewCourse> = input
        .courses
        .iter()
        .map(|c| NewCourse {
            code: c.code.clone(),
            title: c.title.clone(),
            credits: c.credits,
            leverage_class: c.leverage_class.clone(),
            instructor: c.instructor.clone(),
            target_grade: c.target_grade.clone(),
            meeting_pattern: c
                .meeting_pattern
                .iter()
                .map(|m| MeetingSlot {
                    day: m.day.clone(),
                    start: m.start.clone(),
                    end: m.end.clone(),
                })
                .collect(),
        })
        .collect();
    let course_ids = course::insert_courses(&tx, semester_id, &new_courses).map_err(|e| e.to_string())?;

    let new_deadlines: Vec<NewDeadline> = input
        .deadlines
        .iter()
        .map(|d| NewDeadline {
            course_id: d.course_index.and_then(|i| course_ids.get(i).copied()),
            title: d.title.clone(),
            category: d.category.clone(),
            due_at: d.due_at.clone(),
            leverage_class: d.leverage_class.clone(),
            notes: d.notes.clone(),
        })
        .collect();
    deadline::insert_deadlines(&tx, semester_id, &new_deadlines).map_err(|e| e.to_string())?;

    profile::set_current_semester(&tx, current_profile.id, semester_id).map_err(|e| e.to_string())?;

    let reason = if input.is_first_run { "onboarding" } else { "semester_rollover" };
    profile::record_semester_setup_history(&tx, &current_profile, semester_id, reason)
        .map_err(|e| e.to_string())?;

    let event_type = if input.is_first_run { "SemesterCreated" } else { "SemesterRolledOver" };
    event_log::insert_event(&tx, event_type, &serde_json::json!({ "semester_id": semester_id }))
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(semester_id)
}

/// A single course, added to the *current* semester outside of the
/// full Semester Setup commit — the Semester screen's "Add course"
/// action (semester workflow reform brief, Part 1, item 2). Reuses
/// `course::insert_courses` (unchanged) inside its own one-row
/// transaction; no new insert logic, just a narrower entry point than
/// `commit_semester_setup`'s "one or more courses at semester-start"
/// shape.
#[tauri::command]
pub fn add_course_to_semester(db: State<'_, Mutex<Connection>>, input: CourseInput) -> Result<i64, String> {
    let mut conn = db.lock().map_err(|e| e.to_string())?;

    let current_semester = semester::get_current_semester(&conn)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active semester — start a semester before adding a course.".to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let new_course = NewCourse {
        code: input.code,
        title: input.title,
        credits: input.credits,
        leverage_class: input.leverage_class,
        instructor: input.instructor,
        target_grade: input.target_grade,
        meeting_pattern: input
            .meeting_pattern
            .into_iter()
            .map(|m| MeetingSlot {
                day: m.day,
                start: m.start,
                end: m.end,
            })
            .collect(),
    };

    let ids = course::insert_courses(&tx, current_semester.id, &[new_course]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ids[0])
}

/// One normalized deadline candidate, produced client-side from a
/// connector's already-synced snapshot rows (`list_gmail_messages`,
/// `list_classroom_coursework`, `list_classroom_announcements`,
/// `list_notion_pages` — Semester screen's "Pull deadlines" action).
/// This command does no connector/sync work of its own; it is the same
/// "land in `deadlines`" step `commit_semester_setup` already does for
/// hand-typed rows, reused for connector-sourced ones instead.
#[derive(Debug, Deserialize)]
pub struct DeadlineCandidateInput {
    pub course_id: Option<i64>,
    pub title: String,
    pub category: String,
    pub due_at: String,
    pub leverage_class: String,
    pub notes: Option<String>,
}

/// Inserts one or more pulled/normalized deadlines against the
/// *current* semester in a single transaction. Returns the new
/// `deadlines.id` values in the same order as `candidates`.
#[tauri::command]
pub fn add_deadlines_to_semester(
    db: State<'_, Mutex<Connection>>,
    candidates: Vec<DeadlineCandidateInput>,
) -> Result<Vec<i64>, String> {
    let mut conn = db.lock().map_err(|e| e.to_string())?;

    let current_semester = semester::get_current_semester(&conn)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active semester — start a semester before adding deadlines.".to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let new_deadlines: Vec<NewDeadline> = candidates
        .into_iter()
        .map(|c| NewDeadline {
            course_id: c.course_id,
            title: c.title,
            category: c.category,
            due_at: c.due_at,
            leverage_class: c.leverage_class,
            notes: c.notes,
        })
        .collect();

    let ids = deadline::insert_deadlines(&tx, current_semester.id, &new_deadlines).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ids)
}

/// Semester → Advanced → "Seed sample data" (dev/demo convenience, not
/// part of any user-facing onboarding flow). Inserts one sample
/// semester, a handful of courses across leverage classes, deadlines
/// across every `DeadlineCategory` (including `career`, so the new
/// Career tab has something to show immediately), and two schedule
/// disruptions — entirely through the same repositories every other
/// command in this file already uses (`semester::create_semester`,
/// `course::insert_courses`, `deadline::insert_deadlines`,
/// `disruption::insert_disruption`). No new schema, no new repository
/// function, and the Adaptive Planner and Priority Resolution
/// (`athena-domain`) consume the resulting rows exactly as if a real
/// user had entered them — this exists purely so the planner can be
/// exercised end-to-end without hand-filling a semester first.
///
/// Requires a Profile to already exist (same precondition
/// `commit_semester_setup` has) — it creates a *new* semester (and
/// therefore supersedes whatever semester was previously current,
/// same single-active-semester rule every other semester-creating
/// command follows) rather than writing into an existing one, so it's
/// always safe to call and never silently merges with real data.
#[tauri::command]
pub fn seed_sample_data(db: State<'_, Mutex<Connection>>) -> Result<i64, String> {
    let mut conn = db.lock().map_err(|e| e.to_string())?;

    let current_profile = profile::get_current_profile(&conn)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Profile creation must complete before seeding sample data.".to_string())?;

    let today = chrono::Local::now().date_naive();
    let starts_on = (today - chrono::Duration::days(14)).format("%Y-%m-%d").to_string();
    let ends_on = (today + chrono::Duration::days(90)).format("%Y-%m-%d").to_string();
    let due_in = |days: i64| (today + chrono::Duration::days(days)).format("%Y-%m-%d").to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let semester_id =
        semester::create_semester(&tx, "Sample Semester (seeded)", &starts_on, &ends_on).map_err(|e| e.to_string())?;

    let new_courses = vec![
        NewCourse {
            code: "CS5590".to_string(),
            title: "Statistical Machine Learning".to_string(),
            credits: 4,
            leverage_class: "high".to_string(),
            instructor: Some("Dr. Rao".to_string()),
            target_grade: Some("A".to_string()),
            meeting_pattern: vec![MeetingSlot {
                day: "Mon".to_string(),
                start: "09:00".to_string(),
                end: "10:30".to_string(),
            }],
        },
        NewCourse {
            code: "CS3100".to_string(),
            title: "Operating Systems".to_string(),
            credits: 4,
            leverage_class: "medium".to_string(),
            instructor: Some("Dr. Iyer".to_string()),
            target_grade: Some("A-".to_string()),
            meeting_pattern: vec![MeetingSlot {
                day: "Wed".to_string(),
                start: "11:00".to_string(),
                end: "12:30".to_string(),
            }],
        },
        NewCourse {
            code: "HS2010".to_string(),
            title: "Technical Communication".to_string(),
            credits: 2,
            leverage_class: "low".to_string(),
            instructor: None,
            target_grade: None,
            meeting_pattern: vec![],
        },
    ];
    let course_ids = course::insert_courses(&tx, semester_id, &new_courses).map_err(|e| e.to_string())?;
    let ml_course_id = course_ids.first().copied();
    let os_course_id = course_ids.get(1).copied();

    let new_deadlines = vec![
        NewDeadline {
            course_id: ml_course_id,
            title: "SML Assignment 2 — gradient boosting".to_string(),
            category: "academic".to_string(),
            due_at: due_in(3),
            leverage_class: "high".to_string(),
            notes: Some("Kaggle-style leaderboard submission".to_string()),
        },
        NewDeadline {
            course_id: os_course_id,
            title: "OS Project Milestone 1 — scheduler".to_string(),
            category: "academic".to_string(),
            due_at: due_in(7),
            leverage_class: "medium".to_string(),
            notes: None,
        },
        NewDeadline {
            course_id: None,
            title: "Placement — Goldman Sachs SDE, application deadline".to_string(),
            category: "career".to_string(),
            due_at: due_in(10),
            leverage_class: "high".to_string(),
            notes: Some("Referral submitted".to_string()),
        },
        NewDeadline {
            course_id: None,
            title: "MS applications — SOP first draft".to_string(),
            category: "career".to_string(),
            due_at: due_in(30),
            leverage_class: "medium".to_string(),
            notes: Some("Target: CMU, UIUC, Georgia Tech".to_string()),
        },
        NewDeadline {
            course_id: None,
            title: "Weekly DSA sheet — dynamic programming".to_string(),
            category: "dsa".to_string(),
            due_at: due_in(2),
            leverage_class: "medium".to_string(),
            notes: None,
        },
        NewDeadline {
            course_id: None,
            title: "Reading group — paper presentation".to_string(),
            category: "research".to_string(),
            due_at: due_in(14),
            leverage_class: "low".to_string(),
            notes: None,
        },
    ];
    deadline::insert_deadlines(&tx, semester_id, &new_deadlines).map_err(|e| e.to_string())?;

    disruption::insert_disruption(
        &tx,
        &NewDisruption {
            semester_id,
            date: due_in(-1),
            disruption_type: "illness".to_string(),
            duration_minutes: 240,
            affects_deep_work_window: true,
            linked_deadline_id: None,
            note: Some("Seeded sample disruption — half-day sick.".to_string()),
        },
    )
    .map_err(|e| e.to_string())?;
    disruption::insert_disruption(
        &tx,
        &NewDisruption {
            semester_id,
            date: due_in(1),
            disruption_type: "surprise_workload".to_string(),
            duration_minutes: 120,
            affects_deep_work_window: false,
            linked_deadline_id: None,
            note: Some("Seeded sample disruption — unplanned TA request.".to_string()),
        },
    )
    .map_err(|e| e.to_string())?;

    profile::set_current_semester(&tx, current_profile.id, semester_id).map_err(|e| e.to_string())?;
    profile::record_semester_setup_history(&tx, &current_profile, semester_id, "sample_data_seed")
        .map_err(|e| e.to_string())?;
    event_log::insert_event(&tx, "SampleDataSeeded", &serde_json::json!({ "semester_id": semester_id }))
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(semester_id)
}
