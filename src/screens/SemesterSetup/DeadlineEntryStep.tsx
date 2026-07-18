import { CATEGORY_OPTIONS, LEVERAGE_OPTIONS, newDeadlineRow, type CourseRowState, type DeadlineRowState } from './types';
import type { DeadlineCategory, LeverageClass } from '../../ipc/bindings';

interface DeadlineEntryStepProps {
  styles: Record<string, string>;
  /** Current rows — owned by whoever renders this step, not by this component. */
  deadlines: DeadlineRowState[];
  /** Read-only — used only to populate the "linked course" dropdown. */
  courses: CourseRowState[];
  /** Called with the full next array whenever a row is added, edited, or removed. */
  onChange: (deadlines: DeadlineRowState[]) => void;
}

/**
 * Deadline entry, decoupled from `SemesterSetup`'s wizard-step-index
 * state in the same way as `CourseEntryStep`: it receives `deadlines`
 * and `courses` as props and hands back a full next array via
 * `onChange`, so it's reusable outside a strictly linear new-semester
 * flow (e.g. staging connector-imported rows, which already funnels
 * through this same shape via `ConnectorsStep`'s `onStageDeadlines`).
 */
export function DeadlineEntryStep({ styles, deadlines, courses, onChange }: DeadlineEntryStepProps) {
  const nonEmptyCourses = courses.filter((c) => c.code.trim() || c.title.trim());

  const updateRow = (index: number, patch: Partial<DeadlineRowState>) => {
    onChange(deadlines.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    onChange(deadlines.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...deadlines, newDeadlineRow()]);
  };

  return (
    <div className={styles.form}>
      {deadlines.map((deadline, index) => (
        <div key={index} className={styles.repeatRow}>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Title</span>
              <input
                className={styles.input}
                value={deadline.title}
                onChange={(e) => updateRow(index, { title: e.target.value })}
                placeholder="e.g., CS3231 problem set 3"
              />
            </label>
            <label className={styles.field}>
              <span className="type-caption">Due</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={deadline.dueAt}
                onChange={(e) => updateRow(index, { dueAt: e.target.value })}
              />
            </label>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Category</span>
              <select
                className={styles.input}
                value={deadline.category}
                onChange={(e) => updateRow(index, { category: e.target.value as DeadlineCategory })}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className="type-caption">Leverage</span>
              <select
                className={styles.input}
                value={deadline.leverageClass}
                onChange={(e) => updateRow(index, { leverageClass: e.target.value as LeverageClass })}
              >
                {LEVERAGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            {nonEmptyCourses.length > 0 && (
              <label className={styles.field}>
                <span className="type-caption">Linked course (optional)</span>
                <select
                  className={styles.input}
                  value={deadline.courseIndex}
                  onChange={(e) => updateRow(index, { courseIndex: e.target.value })}
                >
                  <option value="">None</option>
                  {courses.map((c, i) =>
                    c.code.trim() || c.title.trim() ? (
                      <option key={i} value={i}>
                        {c.code || c.title}
                      </option>
                    ) : null,
                  )}
                </select>
              </label>
            )}
          </div>
          {deadlines.length > 1 && (
            <button type="button" className={styles.removeButton} onClick={() => removeRow(index)}>
              Remove deadline
            </button>
          )}
        </div>
      ))}
      <button type="button" className={styles.secondaryButton} onClick={addRow}>
        Add another deadline
      </button>
    </div>
  );
}
