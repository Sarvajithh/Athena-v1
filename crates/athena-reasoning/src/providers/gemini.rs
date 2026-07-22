//! Google Gemini `LlmProvider` (06_AI_ENGINE.md §9, third cloud option).
//!
//! Uses the Gemini `generateContent` REST endpoint
//! (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`),
//! authenticated with an API key passed as the `x-goog-api-key` header
//! (Google's documented alternative to the `?key=` query-string form —
//! avoids the key ending up in request-URL logs). Same contract as
//! every other `LlmProvider` in this crate: what leaves the device is
//! exactly `PromptRequest`'s fields, nothing more (§9).
//!
//! **Free-tier model choice:** `"gemini-2.0-flash"` — fast, generous
//! free-tier quota, solid JSON instruction-following. Swap by passing a
//! different `model` string at construction (`athena-app` wiring), same
//! "one-line config change, not a code change" precedent
//! `AnthropicProvider`/`HuggingFaceProvider` already establish.
//!
//! Slot in the cascade in `commands/ai.rs`: alongside Anthropic and
//! Hugging Face, before Ollama (local, always-last). A missing or
//! invalid Gemini key simply means this provider is left out of the
//! `Vec<Box<dyn LlmProvider>>` the cascade is built from — never a
//! startup error, matching every other optional cloud provider here.
//!
//! **Getting a free API key:**
//!   1. <https://aistudio.google.com/app/apikey>
//!   2. "Create API key" (no billing required for the free tier)
//!   3. `await window.__TAURI__.invoke('save_gemini_api_key', { key: '...' })`

use std::time::Duration;

use serde::Deserialize;

use crate::error::ReasoningError;
use crate::provider::{LlmProvider, PromptRequest};

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

pub struct GeminiProvider {
    api_key: String,
    model: String,
    client: reqwest::blocking::Client,
}

impl GeminiProvider {
    /// `model` is a Gemini model ID, e.g. `"gemini-2.0-flash"`. Not
    /// hardcoded here — same "5-year risk" reasoning §9 gives for the
    /// trait itself, one level down to the model string, that
    /// `AnthropicProvider::new` already documents.
    pub fn new(api_key: String, model: String) -> GeminiProvider {
        GeminiProvider {
            api_key,
            model,
            // Stage 4 calls are short (one narrow prompt, one small
            // JSON reply) — same fixed, generous timeout precedent as
            // `AnthropicProvider`.
            client: reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| reqwest::blocking::Client::new()),
        }
    }

    fn endpoint(&self) -> String {
        format!("{GEMINI_API_BASE}/{}:generateContent", self.model)
    }

    /// Gemini has no dedicated "system" role in its content array the
    /// way Anthropic/OpenAI-shaped APIs do at this call surface —
    /// `systemInstruction` is a top-level sibling of `contents`, not a
    /// message. The user turn carries the same verdict/evidence/schema/
    /// question sections every other provider's `user_content`/
    /// `messages` builds (`cloud.rs`, `hf.rs`).
    fn user_text(request: &PromptRequest) -> String {
        let mut sections = vec![
            format!("VERDICT (already decided, do not change it):\n{}", request.verdict_json),
            format!("EVIDENCE (the only IDs you may cite):\n{}", request.evidence_json),
            format!(
                "RESPOND WITH JSON MATCHING THIS SCHEMA, NOTHING ELSE — no markdown fences, \
                 no preamble, no explanation outside the JSON object:\n{}",
                request.output_schema
            ),
        ];
        if let Some(question) = &request.question {
            sections.push(format!("Follow-up question about this same verdict: \"{question}\""));
        }
        sections.join("\n\n")
    }
}

#[derive(Debug, Deserialize)]
struct GeminiPart {
    #[serde(default)]
    text: Option<String>,
}
#[derive(Debug, Deserialize)]
struct GeminiContent {
    #[serde(default)]
    parts: Vec<GeminiPart>,
}
#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}
#[derive(Debug, Deserialize)]
struct GeminiGenerateResponse {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
}

impl LlmProvider for GeminiProvider {
    fn name(&self) -> &'static str {
        "gemini"
    }

    fn complete(&self, request: &PromptRequest) -> Result<String, ReasoningError> {
        let body = serde_json::json!({
            "systemInstruction": {
                "parts": [{ "text": request.system }]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{ "text": Self::user_text(request) }]
                }
            ],
            "generationConfig": {
                // temp=0 for deterministic, schema-faithful JSON output,
                // same rationale as `HuggingFaceProvider::complete`.
                "temperature": 0.0,
                "maxOutputTokens": 512,
                // Gemini-native JSON-mode toggle: asks the API itself to
                // constrain output to valid JSON, on top of the schema
                // instruction already in the prompt (defense in depth,
                // not a replacement for Stage 5's grounding check).
                "responseMimeType": "application/json"
            }
        });

        let response = self
            .client
            .post(self.endpoint())
            .header("x-goog-api-key", &self.api_key)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .map_err(|e| ReasoningError::ProviderUnavailable(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            // Google's error body (JSON) usually names the specific quota
            // metric that tripped a 429 (e.g. which of RPM/TPM/RPD, or a
            // free-tier-disabled condition) — genuinely different
            // information than the status code alone, and previously
            // discarded here entirely, which is why a 429 in the log gave
            // no way to tell which limit was actually hit.
            let body = response.text().unwrap_or_default();
            return Err(ReasoningError::ProviderUnavailable(format!(
                "Gemini API returned {status}: {body}"
            )));
        }

        let parsed: GeminiGenerateResponse = response
            .json()
            .map_err(|e| ReasoningError::ProviderUnavailable(e.to_string()))?;

        parsed
            .candidates
            .into_iter()
            .next()
            .and_then(|c| c.content.parts.into_iter().find_map(|p| p.text))
            .ok_or_else(|| ReasoningError::ProviderUnavailable("empty candidates array".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_includes_model_and_method() {
        let provider = GeminiProvider::new("key".into(), "gemini-2.0-flash".into());
        assert_eq!(
            provider.endpoint(),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        );
    }

    #[test]
    fn user_text_never_omits_the_evidence_or_schema() {
        let request = PromptRequest {
            system: "persona".into(),
            verdict_json: "{\"headline\":\"X\"}".into(),
            evidence_json: "[{\"id\":7}]".into(),
            output_schema: "{\"type\":\"object\"}".into(),
            question: None,
            stricter: false,
        };
        let content = GeminiProvider::user_text(&request);
        assert!(content.contains("\"id\":7"));
        assert!(content.contains("object"));
    }

    #[test]
    fn reflection_question_is_appended_not_substituted() {
        let request = PromptRequest {
            system: "persona".into(),
            verdict_json: "{}".into(),
            evidence_json: "[]".into(),
            output_schema: "{}".into(),
            question: Some("why not the other one?".into()),
            stricter: false,
        };
        let content = GeminiProvider::user_text(&request);
        assert!(content.contains("why not the other one?"));
    }
}
