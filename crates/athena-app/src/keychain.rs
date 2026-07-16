//! The one credential store this app has: a GitHub personal access
//! token (07_INTEGRATIONS.md §4). Every other Version 1 connector needs
//! no credential at all (Codeforces, LeetCode — public APIs) or is a
//! local file parse (Calendar, PDF, CSV — nothing to authenticate to).
//!
//! `keyring::Entry` talks to the OS-native store directly — Keychain on
//! macOS, Credential Manager on Windows, Secret Service on Linux — the
//! same three backends §4 names. Nothing here ever touches SQLite or a
//! config file; a token never becomes part of `athena.sqlite` or its
//! WAL/journal files.

const SERVICE: &str = "athena-app";
const GITHUB_TOKEN_USERNAME: &str = "github-personal-access-token";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, GITHUB_TOKEN_USERNAME).map_err(|e| e.to_string())
}

/// Saves the token the user pastes in during the Connectors step. §4:
/// "a narrow, user-generated, revocable token the user creates
/// themselves on the provider's site and pastes in once."
pub fn save_github_token(token: &str) -> Result<(), String> {
    entry()?.set_password(token).map_err(|e| e.to_string())
}

/// Returns the stored token, or `None` if none has been saved yet — not
/// an error; "no token" is this connector's normal disconnected state.
pub fn get_github_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Removes the stored token (disconnecting GitHub). Treats "nothing to
/// remove" as success, not an error — disconnecting an
/// already-disconnected source is idempotent, matching
/// `athena_data::repositories::integrations::link_github_repo`'s own
/// idempotency precedent.
pub fn delete_github_token() -> Result<(), String> {
    match entry()?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Whether a token is currently stored — used to render the Connectors
/// step's "connected" state without ever handing the token itself back
/// to the frontend (§4/§6: the token never leaves the keychain, not
/// even over the app's own IPC boundary).
pub fn has_github_token() -> bool {
    matches!(get_github_token(), Ok(Some(_)))
}
