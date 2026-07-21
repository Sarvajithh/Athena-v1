import { useState } from 'react';
import {
  addDeadlinesToSemester,
  extractDeadlinesFromClassroom,
  extractDeadlinesFromGmail,
  extractDeadlinesFromNotion,
  type DeadlineCandidateInput,
  type DeadlineCategory,
} from '../../ipc/bindings';
import styles from './Semester.module.css';

type ConnectorKey = 'gmail' | 'google_classroom' | 'notion';

const CONNECTOR_LABELS: Record<ConnectorKey, string> = {
  gmail: 'Gmail',
  google_classroom: 'Google Classroom',
  notion: 'Notion',
};

/** A pulled row, staged for review before it becomes a real `deadlines` row. */
interface Candidate {
  key: string;
  include: boolean;
  title: string;
  category: DeadlineCategory;
  /** `YYYY-MM-DDTHH:MM`, or '' if extraction found no date and the user must pick one. */
  dueAt: string;
  notes: string | null;
}

/**
 * Semester screen's "Pull deadlines" action (workflow reform brief,
 * Part 1, item 3) — kept as a sub-view inside Semester rather than
 * promoted to a new top-level route. Reasoning: `routes.tsx` registers
 * a top-level screen per *destination* a person navigates to on its own
 * (Now, Deadlines, Semester, Trajectory, Settings, ...); "pull
 * deadlines" isn't a destination, it's one action *within* managing a
 * semester's deadlines, the same way `CareerTab`'s "add a career goal"
 * form is a sub-view rather than its own route. It also already sits
 * next to the same semester-scoped state (`refresh`/`onAdded`) this
 * panel needs, and `Deadlines` (the browsing/editing screen) already
 * points here via its own empty-state copy ("Pull deadlines from a
 * connector in Semester") — moving it would break that cross-reference
 * for no navigational benefit.
 *
 * Calls the new heuristic extraction commands
 * (`extract_deadlines_from_gmail/_classroom/_notion` — Feature 3),
 * which read only the already-synced snapshot tables (no new network
 * calls) and return `ParsedDeadlineDto[]`, the same shape
 * `import_calendar_ics` already returns for calendar import. Extraction
 * pre-fills `due_at` wherever its heuristic could find a date (always,
 * for Classroom, since coursework already carries a structured
 * `due_at`; sometimes, for Gmail/Notion, which only have free text to
 * scan) — the person can still edit or clear any field before
 * including a row, same "extraction always ends in a confirmation
 * step, never auto-commits" rule as calendar/PDF/CSV import.
 */
export function PullDeadlinesPanel({ onAdded }: { onAdded: () => void | Promise<void> }) {
  const [connector, setConnector] = useState<ConnectorKey>('google_classroom');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pulling, setPulling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePull = async () => {
    setPulling(true);
    setError(null);
    try {
      const parsed =
        connector === 'gmail'
          ? await extractDeadlinesFromGmail()
          : connector === 'notion'
            ? await extractDeadlinesFromNotion()
            : await extractDeadlinesFromClassroom();

      const rows: Candidate[] = parsed.map((p, i) => ({
        key: `${connector}-${i}-${p.title}`,
        // Pre-checked only when extraction already found a usable due
        // date — same "ready to include" bar `includedReady` below
        // enforces for a manually-added row.
        include: Boolean(p.due_at),
        title: p.title,
        category: p.category,
        dueAt: p.due_at ? p.due_at.slice(0, 16) : '',
        notes: p.notes,
      }));
      setCandidates(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPulling(false);
    }
  };

  const updateCandidate = (key: string, patch: Partial<Candidate>) => {
    setCandidates((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const includedReady = candidates.filter((c) => c.include && c.title.trim() && c.dueAt);

  const handleAdd = async () => {
    if (includedReady.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: DeadlineCandidateInput[] = includedReady.map((c) => ({
        course_id: null,
        title: c.title.trim(),
        category: c.category,
        due_at: c.dueAt,
        leverage_class: 'medium',
        notes: c.notes,
      }));
      await addDeadlinesToSemester(payload);
      setCandidates([]);
      await onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      <div className={styles.connectorRow}>
        <select
          className={styles.input}
          value={connector}
          onChange={(e) => {
            setConnector(e.target.value as ConnectorKey);
            setCandidates([]);
          }}
        >
          {(Object.keys(CONNECTOR_LABELS) as ConnectorKey[]).map((key) => (
            <option key={key} value={key}>
              {CONNECTOR_LABELS[key]}
            </option>
          ))}
        </select>
        <button type="button" className={styles.secondaryButton} onClick={handlePull} disabled={pulling}>
          {pulling ? 'Pulling…' : `Pull deadlines from ${CONNECTOR_LABELS[connector]}`}
        </button>
      </div>

      {error && <p className={`${styles.error} type-caption`}>{error}</p>}

      {candidates.length === 0 && !pulling ? (
        <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
          Nothing pulled yet. If this connector isn&apos;t connected, use Settings to connect it first — pulling
          here just reads whatever was last synced.
        </p>
      ) : (
        <div className={styles.list}>
          {candidates.map((c) => (
            <div key={c.key} className={styles.candidateRow}>
              <input
                type="checkbox"
                checked={c.include}
                onChange={(e) => updateCandidate(c.key, { include: e.target.checked })}
              />
              <div className={styles.candidateFields}>
                <input
                  className={styles.input}
                  value={c.title}
                  onChange={(e) => updateCandidate(c.key, { title: e.target.value })}
                />
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={c.dueAt}
                  onChange={(e) => updateCandidate(c.key, { dueAt: e.target.value })}
                />
                {c.include && !c.dueAt && (
                  <span className={`${styles.error} type-caption`}>Pick a due date to include this one.</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleAdd}
          disabled={includedReady.length === 0 || submitting}
        >
          {submitting
            ? 'Adding…'
            : `Add ${includedReady.length || ''} deadline${includedReady.length === 1 ? '' : 's'}`.trim()}
        </button>
      )}
    </div>
  );
}
