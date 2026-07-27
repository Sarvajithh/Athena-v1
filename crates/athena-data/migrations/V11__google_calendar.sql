-- V11__google_calendar.sql
--
-- Adds Google Calendar as a fourth Google-backed OAuth connector,
-- alongside Gmail/Classroom (V5) — reuses the same shared Google OAuth
-- client/token endpoint (`run_google_oauth_connect`'s own doc comment),
-- so this needed no new client credentials, only a new source_key and
-- a table for the one new resource type (events).
--
-- Same SQLite rebuild-for-CHECK-constraint pattern V5 already used to
-- add its three source keys — no other choice, SQLite has no
-- `ALTER TABLE ... ALTER CONSTRAINT`. No data lost, every existing row
-- copied forward unchanged.

CREATE TABLE data_sources_v11 (
    source_key    TEXT PRIMARY KEY CHECK (source_key IN (
                      'codeforces', 'leetcode', 'github', 'calendar_ics',
                      'pdf_import', 'csv_import', 'manual',
                      'gmail', 'google_classroom', 'notion',
                      'google_calendar'
                  )),
    kind          TEXT NOT NULL CHECK (kind IN ('poll', 'import', 'always_on', 'oauth_poll')),
    status        TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN (
                      'disconnected', 'idle', 'syncing', 'ok', 'error'
                  )),
    last_synced_at  TEXT,
    last_error      TEXT,
    config_json     TEXT,
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO data_sources_v11 (source_key, kind, status, last_synced_at, last_error, config_json, updated_at)
    SELECT source_key, kind, status, last_synced_at, last_error, config_json, updated_at FROM data_sources;

DROP TABLE data_sources;
ALTER TABLE data_sources_v11 RENAME TO data_sources;

INSERT INTO data_sources (source_key, kind, status) VALUES
    ('google_calendar', 'oauth_poll', 'disconnected');

-- Upserted by Google's own event ID, same "stable entity updated in
-- place" reasoning as classroom_coursework (V5) — a rescheduled event
-- is an update to the same row, not a new time-series point.
CREATE TABLE calendar_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT    NOT NULL UNIQUE,
    title           TEXT    NOT NULL,
    starts_at       TEXT,
    location        TEXT,
    description     TEXT,
    fetched_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_calendar_events_starts_at ON calendar_events(starts_at);
