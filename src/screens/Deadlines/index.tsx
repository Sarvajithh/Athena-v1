import { CalendarClock } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import { useBootstrap } from '../../state/bootstrapContext';
import type { DeadlineRow } from '../../ipc/bindings';
import styles from './Deadlines.module.css';

type Urgency = 'overdue' | 'today' | 'this-week' | 'upcoming' | 'done';

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

/**
 * Deadlines — a dedicated timeline screen (navigation redesign), moved
 * out of `Semester`'s "This semester's deadlines" card. Reuses the
 * existing deadline backend exactly as `Semester` did: `state.deadlines`
 * from `useBootstrap()` (populated by `get_bootstrap_state`), with no
 * new IPC command. `Semester` keeps deadline *creation* (Pull deadlines
 * connector); this screen is purely the read/browse timeline, grouped
 * by week with overdue/today called out first and urgency colour-coded
 * via `data-urgency` (see `Deadlines.module.css`, which reuses the same
 * `--severity-*` tokens the rest of the app already uses for urgency).
 */
export default function Deadlines() {
  const { state, loading } = useBootstrap();

  if (loading && !state) {
    return (
      <div className={styles.screen}>
        <LoadingState shape="list" />
      </div>
    );
  }

  const deadlines = state?.deadlines ?? [];
  const today = startOfDay(new Date());
  const groups = groupDeadlines(deadlines, today);

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Deadlines</p>
        <DensityToggle />
      </div>

      {groups.length === 0 ? (
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
                    <div key={d.id} className={styles.row} data-urgency={group.urgency}>
                      <span className={styles.urgencyDot} data-urgency={group.urgency} aria-hidden="true" />
                      <div className={styles.rowMeta}>
                        <span className={`${styles.rowTitle} type-body`}>{d.title}</span>
                        <span className={`${styles.rowDetail} type-caption`}>
                          {d.category} · {d.leverage_class} leverage
                        </span>
                      </div>
                      <span className={`${styles.rowDue} type-caption`}>{formatDate(d.due_at)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
