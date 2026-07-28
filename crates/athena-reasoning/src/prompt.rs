//! Stage 3 — Prompt Construction (06_AI_ENGINE.md §7).
//!
//! This is the one place in the whole application allowed to assemble a
//! Stage 4 prompt. Nothing here is freeform string concatenation of
//! arbitrary retrieved text (§7's own ban): every `PromptRequest` is
//! built from exactly one `EvidencePayload` plus §8's fixed persona
//! text, and every prompt carries a JSON schema the model must satisfy.
//! `src/screens/**` and every other React surface must never construct
//! prompt text of its own — that would be exactly the kind of
//! ungrounded seam §7's last paragraph calls out by name ("use your
//! judgment about what else might be relevant... banned from every
//! prompt template as a matter of design review").

use crate::context::EvidencePayload;
use crate::provider::PromptRequest;

/// §8's tone constraint, verbatim, identical across every
/// verdict-restating capability (daily_briefing, weekly_planning,
/// weakness_analysis, and the Reflection Engine's follow-up questions
/// on any of those) — no capability gets its own persona *for that
/// group*. See `CHAT_PERSONA` below for why `ask_athena` is a
/// deliberate, documented exception rather than a violation of that
/// rule.
const PERSONA: &str = "You are Athena's phrasing layer, not its decision layer. Every fact, ranking, \
    weakness, and confidence class below was already decided by deterministic code before you were \
    called. Your only job is to turn the verdict and evidence into one well-reasoned, well-formatted \
    piece of prose. Be direct and economical; respect the user's time. No performed enthusiasm, no \
    hedging a disagreement into mush, no moralizing, no nagging, and never soften a negative verdict \
    for comfort. Never characterize the user as behind, procrastinating, or failing, and never use \
    guilt, urgency-shaming, or exclamation-point pep-talk energy — state what is true about deadlines \
    and time plainly and let the user draw their own conclusions. Never introduce a fact, number, or \
    claim that is not present in the verdict or evidence JSON below — if you cannot support a sentence \
    with an evidence ID, do not write that sentence.";

/// Ask Athena's persona (bug fix, prompted by chat producing nothing
/// but "no verdict to restate" for every message with no matching
/// evidence — i.e. almost every chat message). `PERSONA` above is
/// correct for the other four capabilities: they always have a real
/// Stage 2 verdict, and the model's only job is safely phrasing it.
/// Ask Athena has no Stage 2 verdict *by design* (see
/// `capabilities/ask_athena.rs`'s module doc) — it's open
/// conversation. Applying `PERSONA`'s "never say anything not in the
/// evidence JSON" rule to open conversation doesn't make chat safer,
/// it makes chat impossible: the model has nothing to say about
/// general study advice, explaining a concept, or brainstorming a
/// schedule, none of which comes from `evidence` and none of which
/// should. The grounding discipline is preserved for the one thing
/// that actually needs it — specific claims about *this user's*
/// courses/deadlines/grades — and lifted for everything else.
const CHAT_PERSONA: &str = "You are Athena, a direct, economical academic-life assistant having an \
    open conversation with a student. Answer their message directly and helpfully — general study \
    advice, explanations, brainstorming, and encouragement are all fine and do not need to come from \
    the evidence JSON below. The evidence JSON, when non-empty, is real data pulled from this specific \
    student's own courses/deadlines — any claim you make about their specific courses, deadlines, \
    grades, or schedule must be grounded in it and cited by ID; do not invent a course name, due date, \
    or grade that isn't there. When the evidence JSON is empty, that just means nothing in their data \
    matched this message — say so plainly if it's relevant, then still answer the actual question \
    using your own knowledge. Never use guilt, urgency-shaming, or exclamation-point pep-talk energy. \
    Be concise: a few sentences unless the question genuinely calls for more.";

/// The fixed output shape every verdict-restating capability's Stage 4
/// response must satisfy (§7.4, §11): a restated verdict, grounded
/// reasoning sentence(s), and citations by evidence ID — constrained
/// output is what makes Stage 5's grounding check mechanical.
const OUTPUT_SCHEMA: &str = r#"{
  "type": "object",
  "required": ["verdict", "reasoning", "citations"],
  "properties": {
    "verdict": { "type": "string", "description": "One-sentence restatement of the Stage 2 verdict headline." },
    "reasoning": { "type": "string", "description": "1-3 sentences of grounded reasoning, citing only IDs present in the evidence JSON." },
    "citations": { "type": "array", "items": { "type": "integer" }, "description": "Evidence IDs actually cited in `reasoning`." }
  }
}"#;

/// Ask Athena's output shape — `answer` replaces `reasoning`/`verdict`
/// entirely (there's no verdict to restate, see `CHAT_PERSONA`) and is
/// allowed to be a real conversational answer, not a 1-3 sentence
/// grounded restatement. `citations` keeps the same meaning: evidence
/// IDs actually relied on, checked against `payload.evidence` by
/// `pipeline.rs`'s grounding check exactly as it is for every other
/// capability — Stage 5 isn't relaxed, only Stage 3/4's persona and
/// schema are, and only for this one capability.
const CHAT_OUTPUT_SCHEMA: &str = r#"{
  "type": "object",
  "required": ["answer", "citations"],
  "properties": {
    "answer": { "type": "string", "description": "A direct, conversational answer to the user's message." },
    "citations": { "type": "array", "items": { "type": "integer" }, "description": "Evidence IDs relied on for any claim about the user's specific courses/deadlines/grades. Empty if none were needed." }
  }
}"#;

/// Centralizes Stage 3 for every capability in 06_AI_ENGINE.md §4.
/// Takes an `EvidencePayload` (already built by `context.rs` from an
/// `athena-domain` verdict) and an optional Reflection Engine question
/// (§4.7), and returns the one `PromptRequest` Stage 4 is allowed to
/// send.
pub struct PromptBuilder;

impl PromptBuilder {
    pub fn build(payload: &EvidencePayload, question: Option<String>) -> PromptRequest {
        Self::build_with_context(payload, question, None)
    }

    /// Same as `build`, plus Ask Athena's Part 2 conversation memory:
    /// `conversation_context`, when present, is appended to the system
    /// block as prior-turn context, never mixed into `evidence_json` —
    /// it is not itself evidence and carries no IDs, so Stage 5's
    /// grounding check is completely unaffected by it (a citation must
    /// still resolve against `evidence_json` alone). Every other
    /// capability calls `build` and gets `None` here, same as before.
    pub fn build_with_context(
        payload: &EvidencePayload,
        question: Option<String>,
        conversation_context: Option<String>,
    ) -> PromptRequest {
        let verdict_json = serde_json::json!({
            "capability": payload.capability,
            "headline": payload.verdict_headline,
            "reasoning": payload.verdict_reasoning,
            "confidence": payload.confidence,
        })
        .to_string();

        let evidence_json = serde_json::to_string(&payload.evidence).unwrap_or_else(|_| "[]".to_string());
        let is_chat = payload.capability == "ask_athena";

        // Stage 5's grounding check treats any citation ID outside the
        // evidence set as a failure (pipeline.rs's `grounded_recommendation`).
        // When the evidence set is empty (e.g. every `ask_athena` call —
        // there is never a Stage 2 verdict to ground against), the schema
        // alone doesn't make it obvious to the model that `citations` must
        // then be `[]`; models frequently hallucinate a placeholder ID
        // instead, which fails grounding on both the first attempt and the
        // stricter retry and silently degrades every response to the
        // generic template fallback. Spelling this out explicitly here
        // fixes it before the first attempt instead of relying on a retry
        // to catch it after the fact.
        let mut system = if payload.evidence.is_empty() {
            let base = if is_chat { CHAT_PERSONA } else { PERSONA };
            format!(
                "{base} There is no evidence for this request — the evidence JSON below is `[]`. \
                 You MUST return \"citations\": []. Do not invent, guess, or reuse an ID; any \
                 non-empty citations array here will be rejected."
            )
        } else if is_chat {
            CHAT_PERSONA.to_string()
        } else {
            PERSONA.to_string()
        };

        if let Some(context) = &conversation_context {
            if !context.trim().is_empty() {
                system.push_str(&format!(
                    " Prior turns in this conversation, for context only (do not cite anything from \
                     here — only IDs in the evidence JSON are citable):\n{context}"
                ));
            }
        }

        PromptRequest {
            system,
            verdict_json,
            evidence_json,
            output_schema: if is_chat { CHAT_OUTPUT_SCHEMA.to_string() } else { OUTPUT_SCHEMA.to_string() },
            question,
            conversation_context,
            stricter: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::EvidenceItem;

    #[test]
    fn build_serializes_verdict_and_evidence_as_json_not_free_text() {
        let payload = EvidencePayload {
            capability: "daily_briefing",
            verdict_headline: "Work on: X".into(),
            verdict_reasoning: "because Y".into(),
            confidence: "inferred",
            evidence: vec![EvidenceItem {
                id: 7,
                label: "top_priority_deadline".into(),
                value: "X".into(),
            }],
            data_freshness_note: "as of now".into(),
        };
        let request = PromptBuilder::build(&payload, None);
        assert!(request.verdict_json.contains("\"headline\":\"Work on: X\""));
        assert!(request.evidence_json.contains("\"id\":7"));
        assert!(!request.stricter);
        assert!(request.question.is_none());
    }

    #[test]
    fn empty_evidence_instructs_the_model_to_return_empty_citations() {
        let payload = EvidencePayload {
            capability: "ask_athena",
            verdict_headline: "Ask Athena".into(),
            verdict_reasoning: "Free-form question, no Decision Engine verdict to restate.".into(),
            confidence: "insufficient_data",
            evidence: vec![],
            data_freshness_note: "as of now".into(),
        };
        let request = PromptBuilder::build(&payload, Some("what should I prioritize?".into()));
        assert!(request.system.contains("\"citations\": []"));
    }

    #[test]
    fn non_empty_evidence_does_not_add_the_empty_citations_instruction() {
        let payload = EvidencePayload {
            capability: "daily_briefing",
            verdict_headline: "Work on: X".into(),
            verdict_reasoning: "because Y".into(),
            confidence: "inferred",
            evidence: vec![EvidenceItem {
                id: 7,
                label: "top_priority_deadline".into(),
                value: "X".into(),
            }],
            data_freshness_note: "as of now".into(),
        };
        let request = PromptBuilder::build(&payload, None);
        assert!(!request.system.contains("\"citations\": []"));
    }

    #[test]
    fn ask_athena_gets_the_chat_schema_not_the_verdict_schema() {
        // Regression test for the bug where every chat message got
        // "Free-form question, no Decision Engine verdict to restate."
        // back verbatim: `OUTPUT_SCHEMA` requires `reasoning` restricted
        // to citing evidence IDs, which is empty for almost every chat
        // message, so the model correctly had nothing to say. Chat must
        // get `CHAT_OUTPUT_SCHEMA` (`answer`, not `reasoning`) instead.
        let payload = EvidencePayload {
            capability: "ask_athena",
            verdict_headline: "Ask Athena".into(),
            verdict_reasoning: "Free-form question, no Decision Engine verdict to restate.".into(),
            confidence: "insufficient_data",
            evidence: vec![],
            data_freshness_note: "as of now".into(),
        };
        let request = PromptBuilder::build(&payload, Some("what's a good way to study for finals?".into()));
        assert!(request.output_schema.contains("\"answer\""));
        assert!(!request.output_schema.contains("\"reasoning\""));
        assert!(
            request.system.contains("general study advice"),
            "chat mode should get CHAT_PERSONA, not the restate-only PERSONA"
        );
    }

    #[test]
    fn non_chat_capabilities_still_get_the_verdict_schema() {
        let payload = EvidencePayload {
            capability: "daily_briefing",
            verdict_headline: "Work on: X".into(),
            verdict_reasoning: "because Y".into(),
            confidence: "inferred",
            evidence: vec![],
            data_freshness_note: "as of now".into(),
        };
        let request = PromptBuilder::build(&payload, None);
        assert!(request.output_schema.contains("\"reasoning\""));
        assert!(!request.output_schema.contains("\"answer\""));
    }

    #[test]
    fn reflection_question_is_carried_through_unmodified() {
        let payload = EvidencePayload {
            capability: "daily_briefing",
            verdict_headline: "Work on: X".into(),
            verdict_reasoning: "because Y".into(),
            confidence: "inferred",
            evidence: vec![],
            data_freshness_note: "as of now".into(),
        };
        let request = PromptBuilder::build(&payload, Some("why not Z instead?".into()));
        assert_eq!(request.question.as_deref(), Some("why not Z instead?"));
    }
}
