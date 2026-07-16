//! `data_sources` + the connector snapshot tables repository
//! (07_INTEGRATIONS.md, V4 migration). One repository covering every
//! Version 1 integration's persistence, mirroring the "one repository
//! per aggregate" precedent loosely — these seven tables are one
//! aggregate in practice (sync status + the typed data it produces),
//! not seven independent domain concepts each deserving their own file.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::error::DataError;

// ---------------------------------------------------------------------
// data_sources — the one row-per-connector status table every
// integration in this document shares (§5's "staleness is a
// first-class, visible state").
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct DataSourceRow {
    pub source_key: String,
    pub kind: String,
    pub status: String,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub config_json: Option<String>,
    pub updated_at: String,
}

fn row_to_data_source(row: &rusqlite::Row<'_>) -> rusqlite::Result<DataSourceRow> {
    Ok(DataSourceRow {
        source_key: row.get(0)?,
        kind: row.get(1)?,
        status: row.get(2)?,
        last_synced_at: row.get(3)?,
        last_error: row.get(4)?,
        config_json: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

const DATA_SOURCE_COLUMNS: &str =
    "source_key, kind, status, last_synced_at, last_error, config_json, updated_at";

/// Every connector's current status — the one query the Connectors step
/// and any future settings screen needs (07_INTEGRATIONS.md §5). Fixed,
/// seeded row set (see V4 migration), so this is never empty.
pub fn list_data_sources(conn: &Connection) -> Result<Vec<DataSourceRow>, DataError> {
    let mut stmt =
        conn.prepare(&format!("SELECT {DATA_SOURCE_COLUMNS} FROM data_sources ORDER BY source_key"))?;
    let rows = stmt
        .query_map([], row_to_data_source)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_data_source(conn: &Connection, source_key: &str) -> Result<Option<DataSourceRow>, DataError> {
    conn.query_row(
        &format!("SELECT {DATA_SOURCE_COLUMNS} FROM data_sources WHERE source_key = ?1"),
        params![source_key],
        row_to_data_source,
    )
    .optional()
    .map_err(DataError::from)
}

/// Persists connector-specific, non-secret configuration (a handle, a
/// username, the linked-repo list) as JSON — never a token; tokens live
/// exclusively in the OS keychain (`athena-app::keychain`,
/// 07_INTEGRATIONS.md §4). Marks the source `idle`/reachable again if it
/// had never been configured before (`disconnected` -> `idle`).
pub fn set_data_source_config(
    conn: &Connection,
    source_key: &str,
    config_json: &str,
) -> Result<(), DataError> {
    conn.execute(
        "UPDATE data_sources SET config_json = ?1, \
         status = CASE WHEN status = 'disconnected' THEN 'idle' ELSE status END, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE source_key = ?2",
        params![config_json, source_key],
    )?;
    Ok(())
}

/// Marks a connector `syncing` right before a fetch starts, so a UI
/// polling `list_data_sources` mid-sync shows an honest in-flight state
/// rather than the stale previous status.
pub fn mark_syncing(conn: &Connection, source_key: &str) -> Result<(), DataError> {
    conn.execute(
        "UPDATE data_sources SET status = 'syncing', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE source_key = ?1",
        params![source_key],
    )?;
    Ok(())
}

/// Records a successful sync. `last_synced_at` is the freshness anchor
/// every consuming screen's staleness note reads from (§5, §11 of
/// `06_AI_ENGINE.md`).
pub fn mark_synced_ok(conn: &Connection, source_key: &str, synced_at: &str) -> Result<(), DataError> {
    conn.execute(
        "UPDATE data_sources SET status = 'ok', last_synced_at = ?1, last_error = NULL, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE source_key = ?2",
        params![synced_at, source_key],
    )?;
    Ok(())
}

/// Records a failed sync without touching `last_synced_at` — a failure
/// never silently promotes stale data to "current" (§0's governing
/// rule, §5's degrade-path requirement).
pub fn mark_synced_error(conn: &Connection, source_key: &str, error: &str) -> Result<(), DataError> {
    conn.execute(
        "UPDATE data_sources SET status = 'error', last_error = ?1, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE source_key = ?2",
        params![error, source_key],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------
// Codeforces (§1.1) / LeetCode (§1.2) — trajectory metrics.
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct CodeforcesSnapshotRow {
    pub id: i64,
    pub handle: String,
    pub rating: Option<i64>,
    pub max_rating: Option<i64>,
    pub rank: Option<String>,
    pub solved_count: i64,
    pub fetched_at: String,
}

fn row_to_codeforces_snapshot(row: &rusqlite::Row<'_>) -> rusqlite::Result<CodeforcesSnapshotRow> {
    Ok(CodeforcesSnapshotRow {
        id: row.get(0)?,
        handle: row.get(1)?,
        rating: row.get(2)?,
        max_rating: row.get(3)?,
        rank: row.get(4)?,
        solved_count: row.get(5)?,
        fetched_at: row.get(6)?,
    })
}

pub struct NewCodeforcesSnapshot {
    pub handle: String,
    pub rating: Option<i64>,
    pub max_rating: Option<i64>,
    pub rank: Option<String>,
    pub solved_count: i64,
}

pub fn insert_codeforces_snapshot(
    conn: &Connection,
    new: &NewCodeforcesSnapshot,
) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO codeforces_snapshots (handle, rating, max_rating, rank, solved_count) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![new.handle, new.rating, new.max_rating, new.rank, new.solved_count],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Latest snapshot only — every screen wants "the current trajectory
/// number," not the history (§4.5 of `06_AI_ENGINE.md`'s Career
/// Analysis consumer, §7.4's Divergence Check).
pub fn latest_codeforces_snapshot(
    conn: &Connection,
) -> Result<Option<CodeforcesSnapshotRow>, DataError> {
    conn.query_row(
        "SELECT id, handle, rating, max_rating, rank, solved_count, fetched_at \
         FROM codeforces_snapshots ORDER BY fetched_at DESC LIMIT 1",
        [],
        row_to_codeforces_snapshot,
    )
    .optional()
    .map_err(DataError::from)
}

#[derive(Debug, Clone, Serialize)]
pub struct DsaPracticeLogRow {
    pub id: i64,
    pub source: String,
    pub handle: String,
    pub total_solved: i64,
    pub easy_solved: i64,
    pub medium_solved: i64,
    pub hard_solved: i64,
    pub fetched_at: String,
}

fn row_to_dsa_practice_log(row: &rusqlite::Row<'_>) -> rusqlite::Result<DsaPracticeLogRow> {
    Ok(DsaPracticeLogRow {
        id: row.get(0)?,
        source: row.get(1)?,
        handle: row.get(2)?,
        total_solved: row.get(3)?,
        easy_solved: row.get(4)?,
        medium_solved: row.get(5)?,
        hard_solved: row.get(6)?,
        fetched_at: row.get(7)?,
    })
}

pub struct NewDsaPracticeLog {
    pub source: String,
    pub handle: String,
    pub total_solved: i64,
    pub easy_solved: i64,
    pub medium_solved: i64,
    pub hard_solved: i64,
}

pub fn insert_dsa_practice_log(conn: &Connection, new: &NewDsaPracticeLog) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO dsa_practice_log \
         (source, handle, total_solved, easy_solved, medium_solved, hard_solved) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            new.source,
            new.handle,
            new.total_solved,
            new.easy_solved,
            new.medium_solved,
            new.hard_solved,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn latest_dsa_practice_log(
    conn: &Connection,
    source: &str,
) -> Result<Option<DsaPracticeLogRow>, DataError> {
    conn.query_row(
        "SELECT id, source, handle, total_solved, easy_solved, medium_solved, hard_solved, fetched_at \
         FROM dsa_practice_log WHERE source = ?1 ORDER BY fetched_at DESC LIMIT 1",
        params![source],
        row_to_dsa_practice_log,
    )
    .optional()
    .map_err(DataError::from)
}

// ---------------------------------------------------------------------
// GitHub (§1.3).
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct LinkedGithubRepoRow {
    pub id: i64,
    pub repo_full_name: String,
    pub added_at: String,
}

fn row_to_linked_repo(row: &rusqlite::Row<'_>) -> rusqlite::Result<LinkedGithubRepoRow> {
    Ok(LinkedGithubRepoRow {
        id: row.get(0)?,
        repo_full_name: row.get(1)?,
        added_at: row.get(2)?,
    })
}

/// Adds a repo the user explicitly names (never a full account scan,
/// §1.3). Idempotent: linking an already-linked repo is a no-op, not an
/// error, so the Connectors step can call this freely on every save.
pub fn link_github_repo(conn: &Connection, repo_full_name: &str) -> Result<(), DataError> {
    conn.execute(
        "INSERT OR IGNORE INTO linked_github_repos (repo_full_name) VALUES (?1)",
        params![repo_full_name],
    )?;
    Ok(())
}

pub fn unlink_github_repo(conn: &Connection, repo_full_name: &str) -> Result<(), DataError> {
    conn.execute(
        "DELETE FROM linked_github_repos WHERE repo_full_name = ?1",
        params![repo_full_name],
    )?;
    Ok(())
}

pub fn list_linked_github_repos(conn: &Connection) -> Result<Vec<LinkedGithubRepoRow>, DataError> {
    let mut stmt =
        conn.prepare("SELECT id, repo_full_name, added_at FROM linked_github_repos ORDER BY added_at")?;
    let rows = stmt
        .query_map([], row_to_linked_repo)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectStatusSnapshotRow {
    pub id: i64,
    pub repo_full_name: String,
    pub commit_count_30d: i64,
    pub open_pr_count: i64,
    pub open_issue_count: i64,
    pub last_commit_at: Option<String>,
    pub fetched_at: String,
}

fn row_to_project_status_snapshot(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectStatusSnapshotRow> {
    Ok(ProjectStatusSnapshotRow {
        id: row.get(0)?,
        repo_full_name: row.get(1)?,
        commit_count_30d: row.get(2)?,
        open_pr_count: row.get(3)?,
        open_issue_count: row.get(4)?,
        last_commit_at: row.get(5)?,
        fetched_at: row.get(6)?,
    })
}

pub struct NewProjectStatusSnapshot {
    pub repo_full_name: String,
    pub commit_count_30d: i64,
    pub open_pr_count: i64,
    pub open_issue_count: i64,
    pub last_commit_at: Option<String>,
}

pub fn insert_project_status_snapshot(
    conn: &Connection,
    new: &NewProjectStatusSnapshot,
) -> Result<i64, DataError> {
    conn.execute(
        "INSERT INTO project_status_snapshots \
         (repo_full_name, commit_count_30d, open_pr_count, open_issue_count, last_commit_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            new.repo_full_name,
            new.commit_count_30d,
            new.open_pr_count,
            new.open_issue_count,
            new.last_commit_at,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Latest snapshot per linked repo — one row per repo, newest each.
pub fn latest_project_status_snapshots(
    conn: &Connection,
) -> Result<Vec<ProjectStatusSnapshotRow>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, repo_full_name, commit_count_30d, open_pr_count, open_issue_count, \
         last_commit_at, fetched_at FROM project_status_snapshots p \
         WHERE fetched_at = (SELECT MAX(fetched_at) FROM project_status_snapshots \
         WHERE repo_full_name = p.repo_full_name) ORDER BY repo_full_name",
    )?;
    let rows = stmt
        .query_map([], row_to_project_status_snapshot)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::open_and_migrate;
    use tempfile::NamedTempFile;

    #[test]
    fn seeds_seven_data_sources_with_manual_always_ok() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();
        let sources = list_data_sources(&conn).unwrap();
        assert_eq!(sources.len(), 7);
        let manual = sources.iter().find(|s| s.source_key == "manual").unwrap();
        assert_eq!(manual.status, "ok");
        assert_eq!(manual.kind, "always_on");
    }

    #[test]
    fn status_transitions_never_promote_stale_data_on_error() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        mark_synced_ok(&conn, "codeforces", "2026-07-15T10:00:00.000Z").unwrap();
        mark_syncing(&conn, "codeforces").unwrap();
        mark_synced_error(&conn, "codeforces", "network timeout").unwrap();

        let source = get_data_source(&conn, "codeforces").unwrap().unwrap();
        assert_eq!(source.status, "error");
        assert_eq!(source.last_error.as_deref(), Some("network timeout"));
        // last_synced_at from the earlier success must survive the
        // later failure untouched (§0/§5's degrade-path requirement).
        assert_eq!(source.last_synced_at.as_deref(), Some("2026-07-15T10:00:00.000Z"));
    }

    #[test]
    fn codeforces_and_dsa_snapshots_round_trip() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();

        insert_codeforces_snapshot(
            &conn,
            &NewCodeforcesSnapshot {
                handle: "tourist".into(),
                rating: Some(3500),
                max_rating: Some(3979),
                rank: Some("legendary grandmaster".into()),
                solved_count: 2000,
            },
        )
        .unwrap();
        let latest = latest_codeforces_snapshot(&conn).unwrap().unwrap();
        assert_eq!(latest.handle, "tourist");

        insert_dsa_practice_log(
            &conn,
            &NewDsaPracticeLog {
                source: "leetcode".into(),
                handle: "someone".into(),
                total_solved: 500,
                easy_solved: 200,
                medium_solved: 250,
                hard_solved: 50,
            },
        )
        .unwrap();
        let latest_dsa = latest_dsa_practice_log(&conn, "leetcode").unwrap().unwrap();
        assert_eq!(latest_dsa.total_solved, 500);
    }

    #[test]
    fn linking_a_repo_twice_is_idempotent() {
        let tmp = NamedTempFile::new().unwrap();
        let conn = open_and_migrate(tmp.path()).unwrap();
        link_github_repo(&conn, "octocat/Hello-World").unwrap();
        link_github_repo(&conn, "octocat/Hello-World").unwrap();
        assert_eq!(list_linked_github_repos(&conn).unwrap().len(), 1);
    }
}
