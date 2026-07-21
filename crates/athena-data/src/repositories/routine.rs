//! `daily_routine_responses` / `weekly_routine_responses` repository
//! (V6 migration, free-text fields added by V8). Both questionnaires
//! are append-only — see the V6 migration's doc comment for why a
//! resubmission is a new row rather than an upsert.

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::DataError;

#[derive(Debug, Clone, Serialize)]
pub struct DailyRoutineResponseRow {
    pub id: i64,
    pub date: String,
    pub hours_available_tonight: f64,
    pub had_disruption_today: bool,
    pub disruption_note: Option<String>,
    pub reflection: Option<String>,
    pub submitted_at: String,
}

/// Fields collected by the daily questionnaire.
#[derive(Debug, Clone)]
pub struct NewDailyRoutineResponse {
    pub date: String,
    pub hours_available_tonight: f64,
    pub had_disruption_today: bool,
    pub disruption_note: Option<String>,
    pub reflection: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WeeklyRoutineResponseRow {
    pub id: i64,
    pub week_starting: String,
    pub reflection: Option<String>,
    pub hardest_course_id: Option<i64>,
    pub biggest_blocker: Option<String>,
    pub hours_studied_estimate: Option<f64>,
    pub wants_deep_work_adjustment: bool,
    pub notes: Option<String>,
    pub submitted_at: String,
}

/// Fields collected by the weekly questionnaire.
#[derive(Debug, Clone)]
pub struct NewWeeklyRoutineResponse {
    pub week_starting: String,
    pub reflection: Option<String>,
    pub hardest_course_id: Option<i64>,
    pub biggest_blocker: Option<String>,
    pub hours_studied_estimate: Option<f64>,
    pub wants_deep_work_adjustment: bool,
    pub notes: Option<String>,
}

const DAILY_SELECT_COLUMNS: &str = "id, date, hours_available_tonight, \
    had_disruption_today, disruption_note, reflection, submitted_at";

const WEEKLY_SELECT_COLUMNS: &str = "id, week_starting, reflection, hardest_course_id, \
    biggest_blocker, hours_studied_estimate, wants_deep_work_adjustment, notes, submitted_at";

fn row_to_daily(row: &rusqlite::Row<'_>) -> rusqlite::Result<DailyRoutineResponseRow> {
    Ok(DailyRoutineResponseRow {
        id: row.get(0)?,
        date: row.get(1)?,
        hours_available_tonight: row.get(2)?,
        had_disruption_today: row.get::<_, i64>(3)? != 0,
        disruption_note: row.get(4)?,
        reflection: row.get("reflection")?,
        submitted_at: row.get(6)?,
    })
}

fn row_to_weekly(row: &rusqlite::Row<'_>) -> rusqlite::Result<WeeklyRoutineResponseRow> {
    Ok(WeeklyRoutineResponseRow {
        id: row.get(0)?,
        week_starting: row.get(1)?,
        reflection: row.get("reflection")?,
        hardest_course_id: row.get(3)?,
        biggest_blocker: row.get(4)?,
        hours_studied_estimate: row.get(5)?,
        wants_deep_work_adjustment: row.get::<_, i64>(6)? != 0,
        notes: row.get(7)?,
        submitted_at: row.get(8)?,
    })
}

/// Inserts one daily questionnaire response.
pub fn insert_daily_response(
    conn: &Connection,
    new: &NewDailyRoutineResponse,
) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO daily_routine_responses \
         (date, hours_available_tonight, had_disruption_today, disruption_note, reflection) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            new.date,
            new.hours_available_tonight,
            new.had_disruption_today as i64,
            new.disruption_note,
            new.reflection,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Whether a daily response already exists for `date` — used by the
/// frontend's "already answered today" check so the prompt doesn't nag.
pub fn has_response_for_date(conn: &Connection, date: &str) -> Result<bool, DataError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM daily_routine_responses WHERE date = ?1",
        params![date],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Most recent daily responses, newest first.
pub fn list_recent_daily(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<DailyRoutineResponseRow>, DataError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DAILY_SELECT_COLUMNS} FROM daily_routine_responses ORDER BY submitted_at DESC LIMIT ?1"
    ))?;
    let rows = stmt
        .query_map(params![limit], row_to_daily)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Inserts one weekly questionnaire response.
pub fn insert_weekly_response(
    conn: &Connection,
    new: &NewWeeklyRoutineResponse,
) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO weekly_routine_responses \
         (week_starting, reflection, hardest_course_id, \
          biggest_blocker, hours_studied_estimate, wants_deep_work_adjustment, notes) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            new.week_starting,
            new.reflection,
            new.hardest_course_id,
            new.biggest_blocker,
            new.hours_studied_estimate,
            new.wants_deep_work_adjustment as i64,
            new.notes,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Whether a weekly response already exists for `week_starting` (the
/// `YYYY-MM-DD` Monday of that week) — used the same way
/// `has_response_for_date` is, for a once-a-week prompt.
pub fn has_response_for_week(conn: &Connection, week_starting: &str) -> Result<bool, DataError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM weekly_routine_responses WHERE week_starting = ?1",
        params![week_starting],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Most recent weekly responses, newest first.
pub fn list_recent_weekly(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<WeeklyRoutineResponseRow>, DataError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {WEEKLY_SELECT_COLUMNS} FROM weekly_routine_responses ORDER BY submitted_at DESC LIMIT ?1"
    ))?;
    let rows = stmt
        .query_map(params![limit], row_to_weekly)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::open_and_migrate;
    use tempfile::NamedTempFile;

    #[test]
    fn insert_and_list_daily_responses() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        assert!(!has_response_for_date(&conn, "2026-07-18").unwrap());

        insert_daily_response(
            &conn,
            &NewDailyRoutineResponse {
                date: "2026-07-18".into(),
                hours_available_tonight: 2.5,
                had_disruption_today: false,
                disruption_note: None,
                reflection: Some("Solid day, got through the reading.".to_string()),
            },
        )
        .unwrap();

        assert!(has_response_for_date(&conn, "2026-07-18").unwrap());
        let recent = list_recent_daily(&conn, 10).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].reflection, Some("Solid day, got through the reading.".to_string()));
    }

    #[test]
    fn insert_and_list_weekly_responses() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        assert!(!has_response_for_week(&conn, "2026-07-13").unwrap());

        insert_weekly_response(
            &conn,
            &NewWeeklyRoutineResponse {
                week_starting: "2026-07-13".into(),
                reflection: Some("Good momentum on CS, fell behind on Bio.".to_string()),
                hardest_course_id: None,
                biggest_blocker: Some("Too many overlapping deadlines".into()),
                hours_studied_estimate: Some(18.0),
                wants_deep_work_adjustment: true,
                notes: None,
            },
        )
        .unwrap();

        assert!(has_response_for_week(&conn, "2026-07-13").unwrap());
        let recent = list_recent_weekly(&conn, 10).unwrap();
        assert_eq!(recent.len(), 1);
        assert!(recent[0].wants_deep_work_adjustment);
    }
}
