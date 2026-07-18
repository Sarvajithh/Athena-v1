import { Card } from '../../components/shared/Card';
import { CollapseList } from '../../components/shared/CollapseList';
import { EmptyState } from '../../components/shared/EmptyState';
import { ClipboardList } from 'lucide-react';
import type { CourseRow, DeadlineRow } from '../../ipc/bindings';
import styles from './SemesterSetup.module.css';

const EDIT_TOOLTIP = 'Editing not available yet — course and deadline mutation is not supported this semester.';

function formatDueAt(dueAt: string): string {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return dueAt;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface SemesterAtAGlanceProps {
  courses: CourseRow[];
  deadlines: DeadlineRow[];
}

/**
 * Read-only summary of the current semester's courses and deadlines,
 * each with its live status. Every row carries a disabled "Edit"
 * control rather than omitting edit affordance silently — the backend
 * (`crates/athena-data/src/repositories/course.rs`, `deadline.rs`) has
 * no update/delete/mark-done commands yet, so this is an honest,
 * visible "not yet" rather than a missing feature the user has to
 * discover by trying.
 */
export function SemesterAtAGlance({ courses, deadlines }: SemesterAtAGlanceProps) {
  if (courses.length === 0 && deadlines.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nothing tracked yet this semester"
        description="Add courses and deadlines above, or run setup again."
      />
    );
  }

  return (
    <div className={styles.glanceSection}>
      {courses.length > 0 && (
        <Card className={styles.glanceGroup}>
          <h3 className={`${styles.glanceGroupTitle} type-body-medium`}>Courses</h3>
          <CollapseList
            items={courses}
            getKey={(c) => String(c.id)}
            className={styles.glanceList}
            renderItem={(course) => (
              <div className={styles.glanceRow}>
                <div className={styles.glanceMeta}>
                  <span className={`${styles.glanceTitle} type-body`}>
                    {course.code ? `${course.code} — ${course.title}` : course.title}
                  </span>
                  <span className={`${styles.glanceDetail} type-caption`}>
                    {course.credits} credit{course.credits === 1 ? '' : 's'} · {course.leverage_class} leverage ·{' '}
                    {course.status}
                  </span>
                </div>
                <button type="button" className={styles.editDisabled} disabled title={EDIT_TOOLTIP}>
                  Edit
                </button>
              </div>
            )}
          />
        </Card>
      )}

      {deadlines.length > 0 && (
        <Card className={styles.glanceGroup}>
          <h3 className={`${styles.glanceGroupTitle} type-body-medium`}>Deadlines</h3>
          <CollapseList
            items={deadlines}
            getKey={(d) => String(d.id)}
            className={styles.glanceList}
            renderItem={(deadline) => (
              <div className={styles.glanceRow}>
                <div className={styles.glanceMeta}>
                  <span className={`${styles.glanceTitle} type-body`}>{deadline.title}</span>
                  <span className={`${styles.glanceDetail} type-caption`}>
                    Due {formatDueAt(deadline.due_at)} · {deadline.category} · {deadline.status}
                  </span>
                </div>
                <button type="button" className={styles.editDisabled} disabled title={EDIT_TOOLTIP}>
                  Edit
                </button>
              </div>
            )}
          />
        </Card>
      )}
    </div>
  );
}
