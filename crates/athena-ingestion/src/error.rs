use std::fmt;

/// Typed error enum for `athena-ingestion`.
///
/// Per Implementation Plan §6, every crate owns its own typed error enum.
/// S01 ships no variants beyond what compiles — real variants (network
/// failure, malformed CSV/ICS, staleness) are added once a connector
/// exists to raise them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IngestionError {
    /// Placeholder variant proving the enum compiles and is constructible.
    Unspecified,
}

impl fmt::Display for IngestionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IngestionError::Unspecified => write!(f, "unspecified ingestion error"),
        }
    }
}

impl std::error::Error for IngestionError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ingestion_error_is_constructible() {
        let err = IngestionError::Unspecified;
        assert_eq!(err, IngestionError::Unspecified);
        assert_eq!(err.to_string(), "unspecified ingestion error");
    }
}
