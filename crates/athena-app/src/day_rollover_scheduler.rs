//! Scheduled, once-per-day trigger that resets the Adaptive Planner's
//! disruption effect when the calendar day ends.
//!
//! `athena_domain::planner::available_minutes_tonight` (§3.1) and
//! `commands::bootstrap::get_bootstrap_state`'s `today_disruptions` are
//! both computed from a `local_date` the frontend supplies at mount
//! time (`commands::planner`'s own doc comment: "date/time stays a
//! frontend concern in this schema") — correct at the instant they're
//! computed, but if the app window stays open across midnight without
//! a re-fetch, that `local_date` goes stale: yesterday's already-
//! logged disruptions keep reducing "tonight's" window well into the
//! new day, until something forces a refetch.
//!
//! This mirrors `routine_scheduler.rs`'s own background-task shape
//! (`tauri::async_runtime::spawn`, an initial short startup delay,
//! sleep-until-target-time, `app_handle.try_state::<Mutex<Connection>>()`
//! degrading a not-yet-managed DB to a skipped tick rather than a
//! panic) but needs no DB read of its own and no config to re-read on
//! wake — the target is always "the next local midnight," never a
//! user-configurable time, so there is nothing here for
//! `read_config_and_status`'s pattern to re-check. Unlike
//! `routine_scheduler.rs`, this module never inserts, deletes, or
//! reasons about a `schedule_disruptions` row itself: the rows stay
//! exactly as logged (§5's causal-chain guarantee — `get_weekly_plan`'s
//! 7-day rollup still needs them), only their *effect on tonight's
//! window* resets, and that reset is just "the frontend recomputes
//! against today's date, which naturally has zero disruptions logged
//! yet" — this task's only job is to tell the frontend it's time to do
//! that recompute.

use std::sync::Mutex;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Local, NaiveTime};
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{info, warn};

/// The one Tauri event this module ever emits. Named, not a bare
/// string literal, for the same reason
/// `routine_scheduler::DAILY_QUESTIONNAIRE_DUE_EVENT` is — so the
/// frontend listener and this module can't silently drift apart on the
/// event name.
pub const DISRUPTIONS_RESET_EVENT: &str = "disruptions-reset-for-new-day";

/// Staggered after `scheduler.rs`'s 15s and `routine_scheduler.rs`'s
/// 20s startup delays, same "don't compete with cold-launch work"
/// reasoning as `routine_scheduler::STARTUP_DELAY`'s own doc comment.
const STARTUP_DELAY: Duration = Duration::from_secs(25);

/// Seconds until the next local midnight — always at least 1 second,
/// mirroring `routine_scheduler::seconds_until_next`'s own "never a
/// zero-length sleep" guard.
fn seconds_until_next_midnight() -> u64 {
    let now = Local::now().naive_local();
    let next_midnight = (now.date() + ChronoDuration::days(1)).and_time(NaiveTime::MIN);
    (next_midnight - now).num_seconds().max(1) as u64
}

/// Emits [`DISRUPTIONS_RESET_EVENT`]. Best-effort, same as
/// `routine_scheduler::fire_due`'s emit half — a failure here is
/// logged and never panics the background task; worst case, the
/// frontend simply refetches on its own next natural bootstrap call
/// (e.g. navigating screens) instead of proactively.
fn fire_reset(app_handle: &AppHandle) {
    info!(event = "disruptions_reset_fired");

    if let Err(e) = app_handle.emit(DISRUPTIONS_RESET_EVENT, ()) {
        warn!(event = "disruptions_reset_emit_failed", error = %e);
    }
}

/// Spawns the background trigger loop. Fire-and-forget, exactly like
/// `scheduler::spawn`/`routine_scheduler::spawn` — nothing here is
/// awaited from `main.rs`'s `setup`, so it can never delay the window
/// opening.
pub fn spawn(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_DELAY).await;

        loop {
            // The DB isn't actually touched by this task, but every
            // other background loop in this app checks
            // `try_state::<Mutex<Connection>>()` before doing anything
            // per tick (`scheduler.rs`, `routine_scheduler.rs`) so a
            // not-yet-managed DB always degrades the same way across
            // every background task, not just the ones that happen to
            // need a connection.
            if app_handle.try_state::<Mutex<Connection>>().is_none() {
                warn!(event = "day_rollover_scheduler_tick_skipped", reason = "db_not_ready");
                tokio::time::sleep(Duration::from_secs(5 * 60)).await;
                continue;
            }

            tokio::time::sleep(Duration::from_secs(seconds_until_next_midnight())).await;
            fire_reset(&app_handle);
        }
    });
}
