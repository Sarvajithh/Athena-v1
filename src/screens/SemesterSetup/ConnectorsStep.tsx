import { useEffect, useState } from 'react';
import {
  deleteGithubToken,
  disconnectGmail,
  disconnectGoogleClassroom,
  disconnectNotion,
  getLatestCodeforcesSnapshot,
  getLatestLeetCodeSnapshot,
  importCalendarIcs,
  linkGithubRepo,
  listClassroomAnnouncements,
  listClassroomCourses,
  listClassroomCoursework,
  listDataSources,
  listGmailMessages,
  listLinkedGithubRepos,
  listNotionPages,
  previewCsvImport,
  previewPdfImport,
  saveGithubToken,
  startGmailOauth,
  startGoogleClassroomOauth,
  startNotionOauth,
  syncCodeforces,
  syncGithub,
  syncLeetCode,
  unlinkGithubRepo,
  type CandidateAchievementDto,
  type ClassroomAnnouncementDto,
  type ClassroomCourseDto,
  type ClassroomCourseworkDto,
  type CodeforcesSnapshotDto,
  type CsvRowDto,
  type DataSourceDto,
  type DeadlineCategory,
  type DsaPracticeLogDto,
  type GmailMessageDto,
  type LeverageClass,
  type LinkedGithubRepoDto,
  type NotionPageDto,
  type ParsedDeadlineDto,
  type SourceKey,
} from '../../ipc/bindings';
import { SyncStatusBadge } from '../../components/shared/SyncStatusBadge';

/** What this step hands back to the wizard's own Deadlines-step state — every import connector funnels through this one shape. */
export interface StagedDeadline {
  title: string;
  category: DeadlineCategory;
  dueAt: string;
  leverageClass: LeverageClass;
  notes: string;
}

interface ConnectorsStepProps {
  styles: Record<string, string>;
  onStageDeadlines: (rows: StagedDeadline[]) => void;
}

function fromParsed(row: ParsedDeadlineDto): StagedDeadline {
  return {
    title: row.title,
    category: row.category,
    dueAt: row.due_at,
    leverageClass: row.leverage_class,
    notes: row.notes ?? '',
  };
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('could not read file'));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      // `readAsDataURL` produces "data:<mime>;base64,<payload>" — only
      // the payload is meaningful to the backend's decoder.
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}

function findSource(sources: DataSourceDto[], key: SourceKey): DataSourceDto | undefined {
  return sources.find((s) => s.source_key === key);
}

/**
 * Semester Setup's Connectors step (07_INTEGRATIONS.md §1). Every
 * Version 1 integration is represented, each independently — connecting
 * one, or connecting none at all, never blocks the wizard from
 * continuing (the "Continue" button below this step has no dependency
 * on anything here succeeding).
 */
export function ConnectorsStep({ styles, onStageDeadlines }: ConnectorsStepProps) {
  const [sources, setSources] = useState<DataSourceDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listDataSources()
      .then(setSources)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const refreshSources = () => listDataSources().then(setSources).catch(() => undefined);

  return (
    <div className={styles.form}>
      <p className="type-body">
        Connect whichever of these you use — each is optional, and Athena works the same either way.
        Everything below can also be set up later.
      </p>
      {loadError && <p className={`${styles.error} type-caption`}>{loadError}</p>}

      <CodeforcesPanel styles={styles} source={findSource(sources, 'codeforces')} onSynced={refreshSources} />
      <LeetCodePanel styles={styles} source={findSource(sources, 'leetcode')} onSynced={refreshSources} />
      <GithubPanel styles={styles} source={findSource(sources, 'github')} onSynced={refreshSources} />
      <GmailPanel styles={styles} source={findSource(sources, 'gmail')} onSynced={refreshSources} />
      <ClassroomPanel styles={styles} source={findSource(sources, 'google_classroom')} onSynced={refreshSources} />
      <NotionPanel styles={styles} source={findSource(sources, 'notion')} onSynced={refreshSources} />
      <CalendarImportPanel styles={styles} source={findSource(sources, 'calendar_ics')} onStageDeadlines={onStageDeadlines} onSynced={refreshSources} />
      <PdfImportPanel styles={styles} source={findSource(sources, 'pdf_import')} onStageDeadlines={onStageDeadlines} onSynced={refreshSources} />
      <CsvImportPanel styles={styles} source={findSource(sources, 'csv_import')} onStageDeadlines={onStageDeadlines} onSynced={refreshSources} />

      <div className={styles.repeatRow}>
        <p className="type-caption">
          Manual entry — the Courses and Deadlines steps you've already filled in — is always available, even with
          every connector above disconnected.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Codeforces (§1.1)
// ---------------------------------------------------------------------

function CodeforcesPanel({
  styles,
  source,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onSynced: () => void;
}) {
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<CodeforcesSnapshotDto | null>(null);

  useEffect(() => {
    getLatestCodeforcesSnapshot().then(setSnapshot).catch(() => undefined);
  }, [source?.last_synced_at]);

  const handleSync = async () => {
    if (!handle.trim() || busy) return;
    setBusy(true);
    try {
      await syncCodeforces(handle.trim());
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.repeatRow}>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className="type-caption">Codeforces handle</span>
          <input
            className={styles.input}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="e.g., tourist"
          />
        </label>
        <div className={styles.field}>
          <span className="type-caption">&nbsp;</span>
          <button type="button" className={styles.secondaryButton} onClick={handleSync} disabled={busy || !handle.trim()}>
            {busy ? 'Syncing…' : 'Connect & sync'}
          </button>
        </div>
      </div>
      {source && (
        <p className="type-caption">
          <SyncStatusBadge status={source.status} />{' '}
          {snapshot && `Rating ${snapshot.rating ?? '—'} · ${snapshot.solved_count} solved`}
          {source.status === 'error' && source.last_error ? ` — ${source.last_error}` : ''}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// LeetCode (§1.2)
// ---------------------------------------------------------------------

function LeetCodePanel({
  styles,
  source,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onSynced: () => void;
}) {
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<DsaPracticeLogDto | null>(null);

  useEffect(() => {
    getLatestLeetCodeSnapshot().then(setSnapshot).catch(() => undefined);
  }, [source?.last_synced_at]);

  const handleSync = async () => {
    if (!handle.trim() || busy) return;
    setBusy(true);
    try {
      await syncLeetCode(handle.trim());
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.repeatRow}>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className="type-caption">LeetCode username</span>
          <input className={styles.input} value={handle} onChange={(e) => setHandle(e.target.value)} />
        </label>
        <div className={styles.field}>
          <span className="type-caption">&nbsp;</span>
          <button type="button" className={styles.secondaryButton} onClick={handleSync} disabled={busy || !handle.trim()}>
            {busy ? 'Syncing…' : 'Connect & sync'}
          </button>
        </div>
      </div>
      {source && (
        <p className="type-caption">
          <SyncStatusBadge status={source.status} />{' '}
          {snapshot && `${snapshot.total_solved} solved (${snapshot.easy_solved}E/${snapshot.medium_solved}M/${snapshot.hard_solved}H)`}
          {source.status === 'error' && source.last_error ? ` — ${source.last_error}` : ''}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// GitHub (§1.3)
// ---------------------------------------------------------------------

function GithubPanel({
  styles,
  source,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onSynced: () => void;
}) {
  const [token, setToken] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [repos, setRepos] = useState<LinkedGithubRepoDto[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshRepos = () => listLinkedGithubRepos().then(setRepos).catch(() => undefined);

  useEffect(() => {
    refreshRepos();
  }, []);

  const handleSaveToken = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      await saveGithubToken(token.trim());
      setToken('');
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await deleteGithubToken();
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  const handleAddRepo = async () => {
    if (!repoInput.trim() || busy) return;
    setBusy(true);
    try {
      await linkGithubRepo(repoInput.trim());
      setRepoInput('');
      await refreshRepos();
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveRepo = async (repoFullName: string) => {
    setBusy(true);
    try {
      await unlinkGithubRepo(repoFullName);
      await refreshRepos();
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      await syncGithub();
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.repeatRow}>
      <p className="type-caption">
        A read-only personal access token (repo scope, or public_repo for public repos only) — stored in your OS
        keychain, never in Athena's database.
      </p>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className="type-caption">Personal access token</span>
          <input
            className={styles.input}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={source?.has_credential ? 'Token saved — enter a new one to replace it' : 'ghp_…'}
          />
        </label>
        <div className={styles.field}>
          <span className="type-caption">&nbsp;</span>
          <button type="button" className={styles.secondaryButton} onClick={handleSaveToken} disabled={busy || !token.trim()}>
            Save token
          </button>
        </div>
        {source?.has_credential && (
          <div className={styles.field}>
            <span className="type-caption">&nbsp;</span>
            <button type="button" className={styles.removeButton} onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className="type-caption">Link a repo (owner/name)</span>
          <input
            className={styles.input}
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="e.g., octocat/Hello-World"
          />
        </label>
        <div className={styles.field}>
          <span className="type-caption">&nbsp;</span>
          <button type="button" className={styles.secondaryButton} onClick={handleAddRepo} disabled={busy || !repoInput.trim()}>
            Add repo
          </button>
        </div>
      </div>

      {repos.length > 0 && (
        <ul>
          {repos.map((repo) => (
            <li key={repo.repo_full_name} className="type-caption">
              {repo.repo_full_name}{' '}
              <button type="button" className={styles.removeButton} onClick={() => handleRemoveRepo(repo.repo_full_name)} disabled={busy}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {repos.length > 0 && (
        <button type="button" className={styles.secondaryButton} onClick={handleSync} disabled={busy}>
          Sync now
        </button>
      )}

      {source && (
        <p className="type-caption">
          <SyncStatusBadge status={source.status} />
          {source.status === 'error' && source.last_error ? ` — ${source.last_error}` : ''}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Calendar Import (§1.4)
// ---------------------------------------------------------------------

function CalendarImportPanel({
  styles,
  source,
  onStageDeadlines,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onStageDeadlines: (rows: StagedDeadline[]) => void;
  onSynced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const content = await readFileAsText(file);
      const parsed = await importCalendarIcs(content);
      onStageDeadlines(parsed.map(fromParsed));
      setMessage(`Added ${parsed.length} event${parsed.length === 1 ? '' : 's'} to your Deadlines step.`);
      onSynced();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.repeatRow}>
      <label className={styles.field}>
        <span className="type-caption">Import a calendar (.ics) file</span>
        <input
          className={styles.input}
          type="file"
          accept=".ics,text/calendar"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>
      {message && <p className="type-caption">{message}</p>}
      {source && <SyncStatusBadge status={source.status} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Resume/Transcript PDF Import (§1.5)
// ---------------------------------------------------------------------

function PdfImportPanel({
  styles,
  source,
  onStageDeadlines,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onStageDeadlines: (rows: StagedDeadline[]) => void;
  onSynced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<CandidateAchievementDto[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const found = await previewPdfImport(base64);
      setCandidates(found);
      setSelected(new Set(found.map((_, i) => i)));
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleConfirm = () => {
    const rows: StagedDeadline[] = candidates
      .filter((_, i) => selected.has(i))
      .map((c) => ({
        title: c.title,
        category: c.kind === 'publication' ? 'research' : 'career',
        dueAt: '',
        leverageClass: 'medium',
        notes: `Imported from resume/transcript (${c.kind}): ${c.source_excerpt}`,
      }));
    onStageDeadlines(rows);
    setCandidates([]);
    setSelected(new Set());
  };

  return (
    <div className={styles.repeatRow}>
      <label className={styles.field}>
        <span className="type-caption">Import a resume or transcript (PDF)</span>
        <input className={styles.input} type="file" accept="application/pdf" disabled={busy} onChange={(e) => handleFile(e.target.files?.[0])} />
      </label>
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      {candidates.length > 0 && (
        <>
          <p className="type-caption">Found {candidates.length} possible achievement(s) — confirm which to add. Each needs a date added in the Deadlines step.</p>
          <ul>
            {candidates.map((c, i) => (
              <li key={i} className="type-caption">
                <label>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} /> [{c.kind}] {c.title}
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.secondaryButton} onClick={handleConfirm} disabled={selected.size === 0}>
            Add {selected.size} to Deadlines
          </button>
        </>
      )}
      {source && <SyncStatusBadge status={source.status} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// CSV Import (§1.6)
// ---------------------------------------------------------------------

const NO_MAPPING = '__none__';

function CsvImportPanel({
  styles,
  source,
  onStageDeadlines,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onStageDeadlines: (rows: StagedDeadline[]) => void;
  onSynced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CsvRowDto[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [titleCol, setTitleCol] = useState(NO_MAPPING);
  const [dueAtCol, setDueAtCol] = useState(NO_MAPPING);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const content = await readFileAsText(file);
      const parsed = await previewCsvImport(content);
      setRows(parsed);
      setHeaders(parsed.length > 0 ? Object.keys(parsed[0].cells) : []);
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canImport = titleCol !== NO_MAPPING && dueAtCol !== NO_MAPPING && rows.length > 0;

  const handleImport = () => {
    if (!canImport) return;
    const staged: StagedDeadline[] = rows.map((row) => ({
      title: row.cells[titleCol] ?? '',
      category: 'academic',
      dueAt: row.cells[dueAtCol] ?? '',
      leverageClass: 'medium',
      notes: '',
    }));
    onStageDeadlines(staged);
    setRows([]);
    setHeaders([]);
  };

  return (
    <div className={styles.repeatRow}>
      <label className={styles.field}>
        <span className="type-caption">Import a grade/timetable export (CSV)</span>
        <input className={styles.input} type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => handleFile(e.target.files?.[0])} />
      </label>
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      {headers.length > 0 && (
        <>
          <p className="type-caption">{rows.length} row(s) found. Map columns to import as deadlines:</p>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Title column</span>
              <select className={styles.input} value={titleCol} onChange={(e) => setTitleCol(e.target.value)}>
                <option value={NO_MAPPING}>Choose a column…</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className="type-caption">Due-date column</span>
              <select className={styles.input} value={dueAtCol} onChange={(e) => setDueAtCol(e.target.value)}>
                <option value={NO_MAPPING}>Choose a column…</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={handleImport} disabled={!canImport}>
            Add {rows.length} to Deadlines
          </button>
        </>
      )}
      {source && <SyncStatusBadge status={source.status} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Gmail (§1.8, OAuth amendment)
// ---------------------------------------------------------------------

function GmailPanel({
  styles,
  source,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onSynced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<GmailMessageDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshMessages = () => listGmailMessages().then(setMessages).catch(() => undefined);

  useEffect(() => {
    if (source?.status === 'ok') refreshMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.last_synced_at]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await startGmailOauth();
      onSynced();
      await refreshMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectGmail();
      setMessages([]);
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.repeatRow}>
      <p className="type-caption">
        Opens your browser for Gmail consent, then syncs recent messages relevant to deadlines and coursework.
      </p>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className="type-caption">&nbsp;</span>
          <button type="button" className={styles.secondaryButton} onClick={handleConnect} disabled={busy}>
            {busy ? 'Connecting…' : source?.has_credential ? 'Reconnect' : 'Connect Gmail'}
          </button>
        </div>
        {source?.has_credential && (
          <div className={styles.field}>
            <span className="type-caption">&nbsp;</span>
            <button type="button" className={styles.removeButton} onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        )}
      </div>
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      {messages.length > 0 && (
        <p className="type-caption">
          {messages.length} recent message{messages.length === 1 ? '' : 's'} synced.
        </p>
      )}
      {source && (
        <p className="type-caption">
          <SyncStatusBadge status={source.status} />
          {source.status === 'error' && source.last_error ? ` — ${source.last_error}` : ''}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Google Classroom (§1.9, OAuth amendment)
// ---------------------------------------------------------------------

function ClassroomPanel({
  styles,
  source,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onSynced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [courses, setCourses] = useState<ClassroomCourseDto[]>([]);
  const [coursework, setCoursework] = useState<ClassroomCourseworkDto[]>([]);
  const [announcements, setAnnouncements] = useState<ClassroomAnnouncementDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = () => {
    listClassroomCourses().then(setCourses).catch(() => undefined);
    listClassroomCoursework().then(setCoursework).catch(() => undefined);
    listClassroomAnnouncements().then(setAnnouncements).catch(() => undefined);
  };

  useEffect(() => {
    if (source?.status === 'ok') refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.last_synced_at]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await startGoogleClassroomOauth();
      onSynced();
      refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogleClassroom();
      setCourses([]);
      setCoursework([]);
      setAnnouncements([]);
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.repeatRow}>
      <p className="type-caption">
        Opens your browser for Google Classroom consent, then syncs courses, coursework, and announcements.
      </p>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className="type-caption">&nbsp;</span>
          <button type="button" className={styles.secondaryButton} onClick={handleConnect} disabled={busy}>
            {busy ? 'Connecting…' : source?.has_credential ? 'Reconnect' : 'Connect Classroom'}
          </button>
        </div>
        {source?.has_credential && (
          <div className={styles.field}>
            <span className="type-caption">&nbsp;</span>
            <button type="button" className={styles.removeButton} onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        )}
      </div>
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      {(courses.length > 0 || coursework.length > 0 || announcements.length > 0) && (
        <p className="type-caption">
          {courses.length} course{courses.length === 1 ? '' : 's'}, {coursework.length} coursework item
          {coursework.length === 1 ? '' : 's'}, {announcements.length} announcement
          {announcements.length === 1 ? '' : 's'} synced.
        </p>
      )}
      {source && (
        <p className="type-caption">
          <SyncStatusBadge status={source.status} />
          {source.status === 'error' && source.last_error ? ` — ${source.last_error}` : ''}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Notion (§1.10, OAuth amendment)
// ---------------------------------------------------------------------

function NotionPanel({
  styles,
  source,
  onSynced,
}: {
  styles: Record<string, string>;
  source: DataSourceDto | undefined;
  onSynced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<NotionPageDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshPages = () => listNotionPages().then(setPages).catch(() => undefined);

  useEffect(() => {
    if (source?.status === 'ok') refreshPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.last_synced_at]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await startNotionOauth();
      onSynced();
      await refreshPages();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectNotion();
      setPages([]);
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.repeatRow}>
      <p className="type-caption">
        Opens your browser for Notion consent, then syncs pages you've shared with the integration.
      </p>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className="type-caption">&nbsp;</span>
          <button type="button" className={styles.secondaryButton} onClick={handleConnect} disabled={busy}>
            {busy ? 'Connecting…' : source?.has_credential ? 'Reconnect' : 'Connect Notion'}
          </button>
        </div>
        {source?.has_credential && (
          <div className={styles.field}>
            <span className="type-caption">&nbsp;</span>
            <button type="button" className={styles.removeButton} onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        )}
      </div>
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      {pages.length > 0 && (
        <p className="type-caption">
          {pages.length} page{pages.length === 1 ? '' : 's'} synced.
        </p>
      )}
      {source && (
        <p className="type-caption">
          <SyncStatusBadge status={source.status} />
          {source.status === 'error' && source.last_error ? ` — ${source.last_error}` : ''}
        </p>
      )}
    </div>
  );
}
