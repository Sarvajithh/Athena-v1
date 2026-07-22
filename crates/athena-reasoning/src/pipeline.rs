//! Stages 4–5 (06_AI_ENGINE.md §3) and the Offline Fallback (§10).
//!
//! `Synthesizer` is the one place that calls an `LlmProvider` and the
//! one place that runs the grounding check. Every capability module in
//! `capabilities/` goes through this — none of them talks to a provider
//! directly, so the degrade path (§10: cloud → local → template) and the
//! grounding check (§3 Stage 5) are enforced exactly once, not
//! reimplemented per capability.
//!
//! "If the LLM is unavailable, Athena must remain fully usable": this
//! module is why that's true structurally, not by convention.
//! `Synthesizer::synthesize` cannot return an error — the worst case is
//! `Recommendation::from_template`, always available, always grounded.

use serde::Deserialize;

use crate::context::EvidencePayload;
use crate::output::Recommendation;
use crate::prompt::PromptBuilder;
use crate::provider::LlmProvider;

/// The raw shape a provider's JSON response is expected to satisfy
/// (`prompt::OUTPUT_SCHEMA`). Parsing into this struct *is* most of
/// Stage 5's mechanical check — a response that doesn't even deserialize
/// this way is treated as a grounding failure, not specially handled.
#[derive(Debug, Deserialize)]
struct SynthesisResponse {
    #[allow(dead_code)]
    verdict: String,
    reasoning: String,
    #[serde(default)]
    citations: Vec<i64>,
}

/// Stages 4–5's orchestrator. Holds an ordered list of providers — by
/// convention `[cloud, local]` (§9/§10.1) — tried in order for each
/// call; the zero-LLM template (§10.2) is not a provider in this list,
/// it's the built-in final step every call falls through to.
pub struct Synthesizer {
    providers: Vec<Box<dyn LlmProvider>>,
}

impl Synthesizer {
    /// `providers` should be ordered cloud-first, local-fallback-second,
    /// per §10.1 ("if the cloud provider is unreachable, the same
    /// trait-bounded call goes to the local model"). An empty list is
    /// valid and simply means every call resolves to the template —
    /// exactly the state the app should be in when no LLM is configured
    /// at all, not a special case to guard against.
    pub fn new(providers: Vec<Box<dyn LlmProvider>>) -> Synthesizer {
        Synthesizer { providers }
    }

    /// Runs Stage 3 (via `PromptBuilder`) and Stages 4–5 for one
    /// `EvidencePayload`, trying each provider in order, retrying once
    /// per provider on a grounding failure (§3), and falling through to
    /// the template (§10.2) if every provider is unavailable or every
    /// attempt fails grounding. `question` is set only by the Reflection
    /// Engine (§4.7).
    pub fn synthesize(&self, payload: &EvidencePayload, question: Option<String>) -> Recommendation {
        let request = PromptBuilder::build(payload, question);

        for provider in &self.providers {
            if let Some(rec) = self.try_provider(provider.as_ref(), payload, &request) {
                return rec;
            }
        }

        // §10.2: no provider available, or every attempt failed
        // grounding twice — the fully-grounded, prose-free fallback.
        Recommendation::from_template(payload)
    }

    /// One provider's full attempt: first try, and — only on a
    /// grounding failure, never on a transport failure — one stricter
    /// retry (§3: "reject and retry once with a stricter prompt; a
    /// second failure → template-flattened output"). Returns `None` to
    /// tell the caller to move on to the next provider (or the
    /// template); a transport failure here always returns `None`
    /// immediately, since retrying a stricter prompt against a provider
    /// that isn't reachable would just be a second timeout.
    fn try_provider(
        &self,
        provider: &dyn LlmProvider,
        payload: &EvidencePayload,
        request: &crate::provider::PromptRequest,
    ) -> Option<Recommendation> {
        match provider.complete(request) {
            Ok(raw) => match Self::grounded_recommendation(payload, &raw, provider.name()) {
                Some(rec) => return Some(rec),
                None => {
                    tracing::debug!(
                        event = "synthesizer_grounding_failed",
                        provider = provider.name(),
                        "response failed grounding, retrying once with a stricter prompt"
                    );
                    // Grounding failed on the raw response — retry once,
                    // stricter, per §3. A transport failure on the retry
                    // still falls through to the next provider/template.
                    let retry_request = request.stricter_retry();
                    match provider.complete(&retry_request) {
                        Ok(retry_raw) => match Self::grounded_recommendation(payload, &retry_raw, provider.name()) {
                            Some(rec) => return Some(rec),
                            None => {
                                tracing::warn!(
                                    event = "synthesizer_grounding_failed_after_retry",
                                    provider = provider.name(),
                                    "stricter retry still failed grounding, moving to next provider"
                                );
                            }
                        },
                        Err(e) => {
                            tracing::warn!(
                                event = "synthesizer_provider_unavailable",
                                provider = provider.name(),
                                error = %e,
                                "stricter retry transport failure, moving to next provider"
                            );
                        }
                    }
                }
            },
            Err(e) => {
                // Provider unreachable (§10.1) — no retry, move on. This
                // is the one place a Gemini/HF/Ollama HTTP error, timeout,
                // or auth rejection actually surfaces anywhere: previously
                // it was discarded here with no log line at all, which
                // made "every provider silently falls to template" all
                // but undiagnosable from outside this function.
                tracing::warn!(
                    event = "synthesizer_provider_unavailable",
                    provider = provider.name(),
                    error = %e,
                    "provider unreachable, moving to next provider"
                );
            }
        }
        None
    }

    /// Stage 5: parses the provider's raw JSON, then verifies every
    /// cited ID is present in the Stage 1 payload's evidence set —
    /// "every cited ID and every factual claim in the output is
    /// verified against the Stage 1 payload" (§3). This crate cannot
    /// verify open-ended prose claims against evidence text (that would
    /// need its own LLM call, which §3 does not specify), so the
    /// mechanical, always-checkable part of the rule — citations are a
    /// subset of known evidence IDs — is what's enforced here; that is
    /// exactly the seam constrained output (§7.4) is designed to make
    /// tractable.
    fn grounded_recommendation(payload: &EvidencePayload, raw: &str, provider_name: &str) -> Option<Recommendation> {
        let parsed: SynthesisResponse = serde_json::from_str(raw).ok()?;
        if parsed.reasoning.trim().is_empty() {
            return None;
        }
        let known_ids: std::collections::HashSet<i64> = payload.evidence.iter().map(|e| e.id).collect();
        if parsed.citations.iter().any(|id| !known_ids.contains(id)) {
            return None;
        }
        Some(Recommendation::from_synthesis(
            payload,
            parsed.reasoning,
            parsed.citations,
            provider_name,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::EvidenceItem;
    use crate::error::ReasoningError;
    use crate::provider::PromptRequest;

    fn payload() -> EvidencePayload {
        EvidencePayload {
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
        }
    }

    struct AlwaysUnavailable;
    impl LlmProvider for AlwaysUnavailable {
        fn name(&self) -> &'static str {
            "unavailable"
        }
        fn complete(&self, _request: &PromptRequest) -> Result<String, ReasoningError> {
            Err(ReasoningError::ProviderUnavailable("no network".into()))
        }
    }

    struct AlwaysGrounded;
    impl LlmProvider for AlwaysGrounded {
        fn name(&self) -> &'static str {
            "test-provider"
        }
        fn complete(&self, _request: &PromptRequest) -> Result<String, ReasoningError> {
            Ok(r#"{"verdict":"Work on: X","reasoning":"X is highest leverage per evidence 7.","citations":[7]}"#.to_string())
        }
    }

    struct AlwaysUngrounded;
    impl LlmProvider for AlwaysUngrounded {
        fn name(&self) -> &'static str {
            "hallucinating-provider"
        }
        fn complete(&self, _request: &PromptRequest) -> Result<String, ReasoningError> {
            Ok(r#"{"verdict":"Work on: X","reasoning":"X matters because of thing 999.","citations":[999]}"#.to_string())
        }
    }

    #[test]
    fn no_providers_configured_falls_through_to_template() {
        let synth = Synthesizer::new(vec![]);
        let rec = synth.synthesize(&payload(), None);
        assert_eq!(rec.source, "template");
        assert_eq!(rec.grounded_in, vec![7]);
    }

    #[test]
    fn unavailable_provider_falls_through_to_template_without_erroring() {
        let synth = Synthesizer::new(vec![Box::new(AlwaysUnavailable)]);
        let rec = synth.synthesize(&payload(), None);
        assert_eq!(rec.source, "template");
    }

    #[test]
    fn grounded_response_is_used_as_is() {
        let synth = Synthesizer::new(vec![Box::new(AlwaysGrounded)]);
        let rec = synth.synthesize(&payload(), None);
        assert_eq!(rec.source, "test-provider");
        assert_eq!(rec.grounded_in, vec![7]);
        assert!(rec.reasoning.contains("highest leverage"));
    }

    #[test]
    fn ungrounded_response_never_reaches_the_caller_falls_through_to_template() {
        let synth = Synthesizer::new(vec![Box::new(AlwaysUngrounded)]);
        let rec = synth.synthesize(&payload(), None);
        // Retries once, still ungrounded, falls to template (no more
        // providers configured) — never leaks the citation-999 claim.
        assert_eq!(rec.source, "template");
        assert_eq!(rec.grounded_in, vec![7]);
    }

    #[test]
    fn cloud_unavailable_falls_through_to_local_before_template() {
        let synth = Synthesizer::new(vec![Box::new(AlwaysUnavailable), Box::new(AlwaysGrounded)]);
        let rec = synth.synthesize(&payload(), None);
        assert_eq!(rec.source, "test-provider");
    }
}
