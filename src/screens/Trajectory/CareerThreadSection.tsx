import { Briefcase } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import { SeverityDot } from '../../components/shared/SeverityDot';
import { Timeline } from '../../components/shared/Timeline';
import type { DeadlineRow } from '../../ipc/bindings';
import type { Severity } from '../../mock/types';
import styles from './CareerThreadSection.module.css';

interface CareerThreadSectionProps {
  /** Real, open, `category: 'career'` deadlines (04_DATA_MODEL.md §5.2) — no fixture. */
  deadlines: DeadlineRow[];
}

/**
 * How urgently a due date reads, given only the date itself — plain,
 * deterministic day-math for display purposes, not a scoring model
 * (that distinction matters: this never claims to be Priority
 * Resolution's leverage/urgency weighting from `athena-domain`).
 */
function severityFor(dueAt: string): Severity {
  const daysUntil = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 3) return 'urgent';
  if (daysUntil <= 10) return 'flag';
  return 'watch';
}

function applyByLabel(dueAt: string): string {
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (Number.isNaN(days)) return 'Due date not set';
  if (days < 0) return 'Past due';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/**
 * Career/internship threads live here as one section, not a separate
 * screen (spec §5.2) — with real apply-by urgency rendered honestly,
 * never suppressed for calmness (spec §1.2). Uses the shared `Timeline`
 * visual language (spec §6, §5.2 — same language as Decision Log).
 * Consumes real `deadlines WHERE category = 'career'` rows from
 * `get_bootstrap_state` instead of Sprint 2's mock `CareerThread` shape
 * (which assumed company/role fields the data model never defines).
 */
export function CareerThreadSection({ deadlines }: CareerThreadSectionProps) {
  if (deadlines.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No open career threads this semester"
        description="Career-category deadlines you add in Semester Setup will show up here."
      />
    );
  }

  return (
    <Timeline
      entries={deadlines.map((deadline) => ({
        key: String(deadline.id),
        node: <SeverityDot severity={severityFor(deadline.due_at)} showLabel={false} className={styles.node} />,
        content: (
          <Card className={styles.entry}>
            <div className={styles.text}>
              <span className={`${styles.role} type-body-medium`}>{deadline.title}</span>
              {deadline.notes ? (
                <span className={`${styles.company} type-caption`}>{deadline.notes}</span>
              ) : null}
            </div>
            <div className={styles.meta}>
              <span className={`${styles.applyBy} type-caption`}>{applyByLabel(deadline.due_at)}</span>
            </div>
          </Card>
        ),
      }))}
    />
  );
}
