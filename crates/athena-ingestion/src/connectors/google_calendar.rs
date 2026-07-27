//! Google Calendar connector (07_INTEGRATIONS.md §1.9-family — added
//! alongside Gmail/Classroom as a fourth Google-backed connector, same
//! shared OAuth client per `run_google_oauth_connect`'s own doc
//! comment: "shares the same Google OAuth client and token endpoint").
//! Read-only sync of the user's primary calendar's upcoming events —
//! never a write, never an invite sent, never another calendar's
//! events (no `calendarList` scan) — scope:
//! `.../auth/calendar.events.readonly`.
//!
//! Chosen over Notion for the same class of "pull deadlines from an
//! external source" job: this app already holds a configured Google
//! OAuth client ID/secret (shared with Gmail/Classroom), so this
//! connector needs no separate app registration, no separate redirect
//! URI to register, and reuses `run_google_oauth_connect`'s existing,
//! already-working ephemeral-loopback-port flow rather than Notion's
//! fixed-port flow (`start_notion_oauth`'s own `NOTION_OAUTH_PORT`),
//! which is the one thing Notion's connector required calibrating a
//! specific registered port against.

use serde::Deserialize;

use crate::error::IngestionError;

pub const AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const SCOPE: &str = "https://www.googleapis.com/auth/calendar.events.readonly";

#[derive(Debug, Clone, PartialEq)]
pub struct CalendarEvent {
    pub event_id: String,
    pub title: String,
    /// ISO-8601 instant, or `None` for an all-day event with only a
    /// `date` (no `dateTime`) — Google's own event shape distinguishes
    /// the two rather than always supplying a time.
    pub starts_at: Option<String>,
    pub location: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EventsResponse {
    items: Option<Vec<EventDto>>,
}

#[derive(Debug, Deserialize)]
struct EventDto {
    id: String,
    #[serde(default)]
    summary: Option<String>,
    start: Option<EventDateTime>,
    location: Option<String>,
    description: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EventDateTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

fn build_client(access_token: &str) -> Result<reqwest::Client, IngestionError> {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};

    let mut headers = HeaderMap::new();
    let value = HeaderValue::from_str(&format!("Bearer {access_token}"))
        .map_err(|e| IngestionError::Parse(format!("calendar auth header: {e}")))?;
    headers.insert(AUTHORIZATION, value);

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| IngestionError::Network(format!("calendar client build: {e}")))
}

/// Upcoming events on the user's primary calendar — `timeMin=now`
/// (never past events, matching the "deadlines going forward" purpose
/// this connector exists for), `singleEvents=true` (expands recurring
/// events into individual instances rather than one opaque recurring
/// series the rest of this app has no shape for), `orderBy=startTime`,
/// capped at 50 same as every other list endpoint in this codebase
/// (Classroom's `pageSize=50` precedent). Cancelled events
/// (`status: "cancelled"`) are filtered out here — a deleted event is
/// not a deadline.
pub async fn fetch_events(access_token: &str) -> Result<Vec<CalendarEvent>, IngestionError> {
    let client = build_client(access_token)?;
    let time_min = chrono::Utc::now().to_rfc3339();
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events\
         ?timeMin={}&singleEvents=true&orderBy=startTime&maxResults=50",
        urlencoding_encode(&time_min)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| IngestionError::Network(format!("calendar events: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(IngestionError::AuthExpired("calendar access token rejected".into()));
    }
    if !resp.status().is_success() {
        return Err(IngestionError::Network(format!(
            "calendar events returned {}",
            resp.status()
        )));
    }

    let parsed: EventsResponse = resp
        .json()
        .await
        .map_err(|e| IngestionError::Parse(format!("calendar events payload: {e}")))?;

    Ok(parsed
        .items
        .unwrap_or_default()
        .into_iter()
        .filter(|e| e.status.as_deref() != Some("cancelled"))
        .map(|e| CalendarEvent {
            event_id: e.id,
            title: e.summary.unwrap_or_else(|| "(untitled event)".to_string()),
            starts_at: e.start.and_then(|s| s.date_time.or(s.date)),
            location: e.location,
            description: e.description,
        })
        .collect())
}

/// Minimal percent-encoding for the one query-string value this module
/// builds (an RFC-3339 timestamp) — narrow on purpose rather than
/// pulling in a general-purpose URL crate for a single field with a
/// known, small character set (`:`, `+`, digits, `-`, `.`).
fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ':' => "%3A".to_string(),
            '+' => "%2B".to_string(),
            c => c.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencoding_encode_escapes_colon_and_plus() {
        assert_eq!(urlencoding_encode("2026-07-26T00:00:00+00:00"), "2026-07-26T00%3A00%3A00%2B00%3A00");
    }
}
