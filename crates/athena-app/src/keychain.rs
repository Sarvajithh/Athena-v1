//! Credential storage for this app: the GitHub personal access token
//! (07_INTEGRATIONS.md §4) plus, as of the 2026-07-17 OAuth amendment
//! (§1.8-§1.10), one OAuth access+refresh token set per OAuth connector
//! (Gmail, Google Classroom, Notion). Every other Version 1 connector
//! needs no credential at all (Codeforces, LeetCode — public APIs) or is
//! a local file parse (Calendar, PDF, CSV — nothing to authenticate to).
//!
//! `keyring::Entry` talks to the OS-native store directly — Keychain on
//! macOS, Credential Manager on Windows, Secret Service on Linux — the
//! same three backends §4 names. Nothing here ever touches SQLite or a
//! config file; a token never becomes part of `athena.sqlite` or its
//! WAL/journal files.

use serde::{Deserialize, Serialize};

const SERVICE: &str = "athena-app";
const GITHUB_TOKEN_USERNAME: &str = "github-personal-access-token";
const OAUTH_USERNAME_PREFIX: &str = "oauth-tokens-";
const ANTHROPIC_API_KEY_USERNAME: &str = "anthropic-api-key";
const HF_API_TOKEN_USERNAME: &str = "huggingface-api-token";

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

// ---------------------------------------------------------------------
// OAuth token storage (§1.8-§1.10, 2026-07-17 amendment): Gmail,
// Google Classroom, Notion. One keychain entry per provider key
// ("gmail" / "google_classroom" / "notion"), so disconnecting one never
// touches another's stored tokens.
// ---------------------------------------------------------------------

/// An OAuth access (+ optional refresh) token set, exactly as stored in
/// the keychain — never in SQLite (§4's non-negotiable, extended to
/// these three connectors by the amendment).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredOAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// ISO-8601 instant the access token expires, if the provider told
    /// us. `None` doesn't mean "never expires" (Notion genuinely
    /// doesn't; Google always tells us) — it means "unknown," so the
    /// caller relies on a real 401 to decide a refresh is needed rather
    /// than assuming indefinite validity.
    pub expires_at: Option<String>,
}

fn oauth_entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &format!("{OAUTH_USERNAME_PREFIX}{provider}")).map_err(|e| e.to_string())
}

/// Saves (or overwrites) the token set for one OAuth provider key.
pub fn save_oauth_tokens(provider: &str, tokens: &StoredOAuthTokens) -> Result<(), String> {
    let json = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    oauth_entry(provider)?.set_password(&json).map_err(|e| e.to_string())
}

/// Returns the stored token set for one OAuth provider key, or `None` if
/// never connected / already disconnected — same "absence is a normal
/// state, not an error" precedent as `get_github_token`.
pub fn get_oauth_tokens(provider: &str) -> Result<Option<StoredOAuthTokens>, String> {
    match oauth_entry(provider)?.get_password() {
        Ok(json) => serde_json::from_str(&json).map(Some).map_err(|e| e.to_string()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Removes the stored token set for one OAuth provider key
/// (disconnecting it). Idempotent, same precedent as `delete_github_token`.
pub fn delete_oauth_tokens(provider: &str) -> Result<(), String> {
    match oauth_entry(provider)?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}


/// Whether an OAuth provider currently has a stored token set — the
/// OAuth-connector equivalent of `has_github_token`, used the same way
/// (rendering "connected" state without ever handing the token itself
/// back over IPC).
pub fn has_oauth_tokens(provider: &str) -> bool {
    matches!(get_oauth_tokens(provider), Ok(Some(_)))
}

// ---------------------------------------------------------------------
// Anthropic API key (06_AI_ENGINE.md §9's cloud provider). Same
// "never in SQLite, never in a plaintext config file, never logged"
// rule §4 of 07_INTEGRATIONS.md already applies to every other
// connector credential — the AI layer's cloud provider is not a special
// case. Absence is the normal, fully-supported "no cloud provider
// configured" state (§10), not an error.
// ---------------------------------------------------------------------

fn anthropic_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ANTHROPIC_API_KEY_USERNAME).map_err(|e| e.to_string())
}

pub fn save_anthropic_api_key(key: &str) -> Result<(), String> {
    anthropic_entry()?.set_password(key).map_err(|e| e.to_string())
}

pub fn get_anthropic_api_key() -> Result<Option<String>, String> {
    match anthropic_entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_anthropic_api_key() -> Result<(), String> {
    match anthropic_entry()?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_anthropic_api_key() -> bool {
    matches!(get_anthropic_api_key(), Ok(Some(_)))
}

// ---------------------------------------------------------------------
// Hugging Face API token (providers/hf.rs). Free-tier token from
// https://huggingface.co/settings/tokens — role "Inference" is enough.
// Same "never in SQLite, never logged" rule as every other credential
// here. Absence means "HF provider not configured" — the cascade falls
// through to Ollama / template, never an error.
// ---------------------------------------------------------------------

fn hf_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, HF_API_TOKEN_USERNAME).map_err(|e| e.to_string())
}

pub fn save_hf_api_token(token: &str) -> Result<(), String> {
    hf_entry()?.set_password(token).map_err(|e| e.to_string())
}

pub fn get_hf_api_token() -> Result<Option<String>, String> {
    match hf_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_hf_api_token() -> Result<(), String> {
    match hf_entry()?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_hf_api_token() -> bool {
    matches!(get_hf_api_token(), Ok(Some(_)))
}
