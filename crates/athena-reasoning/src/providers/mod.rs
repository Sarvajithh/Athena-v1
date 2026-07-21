//! The four `LlmProvider` implementations (06_AI_ENGINE.md §9):
//!   - `cloud`  — Anthropic Claude (paid, primary)
//!   - `gemini` — Google Gemini (free tier, second cloud option)
//!   - `hf`     — Hugging Face Inference API (free tier, third)
//!   - `local`  — Ollama (local, always-available last resort)
//!
//! The cascade order is established in `athena-app::commands::ai::build_synthesizer`,
//! not here. See each module's doc comment for model recommendations and
//! how to get a token. `pipeline::Synthesizer` falls through to the
//! zero-LLM template (`output::Recommendation::from_template`) if every
//! provider in the list is unavailable — no special-casing needed.

pub mod cloud;
pub mod gemini;
pub mod hf;
pub mod local;
