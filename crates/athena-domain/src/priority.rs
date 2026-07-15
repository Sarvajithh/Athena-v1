//! Minimal deterministic priority pick over open deadlines.
//!
//! Pure, zero I/O (01_ARCHITECTURE.md §1.3): every input is a value the
//! caller already retrieved from `athena-data`; nothing here touches
//! SQL, the network, or an LLM.

/// One candidate the caller retrieved from `deadlines` (04_DATA_MODEL.md
/// §5). `due_at` is an ISO-8601-ish string; candidates are expected to
/// already be sorted ascending by `due_at` by the caller's query
/// (`athena-data::repositories::deadline::list_open`), so this module
/// only needs to break ties on `leverage_class`.
#[derive(Debug, Clone)]
pub struct DeadlineCandidate {
    pub id: i64,
    pub title: String,
    pub due_at: String,
    pub leverage_class: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Confidence {
    Inferred,
    InsufficientData,
}

#[derive(Debug, Clone)]
pub struct Verdict {
    pub headline: String,
    pub reasoning: String,
    pub confidence: Confidence,
    pub grounded_in_deadline_id: Option<i64>,
}

fn leverage_rank(class: &str) -> u8 {
    match class {
        "high" => 0,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    }
}

/// Picks the single highest-leverage, soonest-due open deadline as
/// "the one thing right now" (spec framing in 03_ONBOARDING.md §5.2's
/// cross-reference to `Now`). Returns `insufficient_data` when there is
/// nothing open — the correct, expected cold-start state
/// (01_ARCHITECTURE.md §7.1; MASTER_SPECIFICATION.md §4.7).
pub fn resolve_priority(candidates: &[DeadlineCandidate]) -> Verdict {
    let mut sorted: Vec<&DeadlineCandidate> = candidates.iter().collect();
    sorted.sort_by(|a, b| {
        leverage_rank(&a.leverage_class)
            .cmp(&leverage_rank(&b.leverage_class))
            .then_with(|| a.due_at.cmp(&b.due_at))
    });

    match sorted.first() {
        None => Verdict {
            headline: "Not enough data yet to name the one thing right now.".to_string(),
            reasoning: "No open deadlines exist yet — complete Semester Setup or add a deadline to get a real verdict."
                .to_string(),
            confidence: Confidence::InsufficientData,
            grounded_in_deadline_id: None,
        },
        Some(top) => Verdict {
            headline: format!("Work on: {}", top.title),
            reasoning: format!(
                "This is your highest-leverage ({}) open item, due {}, among everything currently open.",
                top.leverage_class, top.due_at
            ),
            confidence: Confidence::Inferred,
            grounded_in_deadline_id: Some(top.id),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_candidates_yield_insufficient_data() {
        let verdict = resolve_priority(&[]);
        assert_eq!(verdict.confidence, Confidence::InsufficientData);
        assert!(verdict.grounded_in_deadline_id.is_none());
    }

    #[test]
    fn picks_highest_leverage_first_then_soonest_due() {
        let candidates = vec![
            DeadlineCandidate {
                id: 1,
                title: "Low-leverage, sooner".into(),
                due_at: "2026-08-01T00:00:00".into(),
                leverage_class: "low".into(),
            },
            DeadlineCandidate {
                id: 2,
                title: "High-leverage, later".into(),
                due_at: "2026-08-10T00:00:00".into(),
                leverage_class: "high".into(),
            },
        ];
        let verdict = resolve_priority(&candidates);
        assert_eq!(verdict.grounded_in_deadline_id, Some(2));
        assert_eq!(verdict.confidence, Confidence::Inferred);
    }

    #[test]
    fn breaks_ties_on_leverage_by_soonest_due_at() {
        let candidates = vec![
            DeadlineCandidate {
                id: 1,
                title: "High-leverage, later".into(),
                due_at: "2026-08-10T00:00:00".into(),
                leverage_class: "high".into(),
            },
            DeadlineCandidate {
                id: 2,
                title: "High-leverage, sooner".into(),
                due_at: "2026-08-05T00:00:00".into(),
                leverage_class: "high".into(),
            },
        ];
        let verdict = resolve_priority(&candidates);
        assert_eq!(verdict.grounded_in_deadline_id, Some(2));
    }
}
