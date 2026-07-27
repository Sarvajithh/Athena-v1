//! Ask Athena rebuild, Part 3 — chat-native deadline capture. A
//! message like "add a deadline: postcolonial essay due friday
//! 11:59pm" or "remind me the lab report is due next wednesday" gets
//! heuristically parsed into a draft the frontend renders as an inline,
//! editable confirmation card — never auto-committed. This module only
//! ever *parses*; the actual insert happens through the existing,
//! unmodified `commands::onboarding::add_deadlines_to_semester` once
//! the student explicitly confirms, same "extraction always ends in a
//! confirmation step, never auto-commits" rule
//! `extract_deadlines_from_gmail`/`_notion` already follow in
//! `commands::integrations` — chat is just one more entry point into
//! that identical rule, not a laxer one.
//!
//! **Zero network, zero AI provider required.** `find_date_in_text_relative`
//! (`commands::integrations`) has no LLM dependency, and neither does
//! anything in this file — parsing a chat message into a draft deadline
//! must keep working at 1am on a flaky connection with every provider
//! in the cascade down, which is exactly the moment this feature matters
//! most for this persona.

use crate::commands::integrations::find_date_in_text_relative;

/// A parsed-but-unconfirmed deadline, ready to prefill the frontend's
/// inline confirmation card. Every field is editable before commit —
/// this struct is a draft, not a `NewDeadline`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChatDeadlineDraft {
    pub title: String,
    /// `YYYY-MM-DDTHH:MM:SS`, defaulting to end-of-day when the message
    /// stated no time (`find_date_in_text_relative`'s own default).
    pub due_at: String,
    /// Always `"academic"` — chat capture has no signal to distinguish
    /// career/research/dsa/other, so it defaults to the most common
    /// case and leaves the rest to the student to change on the card
    /// before confirming, rather than guessing wrong silently.
    pub category: String,
    /// Always `"medium"` — same "don't guess a leverage class from
    /// nothing, let the student correct it on the card" reasoning as
    /// `category`.
    pub leverage_class: String,
}

/// The phrases that signal capture intent — a plain, closed list
/// (not a classifier) since false positives here would surface an
/// unwanted confirmation card on an ordinary question, and false
/// negatives just mean the student types the deadline manually
/// instead, which is the app's pre-existing behavior either way.
const TRIGGER_PHRASES: [&str; 4] = ["add a deadline", "add deadline", "remind me", "new deadline"];

/// Parses `message` into a `ChatDeadlineDraft` if it looks like a
/// capture request and a due date can be found in it; `None` for
/// anything else (an ordinary question, or a capture-shaped message
/// with no date `find_date_in_text_relative` can resolve — the latter
/// still just falls through to a normal Ask Athena answer rather than
/// showing a half-empty card). `today` is `(year, month, day)`, the
/// caller's local calendar day (resolved once in `commands::ai`, same
/// "no date/time dependency of its own" convention as
/// `find_date_in_text_relative` itself).
pub fn parse_chat_deadline(message: &str, today: (i64, u32, u32)) -> Option<ChatDeadlineDraft> {
    let lower = message.to_lowercase();
    let matched_trigger = TRIGGER_PHRASES.iter().find(|phrase| lower.contains(*phrase))?;

    let due_at = find_date_in_text_relative(message, today)?;

    let title = extract_title(message, matched_trigger, &lower);
    if title.trim().is_empty() {
        return None;
    }

    Some(ChatDeadlineDraft {
        title,
        due_at,
        category: "academic".to_string(),
        leverage_class: "medium".to_string(),
    })
}

/// Strips the trigger phrase and any leading colon/whitespace, then
/// strips the date/time-shaped tail (weekday names, "today"/"tomorrow",
/// a stated time-of-day, and the leading "due"/"is due"/"by" that
/// usually precedes them) so what's left is just the deadline's title
/// — "postcolonial essay" out of "add a deadline: postcolonial essay
/// due friday 11:59pm", not the whole sentence.
fn extract_title(message: &str, matched_trigger: &str, lower: &str) -> String {
    let trigger_end = lower.find(matched_trigger).map(|i| i + matched_trigger.len()).unwrap_or(0);
    let mut rest = message[trigger_end.min(message.len())..].trim();
    rest = rest.trim_start_matches(':').trim_start_matches("that").trim();

    const DATE_MARKERS: [&str; 11] = [
        " due ", " is due ", " by ", " on ", " tomorrow", " tonight", " today", " next ", " monday",
        " tuesday", " wednesday",
    ];
    // Also cover the remaining weekdays and a bare leading "due"/"by" at
    // the very start of what's left after the trigger phrase.
    const MORE_DATE_MARKERS: [&str; 4] = [" thursday", " friday", " saturday", " sunday"];

    let lower_rest = rest.to_lowercase();
    let mut cut_at = lower_rest.len();
    for marker in DATE_MARKERS.iter().chain(MORE_DATE_MARKERS.iter()) {
        if let Some(idx) = lower_rest.find(marker) {
            cut_at = cut_at.min(idx);
        }
    }
    rest[..cut_at.min(rest.len())].trim().trim_end_matches(':').trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TODAY: (i64, u32, u32) = (2026, 7, 27); // Monday, per this session's system date.

    #[test]
    fn parses_an_add_a_deadline_message_with_a_weekday_and_time() {
        let draft = parse_chat_deadline(
            "add a deadline: postcolonial essay due friday 11:59pm",
            TODAY,
        )
        .expect("should parse");
        assert_eq!(draft.title, "postcolonial essay");
        assert_eq!(draft.due_at, "2026-07-31T23:59:00");
        assert_eq!(draft.category, "academic");
        assert_eq!(draft.leverage_class, "medium");
    }

    #[test]
    fn parses_a_remind_me_phrasing() {
        let draft = parse_chat_deadline("remind me the lab report is due next wednesday", TODAY)
            .expect("should parse");
        assert_eq!(draft.title, "the lab report");
        assert_eq!(draft.due_at, "2026-08-05T23:59:00");
    }

    #[test]
    fn returns_none_for_an_ordinary_question_with_no_trigger_phrase() {
        assert!(parse_chat_deadline("what should I do tonight?", TODAY).is_none());
    }

    #[test]
    fn returns_none_when_a_trigger_phrase_is_present_but_no_date_can_be_found() {
        assert!(parse_chat_deadline("remind me to email my advisor", TODAY).is_none());
    }
}
