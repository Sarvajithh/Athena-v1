//! Google Calendar connector (07_INTEGRATIONS.md §1.9-family — added
//! alongside Gmail/Classroom as a fourth Google-backed connector, same
//! shared OAuth client per `run_google_oauth_connect`'s own doc
//! comment: "shares the same Google OAuth client and token endpoint").
//! Read-only sync of the user's *chosen* calendar's upcoming events —
//! never a write, never an invite sent — scope:
//! `.../auth/calendar.events.readonly`.
//!
//! Originally hardcoded to the `primary` calendar only, with an
//! explicit "no `calendarList` scan" as a scope-minimization choice.
//! Revised ("Course Context" reshape): many people's actual deadlines
//! live on a secondary/shared calendar (one Classroom or another
//! person created), not their own primary one, which made the
//! `primary`-only version silently useless for them. `list_calendars`
//! now does read `calendarList` — still read-only, still the same
//! already-granted `calendar.events.readonly` scope (no new consent
//! needed) — solely to populate a "which calendar?" picker once, right
//! after connecting; `fetch_events` still reads events from exactly one
//! calendar per sync, the one the person picked, not every calendar it
//! can see.
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

/// One entry from `GET /calendarList` — enough to let the person pick
/// which calendar to read (07_INTEGRATIONS.md "Course Context" reshape:
/// this connector originally hardcoded `primary`, which silently misses
/// deadlines living on any secondary/shared calendar — e.g. one a
/// Classroom class or another person auto-created).
#[derive(Debug, Clone, Deserialize)]
pub struct CalendarListEntry {
    pub id: String,
    pub summary: String,
    #[serde(default)]
    pub primary: bool,
}

#[derive(Debug, Deserialize)]
struct CalendarListResponse {
    items: Option<Vec<CalendarListEntry>>,
}

/// Every calendar the token can see (read-only — same
/// `calendar.events.readonly` scope already covers `calendarList.list`,
/// no extra scope needed). Used once, right after connecting, to
/// populate the "which calendar?" picker — never called on every sync.
pub async fn list_calendars(access_token: &str) -> Result<Vec<CalendarListEntry>, IngestionError> {
    let client = build_client(access_token)?;
    let resp = client
        .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
        .send()
        .await
        .map_err(|e| IngestionError::Network(format!("calendar list: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(IngestionError::AuthExpired("calendar access token rejected".into()));
    }
    if !resp.status().is_success() {
        return Err(IngestionError::Network(format!("calendar list returned {}", resp.status())));
    }

    let parsed: CalendarListResponse = resp
        .json()
        .await
        .map_err(|e| IngestionError::Parse(format!("calendar list payload: {e}")))?;
    Ok(parsed.items.unwrap_or_default())
}

/// Upcoming events on `calendar_id` (defaults to `"primary"` if the
/// person never picked one — same behavior as before this change, so
/// an existing connection with no stored preference keeps working
/// exactly as it did) — `timeMin=now`
/// (never past events, matching the "deadlines going forward" purpose
/// this connector exists for), `singleEvents=true` (expands recurring
/// events into individual instances rather than one opaque recurring
/// series the rest of this app has no shape for), `orderBy=startTime`,
/// capped at 50 same as every other list endpoint in this codebase
/// (Classroom's `pageSize=50` precedent). Cancelled events
/// (`status: "cancelled"`) are filtered out here — a deleted event is
/// not a deadline.
pub async fn fetch_events(access_token: &str, calendar_id: &str) -> Result<Vec<CalendarEvent>, IngestionError> {
    let client = build_client(access_token)?;
    let time_min = chrono::Utc::now().to_rfc3339();
    let calendar_id = if calendar_id.trim().is_empty() { "primary" } else { calendar_id.trim() };
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events\
         ?timeMin={}&singleEvents=true&orderBy=startTime&maxResults=50",
        urlencoding_encode(calendar_id),
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
/// Narrow percent-encoding for the two kinds of value this module
/// builds: an RFC-3339 `timeMin` (needs `:`/`+` escaped) and a
/// `calendar_id` path segment, which — for a secondary/shared calendar
/// — is typically an address like `abc123@group.calendar.google.com`
/// (needs `@` escaped so it isn't read as a URL authority separator)
/// and occasionally contains other reserved characters a plain email
/// wouldn't, hence `%2F` for `/` too. Still narrow on purpose (see
/// original doc comment) rather than pulling in a general-purpose URL
/// crate for this small, known character set.
fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ':' => "%3A".to_string(),
            '+' => "%2B".to_string(),
            '@' => "%40".to_string(),
            '/' => "%2F".to_string(),
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
