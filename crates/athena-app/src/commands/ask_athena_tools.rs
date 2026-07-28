//! Ask Athena rebuild, Part 1 — the small, closed, read-only
//! tool-calling layer that gives `ask_athena::build_ask_athena_response`
//! something real to ground on. This is deliberately *not* a general
//! agent framework: `AskAthenaTool` is a closed enum (five fixed
//! queries), `classify` is a plain Rust `match`/keyword dispatcher (not
//! an LLM-driven "which tools do you need" round trip — see this
//! module's doc note below for why), and `execute` calls exactly the
//! typed repository functions every other command in this crate
//! already calls. Tool results become `EvidenceItem`s and are handed to
//! `athena-reasoning` as the same `evidence` array Stage 5's grounding
//! check in `pipeline.rs` already validates citations against — no
//! second, ungrounded path.
//!
//! **Deviation from the brief, and why:** the brief's default is "have
//! the model request 0-2 tools via a structured pre-step," with a
//! plain match-based dispatcher offered as the implementation detail
//! underneath that request. This module skips the LLM pre-step
//! entirely and classifies heuristically in plain Rust instead, for two
//! reasons specific to this persona: (1) the persona brief itself
//! requires captures/chat to keep working "with zero network and zero
//! AI provider available" — a heuristic classifier is the only version
//! of tool selection that is available offline, so *some* grounding
//! still happens even when every provider in the cascade is down; (2)
//! it avoids doubling the latency/cost of every single chat turn (one
//! call to decide tools, a second to answer) for a five-tool, low-
//! ambiguity surface where keyword matching already covers the
//! documented example inputs well ("that essay thing," "what's due
//! this week," "am I behind"). The tradeoff: a genuinely novel phrasing
//! the keyword list doesn't anticipate may under-trigger a tool and
//! fall back to `search_deadlines` alone. `classify`'s match arms are
//! kept in one place specifically so that swapping this for an actual
//! model-driven pre-step later is a localized change, not a rewrite —
//! the closed `AskAthenaTool` enum and `execute`'s dispatcher underneath
//! it are unaffected either way.

use athena_data::repositories::{course, deadline, disruption, semester};
use athena_domain::priority::{self, DeadlineCandidate};
use athena_reasoning::EvidenceItem;
use rusqlite::Connection;

/// The five fixed queries Ask Athena is allowed to run against
/// `athena-data`, closed by construction (adding a sixth means editing
/// this enum and `execute`'s match together, never a caller passing an
/// arbitrary string).
#[derive(Debug, Clone, PartialEq)]
pub enum AskAthenaTool {
    /// Today's Now verdict — `priority::resolve_priority`'s output.
    /// Ask Athena must never re-derive a competing ranking of its own;
    /// this tool is the one and only way a "what should I do" question
    /// gets an answer, by relaying the same deterministic verdict the
    /// rest of the app already computed.
    GetCurrentVerdict,
    /// Every open deadline, optionally bounded to the next
    /// `days_ahead` days (`None` = every open deadline, unbounded).
    ListOpenDeadlines { days_ahead: Option<i64> },
    /// Fuzzy title search (`deadline::search`) — the tool a vague
    /// description ("that essay thing") resolves through.
    SearchDeadlines { query: String },
    /// Fuzzy course code/name lookup (`course::find_fuzzy`) — one
    /// specific course.
    GetCourse { identifier: String },
    /// Every course in the current semester (`course::list_by_semester`)
    /// — for "how many courses," "what are my courses," "my course
    /// load" style questions that don't name one specific course, so
    /// `GetCourse`'s single-match lookup can't answer them.
    ListCourses,
    /// Disruptions logged in the last `days` days.
    GetDisruptionHistory { days: i64 },
}

/// Classifies a free-form message into at most 2 tools (the brief's
/// "0-2 per turn" cap), via plain keyword matching over the normalized
/// (lowercased) message — see this module's doc comment for why this
/// is a heuristic dispatcher rather than an LLM-driven pre-step.
/// `search_deadlines` against the raw message is always included as
/// the second/fallback slot unless `get_current_verdict` already
/// covers the turn, since a vague, non-keyword-matching message
/// ("that essay thing") should still get *some* grounding rather than
/// none.
pub fn classify(message: &str) -> Vec<AskAthenaTool> {
    let lower = message.to_lowercase();
    let mut tools = Vec::with_capacity(2);

    let asks_what_to_do = ["what should i do", "what to do", "what do i do", "prioriti", "tonight"]
        .iter()
        .any(|kw| lower.contains(kw));
    let asks_am_i_behind = ["am i behind", "behind on", "falling behind", "on track"]
        .iter()
        .any(|kw| lower.contains(kw));
    let asks_disruptions = ["disrupt", "missed", "illness", "sick", "interrupt"]
        .iter()
        .any(|kw| lower.contains(kw));
    let asks_deadlines_list = ["due", "this week", "deadline", "upcoming", "everything open"]
        .iter()
        .any(|kw| lower.contains(kw));
    let mentions_course = lower.contains("course") || lower.contains("class");
    // "how many," "which," "my," "all," "list," or "load" alongside
    // "course(s)" reads as a question about the whole set, not one
    // specific course — GetCourse's fuzzy match can't answer "how many
    // courses do I have," there's no single code/title to match against.
    let asks_about_whole_load = mentions_course
        && ["how many", "which course", "my courses", "all my course", "list my course", "course load", "what courses"]
            .iter()
            .any(|kw| lower.contains(kw));

    if asks_what_to_do || asks_am_i_behind {
        tools.push(AskAthenaTool::GetCurrentVerdict);
    }

    if asks_disruptions && tools.len() < 2 {
        tools.push(AskAthenaTool::GetDisruptionHistory { days: 14 });
    }

    if asks_deadlines_list && tools.len() < 2 {
        let days_ahead = if lower.contains("this week") {
            Some(7)
        } else if lower.contains("today") || lower.contains("tonight") {
            Some(1)
        } else if lower.contains("everything open") || lower.contains("all") {
            None
        } else {
            Some(14)
        };
        tools.push(AskAthenaTool::ListOpenDeadlines { days_ahead });
    }

    if mentions_course && tools.len() < 2 {
        if asks_about_whole_load {
            tools.push(AskAthenaTool::ListCourses);
        } else {
            // The identifier is the whole message; `course::find_fuzzy`
            // does its own normalization/word-overlap matching, so
            // passing the raw sentence ("how am I doing in CS5590")
            // still resolves against the code/title inside it.
            tools.push(AskAthenaTool::GetCourse {
                identifier: message.to_string(),
            });
        }
    }

    // Fallback slot: a vague, non-keyword-matching message still gets
    // fuzzy-searched against deadline titles, unless the current
    // verdict already answers the turn (searching on top of that would
    // just add noise the model has to ignore).
    if tools.len() < 2 && !asks_what_to_do && !asks_am_i_behind {
        tools.push(AskAthenaTool::SearchDeadlines {
            query: message.to_string(),
        });
    }

    tools.truncate(2);
    tools
}

fn open_candidates(conn: &Connection) -> Result<Vec<DeadlineCandidate>, String> {
    let rows = deadline::list_open(conn).map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|d| DeadlineCandidate {
            id: d.id,
            title: d.title.clone(),
            due_at: d.due_at.clone(),
            leverage_class: d.leverage_class.clone(),
        })
        .collect())
}

/// Runs one tool against `athena-data` and returns whatever
/// `EvidenceItem`s it found (possibly none — a tool finding nothing is
/// a valid, honest result, not an error). `today_iso` is `YYYY-MM-DD`,
/// resolved once by the caller so this function stays a pure
/// dispatcher with no date/time dependency of its own, same convention
/// every repository module in `athena-data` already follows.
pub fn execute(conn: &Connection, tool: &AskAthenaTool, today_iso: &str) -> Result<Vec<EvidenceItem>, String> {
    match tool {
        AskAthenaTool::GetCurrentVerdict => {
            let candidates = open_candidates(conn)?;
            let verdict = priority::resolve_priority(&candidates);
            let mut evidence = Vec::new();
            if let Some(id) = verdict.grounded_in_deadline_id {
                evidence.push(EvidenceItem {
                    id,
                    label: "current_verdict".to_string(),
                    value: format!("{} — {}", verdict.headline, verdict.reasoning),
                });
            }
            for runner_up in &verdict.runners_up {
                evidence.push(EvidenceItem {
                    id: runner_up.id,
                    label: "current_verdict_runner_up".to_string(),
                    value: runner_up.headline.clone(),
                });
            }
            Ok(evidence)
        }
        AskAthenaTool::ListOpenDeadlines { days_ahead } => {
            let rows = deadline::list_open(conn).map_err(|e| e.to_string())?;
            let cutoff = days_ahead.map(|days| add_days_to_iso_date(today_iso, days));
            Ok(rows
                .into_iter()
                .filter(|d| match &cutoff {
                    Some(cutoff) => d.due_at.as_str() <= cutoff.as_str(),
                    None => true,
                })
                .take(20)
                .map(|d| EvidenceItem {
                    id: d.id,
                    label: "open_deadline".to_string(),
                    value: format!("{} — due {} ({} leverage)", d.title, d.due_at, d.leverage_class),
                })
                .collect())
        }
        AskAthenaTool::SearchDeadlines { query } => {
            let rows = deadline::search(conn, query, 5).map_err(|e| e.to_string())?;
            Ok(rows
                .into_iter()
                .map(|d| EvidenceItem {
                    id: d.id,
                    label: "matched_deadline".to_string(),
                    value: format!("{} — due {} ({} leverage)", d.title, d.due_at, d.leverage_class),
                })
                .collect())
        }
        AskAthenaTool::ListCourses => {
            let semester = semester::get_current_semester(conn).map_err(|e| e.to_string())?;
            let Some(semester) = semester else {
                return Ok(vec![]);
            };
            let courses = course::list_by_semester(conn, semester.id).map_err(|e| e.to_string())?;
            Ok(courses
                .into_iter()
                .map(|c| EvidenceItem {
                    id: c.id,
                    label: "course".to_string(),
                    value: format!(
                        "{} — {} ({} credits, {} leverage)",
                        c.code, c.title, c.credits, c.leverage_class
                    ),
                })
                .collect())
        }
        AskAthenaTool::GetCourse { identifier } => {
            let found = course::find_fuzzy(conn, identifier).map_err(|e| e.to_string())?;
            Ok(found
                .map(|c| {
                    // "Course Context" (V12): fold notes + grading
                    // breakdown into the same evidence value string
                    // rather than separate EvidenceItems — one course
                    // lookup should read as one fact to the model, same
                    // as every other capability's evidence rows.
                    let grading = if c.grading_breakdown.is_empty() {
                        String::new()
                    } else {
                        let parts: Vec<String> = c
                            .grading_breakdown
                            .iter()
                            .map(|g| format!("{} {}%", g.category, g.weight))
                            .collect();
                        format!("; grading: {}", parts.join(", "))
                    };
                    let notes = c
                        .notes
                        .as_ref()
                        .filter(|n| !n.trim().is_empty())
                        .map(|n| format!("; notes: {n}"))
                        .unwrap_or_default();

                    vec![EvidenceItem {
                        id: c.id,
                        label: "course".to_string(),
                        value: format!(
                            "{} — {} ({} credits, {} leverage{}){}{}",
                            c.code,
                            c.title,
                            c.credits,
                            c.leverage_class,
                            c.target_grade
                                .as_ref()
                                .map(|g| format!(", target grade {g}"))
                                .unwrap_or_default(),
                            notes,
                            grading,
                        ),
                    }]
                })
                .unwrap_or_default())
        }
        AskAthenaTool::GetDisruptionHistory { days } => {
            let cutoff = add_days_to_iso_date(today_iso, -days);
            let rows = disruption::list_since(conn, &cutoff).map_err(|e| e.to_string())?;
            Ok(rows
                .into_iter()
                .take(20)
                .map(|d| EvidenceItem {
                    id: d.id,
                    label: "disruption".to_string(),
                    value: format!("{} — {} ({} min)", d.date, d.disruption_type, d.duration_minutes),
                })
                .collect())
        }
    }
}

/// Adds (or, with a negative `days`, subtracts) whole days to a
/// `YYYY-MM-DD` date, returning `YYYY-MM-DD`. Duplicated, minimal
/// epoch-day arithmetic rather than a `chrono` dependency — same
/// reasoning `commands::ai`'s own `now_iso8601`/`civil_from_days` doc
/// comment gives for why one extra call site doesn't justify a full
/// date/time crate; `days_from_civil`/`civil_from_days` are the
/// standard Howard Hinnant algorithm pair (this file needs both
/// directions, `commands::ai`/`commands::integrations` only ever
/// needed `civil_from_days`).
fn add_days_to_iso_date(date: &str, days: i64) -> String {
    let Some((y, m, d)) = parse_iso_date(date) else {
        return date.to_string();
    };
    let day_count = days_from_civil(y, m, d) + days;
    let (y2, m2, d2) = civil_from_days(day_count);
    format!("{y2:04}-{m2:02}-{d2:02}T23:59:59")
}

fn parse_iso_date(date: &str) -> Option<(i64, u32, u32)> {
    let y: i64 = date.get(0..4)?.parse().ok()?;
    let m: u32 = date.get(5..7)?.parse().ok()?;
    let d: u32 = date.get(8..10)?.parse().ok()?;
    Some((y, m, d))
}

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64;
    let mp = (m as i64 + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_maps_what_should_i_do_to_current_verdict_only() {
        let tools = classify("what should I do tonight?");
        assert!(tools.contains(&AskAthenaTool::GetCurrentVerdict));
    }

    #[test]
    fn classify_maps_vague_essay_question_to_search() {
        let tools = classify("what about that essay thing");
        assert!(matches!(tools.first(), Some(AskAthenaTool::SearchDeadlines { .. })));
    }

    #[test]
    fn classify_maps_due_this_week_to_bounded_list() {
        let tools = classify("what's due this week?");
        assert!(tools
            .iter()
            .any(|t| matches!(t, AskAthenaTool::ListOpenDeadlines { days_ahead: Some(7) })));
    }

    #[test]
    fn classify_never_returns_more_than_two_tools() {
        let tools = classify("am I behind on my course deadlines, any disruptions this week?");
        assert!(tools.len() <= 2);
    }

    #[test]
    fn how_many_courses_routes_to_list_courses_not_get_course() {
        // Regression test: "how many courses do I have" used to hit
        // GetCourse's single-code/title fuzzy match with the whole
        // sentence as the identifier, which never matches anything,
        // always returning empty evidence — hence "I do not have
        // access to your current course load information." Asserting
        // membership, not exact equality: classify() always tries to
        // fill up to 2 tool slots (see its fallback-search comment), so
        // a SearchDeadlines fallback alongside ListCourses is expected,
        // not a bug — the thing this test actually guards is that
        // GetCourse (the broken path) never fires here.
        let tools = classify("How many courses do I have currently in this sem?");
        assert!(tools.contains(&AskAthenaTool::ListCourses));
        assert!(!tools.iter().any(|t| matches!(t, AskAthenaTool::GetCourse { .. })));
    }

    #[test]
    fn naming_a_specific_course_still_routes_to_get_course() {
        // "course" must actually appear in the message for
        // `mentions_course` to fire at all — a bare course code alone
        // ("CS5590") doesn't trigger it, by design (see `classify`'s
        // keyword list); that's a real, separate limitation, not what
        // this test checks. This test only guards that naming a course
        // *and* saying "course" doesn't get misrouted to ListCourses.
        let tools = classify("how am I doing in my CS5590 course?");
        assert!(tools.contains(&AskAthenaTool::GetCourse {
            identifier: "how am I doing in my CS5590 course?".to_string()
        }));
        assert!(!tools.contains(&AskAthenaTool::ListCourses));
    }

    #[test]
    fn date_arithmetic_round_trips_across_a_month_boundary() {
        assert_eq!(add_days_to_iso_date("2026-07-30", 3), "2026-08-02T23:59:59");
        assert_eq!(add_days_to_iso_date("2026-07-05", -10), "2026-06-25T23:59:59");
    }
}
