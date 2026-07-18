import { LEVERAGE_OPTIONS, newCourseRow, type CourseRowState } from './types';
import type { LeverageClass } from '../../ipc/bindings';

interface CourseEntryStepProps {
  styles: Record<string, string>;
  /** Current rows — owned by whoever renders this step, not by this component. */
  courses: CourseRowState[];
  /** Called with the full next array whenever a row is added, edited, or removed. */
  onChange: (courses: CourseRowState[]) => void;
}

/**
 * Course entry, decoupled from `SemesterSetup`'s wizard-step-index state
 * (03_ONBOARDING.md §3): it receives `courses` and hands back a full
 * next array via `onChange`, so it can be mounted standalone (e.g. from
 * a future "add a course mid-semester" surface) without depending on
 * being step 1 of a linear wizard.
 */
export function CourseEntryStep({ styles, courses, onChange }: CourseEntryStepProps) {
  const updateRow = (index: number, patch: Partial<CourseRowState>) => {
    onChange(courses.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    onChange(courses.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...courses, newCourseRow()]);
  };

  return (
    <div className={styles.form}>
      {courses.map((course, index) => (
        <div key={index} className={styles.repeatRow}>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Course code</span>
              <input
                className={styles.input}
                value={course.code}
                onChange={(e) => updateRow(index, { code: e.target.value })}
                placeholder="e.g., CS5590"
              />
            </label>
            <label className={styles.field}>
              <span className="type-caption">Title</span>
              <input
                className={styles.input}
                value={course.title}
                onChange={(e) => updateRow(index, { title: e.target.value })}
                placeholder="e.g., Statistical Machine Learning"
              />
            </label>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Credits</span>
              <input
                className={styles.input}
                type="number"
                min="0"
                value={course.credits}
                onChange={(e) => updateRow(index, { credits: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className="type-caption">Leverage</span>
              <select
                className={styles.input}
                value={course.leverageClass}
                onChange={(e) => updateRow(index, { leverageClass: e.target.value as LeverageClass })}
              >
                {LEVERAGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className="type-caption">Instructor (optional)</span>
              <input
                className={styles.input}
                value={course.instructor}
                onChange={(e) => updateRow(index, { instructor: e.target.value })}
              />
            </label>
          </div>
          {courses.length > 1 && (
            <button type="button" className={styles.removeButton} onClick={() => removeRow(index)}>
              Remove course
            </button>
          )}
        </div>
      ))}
      <button type="button" className={styles.secondaryButton} onClick={addRow}>
        Add another course
      </button>
    </div>
  );
}
