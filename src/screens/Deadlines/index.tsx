import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import { useBootstrap } from '../../state/bootstrapContext';
import { CATEGORY_OPTIONS, LEVERAGE_OPTIONS } from '../SemesterSetup/types';
import { updateDeadline, deleteDeadline, type DeadlineCategory, type DeadlineRow, type LeverageClass } from '../../ipc/bindings';
import styles from './Deadlines.module.css';

type Urgency = 'overdue' | 'today' | 'this-week' | 'upcoming' | 'done';
type DeadlinesTab = 'open' | 'missed';

interface DeadlineGroup {
  key: string;
  label: string;
  urgency: Urgency;
  items: DeadlineRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function urgencyFor(dueAt: string, today: Date): Urgency {
  const due = startOfDay(new Date(dueAt));
  const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7) return 'this-week';
  return 'upcoming';
}

function weekLabel(dueAt: string, today: Date): string {
  const due = startOfDay(new Date(dueAt));
  const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  const weekIndex = Math.floor(diffDays / 7);
  if (weekIndex <= 0) return 'This week';
  if (weekIndex === 1) return 'Next week';
  return `In ${weekIndex} weeks`;
}

/**
 * Groups deadlines by week bucket (overdue / today / this week /
 * upcoming, then further grouped by week for anything beyond the next
 * seven days), reusing the same `DeadlineRow[]` the old
 * `Semester`-embedded deadline list rendered from `useBootstrap()` — no
 * new backend command, just a different client-side grouping and
 * presentation of `state.deadlines`.
 */
function groupDeadlines(deadlines: DeadlineRow[], today: Date): DeadlineGroup[] {
  const open = deadlines.filter((d) => d.status === 'open');
  const overdue: DeadlineRow[] = [];
  const dueToday: DeadlineRow[] = [];
  const byWeek = new Map<string, DeadlineRow[]>();

  for (const d of open) {
    const urgency = urgencyFor(d.due_at, today);
    if (urgency === 'overdue') {
      overdue.push(d);
    } else if (urgency === 'today') {
      dueToday.push(d);
    } else {
      const label = weekLabel(d.due_at, today);
      const bucket = byWeek.get(label) ?? [];
      bucket.push(d);
      byWeek.set(label, bucket);
    }
  }

  const sortByDue = (a: DeadlineRow, b: DeadlineRow) => a.due_at.localeCompare(b.due_at);
  overdue.sort(sortByDue);
  dueToday.sort(sortByDue);

  const groups: DeadlineGroup[] = [];
  if (overdue.length > 0) {
    groups.push({ key: 'overdue', label: 'Overdue', urgency: 'overdue', items: overdue });
  }
  if (dueToday.length > 0) {
    groups.push({ key: 'today', label: 'Today', urgency: 'today', items: dueToday });
  }
  for (const [label, items] of byWeek) {
    items.sort(sortByDue);
    const urgency = label === 'This week' ? 'this-week' : 'upcoming';
    groups.push({ key: label, label, urgency, items });
  }

  return groups;
}

function formatDate(dueAt: string): string {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return dueAt;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** `due_at` as stored (`YYYY-MM-DDTHH:MM:SS`) truncated to the `datetime-local` input's expected `YYYY-MM-DDTHH:MM`. */
function toDatetimeLocalValue(dueAt: string): string {
  return dueAt.length >= 16 ? dueAt.slice(0, 16) : dueAt;
}

/** Editable fields for one row, mirroring `UpdateDeadlineInput` (`ipc/bindings.ts`) — no `id`/`semester_id`/`course_id`/`status`. */
interface EditState {
  title: string;
  category: DeadlineCategory;
  due_at: string;
  leverage_class: LeverageClass;
  notes: string;
}

function editStateFrom(d: DeadlineRow): EditState {
  return {
    title: d.title,
    category: d.category,
    due_at: toDatetimeLocalValue(d.due_at),
    leverage_class: d.leverage_class,
    notes: d.notes ?? '',
  };
}

/**
 * One deadline row, with Feature 1's inline edit affordance. Matches
 * `ApiKeyPanel.tsx`/`ConnectorsSection.tsx`'s closest edit-form
 * precedent in this repo: a plain-text display state that swaps in
 * place for a small form on "Edit," with its own Save/Cancel and
 * inline error line (`styles.error`, the same class every other
 * screen's inline error uses) — no modal, since every other editable
 * surface in this app edits inline rather than in an overlay.
 */
function DeadlineRowItem({
  deadline,
  urgency,
  onSaved,
  allowEdit = true,
}: {
  deadline: DeadlineRow;
  urgency: Urgency;
  onSaved: () => void | Promise<void>;
  /** `false` for the Missed tab — a missed deadline's fields aren't editable in place, only deletable. */
  allowEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(() => editStateFrom(deadline));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const startEdit = () => {
    setForm(editStateFrom(deadline));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDeadline(deadline.id);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const save = async () => {
    if (!form.title.trim() || !form.due_at || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateDeadline(deadline.id, {
        title: form.title.trim(),
        category: form.category,
        due_at: form.due_at,
        leverage_class: form.leverage_class,
        notes: form.notes.trim() || null,
      });
      setEditing(false);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Feature 2's approaching/just-past-due warning — reuses the same
  // `--severity-*`-driven `data-urgency` styling this screen already
  // uses for overdue/today grouping (see `Deadlines.module.css`), and
  // the same inline `<p className={styles.error}>` caption pattern
  // `ConnectorsSection.tsx`/`ApiKeyPanel.tsx` use for sync errors,
  // rather than inventing a new toast component. Shown for anything due
  // today or already overdue that `get_bootstrap_state`'s
  // `mark_overdue_as_missed` sweep hasn't yet caught up with.
  const showWarning = urgency === 'today' || (urgency === 'overdue' && deadline.status === 'open');

  if (editing) {
    return (
      <div className={styles.row} data-urgency={urgency}>
        <div className={styles.editForm}>
          <div className={styles.editFieldRow}>
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Title"
              disabled={saving}
            />
            <input
              className={styles.input}
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className={styles.editFieldRow}>
            <select
              className={styles.input}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as DeadlineCategory }))}
              disabled={saving}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <select
              className={styles.input}
              value={form.leverage_class}
              onChange={(e) => setForm((f) => ({ ...f, leverage_class: e.target.value as LeverageClass }))}
              disabled={saving}
            >
              {LEVERAGE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <input
            className={styles.input}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            disabled={saving}
          />
          {error && <p className={`${styles.error} type-caption`}>{error}</p>}
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={save}
              disabled={saving || !form.title.trim() || !form.due_at}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={cancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row} data-urgency={urgency}>
      <span className={styles.urgencyDot} data-urgency={urgency} aria-hidden="true" />
      <div className={styles.rowMeta}>
        <span className={`${styles.rowTitle} type-body`}>{deadline.title}</span>
        <span className={`${styles.rowDetail} type-caption`}>
          {deadline.category} · {deadline.leverage_class} leverage
        </span>
        {showWarning && (
          <span className={`${styles.warning} type-caption`}>
            {urgency === 'overdue' ? "Past due — will be marked missed shortly." : 'Due today.'}
          </span>
        )}
        {error && <span className={`${styles.error} type-caption`}>{error}</span>}
      </div>
      <span className={`${styles.rowDue} type-caption`}>{formatDate(deadline.due_at)}</span>
      {confirmingDelete ? (
        <div className={styles.confirmDelete}>
          <span className="type-caption">Delete this deadline?</span>
          <button type="button" className={styles.removeButton} onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Confirm'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.rowActions}>
          {allowEdit && (
            <button type="button" className={styles.editButton} onClick={startEdit}>
              Edit
            </button>
          )}
          <button type="button" className={styles.removeButton} onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Deadlines — a dedicated timeline screen (navigation redesign), moved
 * out of `Semester`'s "This semester's deadlines" card. Reuses the
 * existing deadline backend exactly as `Semester` did: `state.deadlines`
 * from `useBootstrap()` (populated by `get_bootstrap_state`, which also
 * runs Feature 2's open->missed sweep on every read). `Semester` keeps
 * deadline *creation* (Pull deadlines connector); this screen owns
 * browsing (grouped by week, urgency colour-coded), editing (Feature 1),
 * and — via the Open/Missed tabs below — Feature 2's missed-deadline
 * archive, distinct from the open timeline.
 */
export default function Deadlines() {
  const { state, loading, refresh } = useBootstrap();
  const [tab, setTab] = useState<DeadlinesTab>('open');

  if (loading && !state) {
    return (
      <div className={styles.screen}>
        <LoadingState shape="list" />
      </div>
    );
  }

  const deadlines = state?.deadlines ?? [];
  const missed = deadlines
    .filter((d) => d.status === 'missed')
    .slice()
    .sort((a, b) => b.due_at.localeCompare(a.due_at));
  const today = startOfDay(new Date());
  const groups = groupDeadlines(deadlines, today);

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Deadlines</p>
        <DensityToggle />
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Deadline sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'open'}
          className={styles.tab}
          data-active={tab === 'open'}
          onClick={() => setTab('open')}
        >
          Open
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'missed'}
          className={styles.tab}
          data-active={tab === 'missed'}
          onClick={() => setTab('missed')}
        >
          Missed{missed.length > 0 ? ` (${missed.length})` : ''}
        </button>
      </div>

      {tab === 'open' &&
        (groups.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming deadlines"
            description="Pull deadlines from a connector in Semester, or check back once courses post assignments."
          />
        ) : (
          <div className={styles.timeline}>
            {groups.map((group) => (
              <section key={group.key} className={styles.group}>
                <h2 className={`${styles.groupLabel} type-caption`} data-urgency={group.urgency}>
                  {group.label}
                  <span className={styles.groupCount}>{group.items.length}</span>
                </h2>
                <Card className={styles.card}>
                  <div className={styles.list}>
                    {group.items.map((d) => (
                      <DeadlineRowItem key={d.id} deadline={d} urgency={group.urgency} onSaved={refresh} />
                    ))}
                  </div>
                </Card>
              </section>
            ))}
          </div>
        ))}

      {tab === 'missed' &&
        (missed.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing missed"
            description="Deadlines that pass their due date while still open land here automatically."
          />
        ) : (
          <Card className={styles.card}>
            <div className={styles.list}>
              {missed.map((d) => (
                <DeadlineRowItem key={d.id} deadline={d} urgency="overdue" onSaved={refresh} allowEdit={false} />
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}
