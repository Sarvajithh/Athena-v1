//! Ask Athena — persistent, free-form chat (additive to
//! 06_AI_ENGINE.md's four capabilities). Unlike every other capability,
//! there is no Stage 2 verdict to phrase: the user's message is the
//! only input. Reuses the exact same "question" append mechanism
//! `PromptRequest.question` already provides for the Reflection Engine
//! (see `providers/cloud.rs`'s `reflection_question_is_appended_not_substituted`
//! test) rather than inventing a second prompt-shaping path — the
//! message is passed as `Synthesizer::synthesize`'s `question` argument.
//!
//! **Tool-calling extension** (workflow reform brief, Ask Athena
//! rebuild, Part 1): `build_ask_athena_response` used to always pass
//! `evidence: []`, which was the root cause of every generic answer —
//! there was nothing to ground on. `athena-app::commands::ai` now runs
//! a small, closed, heuristic tool dispatcher *before* calling in here
//! (see that module's `ask_athena_tools` submodule) and passes whatever
//! rows it found as `evidence` on the payload this module builds. This
//! module itself still does no I/O and calls no tool of its own — it
//! only shapes whatever evidence the caller already retrieved into the
//! same `EvidencePayload` shape every other capability uses, so Stage
//! 5's grounding check in `pipeline.rs` applies here exactly as it does
//! everywhere else. When the caller found nothing (no matching
//! deadline, no current verdict, etc.), evidence stays honestly empty
//! and the payload says so, rather than a fabricated "found nothing"
//! placeholder row.

use crate::context::{EvidenceItem, EvidencePayload};
use crate::output::Recommendation;
use crate::pipeline::Synthesizer;

/// Builds the payload for one turn. `evidence` is whatever the tool
/// dispatcher retrieved (possibly empty); `evidence_note` is a short,
/// factual sentence describing what was (or wasn't) found — e.g. "3
/// open deadlines in the next 7 days" or "no deadline matched that
/// description" — restated verbatim into `verdict_reasoning`, same as
/// every other capability's Stage 2 reasoning is restated rather than
/// left for Stage 4 to reconstruct.
fn build_payload(
    evidence: Vec<EvidenceItem>,
    evidence_note: impl Into<String>,
    data_freshness_note: impl Into<String>,
) -> EvidencePayload {
    let note = evidence_note.into();
    let confidence = if evidence.is_empty() {
        "insufficient_data"
    } else {
        "confirmed"
    };
    EvidencePayload {
        capability: "ask_athena",
        verdict_headline: "Ask Athena".to_string(),
        verdict_reasoning: if note.is_empty() {
            "Free-form question, no Decision Engine verdict to restate.".to_string()
        } else {
            note
        },
        confidence,
        evidence,
        data_freshness_note: data_freshness_note.into(),
    }
}

/// `message` is passed through as the Stage 3 "question" — the model
/// answers it directly against whatever evidence the caller's tool
/// dispatch found, same grounding discipline every other capability
/// gets. `conversation_context` (Part 2) is a short block of prior
/// turns (verbatim recent + a rolling summary of anything older),
/// appended to the system prompt via `PromptBuilder::build_with_context`
/// so the model can see its own prior turns without a second retrieval
/// path. `overwhelmed` (Part 4's "explain like I'm overwhelmed" chip)
/// asks Stage 3 for one prioritized next action instead of a full
/// answer — still fully grounded, just shorter.
#[allow(clippy::too_many_arguments)]
pub fn build_ask_athena_response(
    synthesizer: &Synthesizer,
    message: String,
    evidence: Vec<EvidenceItem>,
    evidence_note: impl Into<String>,
    conversation_context: Option<String>,
    overwhelmed: bool,
    skip_providers: &[String],
    data_freshness_note: impl Into<String>,
) -> Recommendation {
    let payload = build_payload(evidence, evidence_note, data_freshness_note);
    let question = if overwhelmed {
        format!(
            "{message}\n\n(The user tapped \"explain like I'm overwhelmed\" — respond with exactly \
             one next action, not a list of options.)"
        )
    } else {
        message
    };
    synthesizer.synthesize_full(&payload, Some(question), conversation_context, skip_providers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ask_athena_is_always_produced_even_with_no_providers_configured() {
        let synth = Synthesizer::new(vec![]);
        let rec = build_ask_athena_response(
            &synth,
            "What should I do today?".into(),
            vec![],
            "",
            None,
            false,
            &[],
            "as of now",
        );
        assert_eq!(rec.source, "template");
    }

    #[test]
    fn evidence_found_by_the_tool_dispatcher_yields_confirmed_confidence() {
        let synth = Synthesizer::new(vec![]);
        let rec = build_ask_athena_response(
            &synth,
            "what's due this week?".into(),
            vec![EvidenceItem {
                id: 1,
                label: "open_deadline".into(),
                value: "Postcolonial essay — due 2026-07-30T23:59:00 (high)".into(),
            }],
            "1 open deadline in the next 7 days.",
            None,
            false,
            &[],
            "as of now",
        );
        assert_eq!(rec.confidence, "confirmed");
        assert_eq!(rec.grounded_in, vec![1]);
    }
}