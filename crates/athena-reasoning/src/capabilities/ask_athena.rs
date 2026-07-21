//! Ask Athena — persistent, free-form chat (additive to
//! 06_AI_ENGINE.md's four capabilities). Unlike every other capability,
//! there is no Stage 2 verdict to phrase: the user's message is the
//! only input. Reuses the exact same "question" append mechanism
//! `PromptRequest.question` already provides for the Reflection Engine
//! (see `providers/cloud.rs`'s `reflection_question_is_appended_not_substituted`
//! test) rather than inventing a second prompt-shaping path — the
//! message is passed as `Synthesizer::synthesize`'s `question` argument
//! against a minimal, honestly-empty payload.

use crate::context::{EvidenceItem, EvidencePayload};
use crate::output::Recommendation;
use crate::pipeline::Synthesizer;

/// No verdict has been computed for a free-form question, so the
/// payload is honestly empty — `confidence: insufficient_data`, no
/// evidence rows — rather than fabricating a verdict shape. The
/// template fallback (§10.2) on this payload will just be a plain
/// "no AI phrasing available" sentence when no provider is configured,
/// which is the correct degraded behavior for a chat feature with no
/// LLM available (06_AI_ENGINE.md §10).
fn build_payload(data_freshness_note: impl Into<String>) -> EvidencePayload {
    EvidencePayload {
        capability: "ask_athena",
        verdict_headline: "Ask Athena".to_string(),
        verdict_reasoning: "Free-form question, no Decision Engine verdict to restate.".to_string(),
        confidence: "insufficient_data",
        evidence: Vec::<EvidenceItem>::new(),
        data_freshness_note: data_freshness_note.into(),
    }
}

/// `message` is passed through as the Stage 3 "question" — the model
/// answers it directly against the (empty) evidence, same grounding
/// discipline every other capability gets, it just has nothing to
/// ground against here by design.
pub fn build_ask_athena_response(
    synthesizer: &Synthesizer,
    message: String,
    data_freshness_note: impl Into<String>,
) -> Recommendation {
    let payload = build_payload(data_freshness_note);
    synthesizer.synthesize(&payload, Some(message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ask_athena_is_always_produced_even_with_no_providers_configured() {
        let synth = Synthesizer::new(vec![]);
        let rec = build_ask_athena_response(&synth, "What should I do today?".into(), "as of now");
        assert_eq!(rec.source, "template");
    }
}