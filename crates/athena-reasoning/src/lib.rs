//! `athena-reasoning` — AI orchestration: retrieval, prompt construction,
//! grounding validation, confidence labeling, local-model fallback
//! (Master Spec §4.5).
//!
//! S01 (Foundation Scaffold) ships this crate empty — no `LlmProvider`
//! trait, no `providers/` implementations, no grounding-check logic yet
//! (SPRINT1_SPEC.md §1, explicitly out of scope for this sprint).

pub mod error;

pub use error::ReasoningError;
