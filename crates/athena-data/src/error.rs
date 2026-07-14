use std::fmt;

/// Typed error enum for `athena-data`.
///
/// Per Implementation Plan §6, every crate owns its own typed error enum
/// and no `anyhow::Error` crosses a crate boundary. S01 needs exactly two
/// real variants because the connection/migration bootstrap (Objective 4)
/// is real fallible code in this sprint, unlike the other four crates
/// which ship an empty placeholder variant only.
#[derive(Debug)]
pub enum DataError {
    /// The underlying SQLite connection could not be opened or configured
    /// (e.g. WAL mode could not be enabled).
    Connection(rusqlite::Error),
    /// The migration runner failed to apply one or more pending
    /// migrations.
    Migration(refinery::Error),
}

impl fmt::Display for DataError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DataError::Connection(e) => write!(f, "database connection error: {e}"),
            DataError::Migration(e) => write!(f, "migration error: {e}"),
        }
    }
}

impl std::error::Error for DataError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            DataError::Connection(e) => Some(e),
            DataError::Migration(e) => Some(e),
        }
    }
}

impl From<rusqlite::Error> for DataError {
    fn from(e: rusqlite::Error) -> Self {
        DataError::Connection(e)
    }
}

impl From<refinery::Error> for DataError {
    fn from(e: refinery::Error) -> Self {
        DataError::Migration(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_error_variants_are_constructible_and_display() {
        let conn_err = DataError::Connection(rusqlite::Error::InvalidQuery);
        assert!(conn_err.to_string().contains("database connection error"));
    }
}
