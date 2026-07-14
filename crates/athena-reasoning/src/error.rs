use std::fmt;

/// Typed error enum for `athena-reasoning`.
///
/// Per Implementation Plan §6, every crate owns its own typed error enum.
/// S01 ships no variants beyond what compiles — real variants (e.g. a
/// grounding-check failure, an `LlmProvider` timeout) are added once
/// those code paths exist.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReasoningError {
    /// Placeholder variant proving the enum compiles and is constructible.
    Unspecified,
}

impl fmt::Display for ReasoningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReasoningError::Unspecified => write!(f, "unspecified reasoning error"),
        }
    }
}

impl std::error::Error for ReasoningError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reasoning_error_is_constructible() {
        let err = ReasoningError::Unspecified;
        assert_eq!(err, ReasoningError::Unspecified);
        assert_eq!(err.to_string(), "unspecified reasoning error");
    }
}
