import { useState } from 'react';
import {
  gradingBreakdownValid,
  gradingWeightSum,
  LEVERAGE_OPTIONS,
  newCourseRow,
  type CourseRowState,
  type GradingComponentState,
} from './types';
import type { LeverageClass } from '../../ipc/bindings';
import { extractSyllabusText } from '../../ipc/bindings';

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
  const [syllabusBusy, setSyllabusBusy] = useState<number | null>(null);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);

  const updateRow = (index: number, patch: Partial<CourseRowState>) => {
    onChange(courses.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    onChange(courses.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...courses, newCourseRow()]);
  };

  const addGradingRow = (index: number) => {
    const row = courses[index];
    if (!row) return;
    updateRow(index, {
      gradingBreakdown: [...row.gradingBreakdown, { category: '', weight: '' }],
    });
  };

  const updateGradingRow = (index: number, gIndex: number, patch: Partial<GradingComponentState>) => {
    const row = courses[index];
    if (!row) return;
    const next = row.gradingBreakdown.map((g, i) => (i === gIndex ? { ...g, ...patch } : g));
    updateRow(index, { gradingBreakdown: next });
  };

  const removeGradingRow = (index: number, gIndex: number) => {
    const row = courses[index];
    if (!row) return;
    updateRow(index, { gradingBreakdown: row.gradingBreakdown.filter((_, i) => i !== gIndex) });
  };

  const handleSyllabusUpload = async (index: number, file: File) => {
    setSyllabusError(null);
    setSyllabusBusy(index);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // for...of, not a bytes[i] index loop — noUncheckedIndexedAccess
      // would type bytes[i] as `number | undefined` even though a
      // Uint8Array index within its own length is always defined.
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      const base64 = btoa(binary);
      const text = await extractSyllabusText(base64);
      const row = courses[index];
      updateRow(index, {
        syllabusFilename: file.name,
        syllabusText: text || row?.syllabusText || '',
      });
      if (!text) {
        setSyllabusError(
          `Couldn't extract text from ${file.name} (likely a scanned PDF with no text layer) — the filename is saved, add notes by hand if needed.`,
        );
      }
    } catch (e) {
      setSyllabusError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyllabusBusy(null);
    }
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
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => updateRow(index, { detailsOpen: !course.detailsOpen })}
          >
            {course.detailsOpen ? 'Hide details' : 'Add details'}
          </button>

          {course.detailsOpen && (
            <div className={styles.detailsPanel}>
              <label className={styles.field}>
                <span className="type-caption">Notes</span>
                <textarea
                  className={styles.input}
                  value={course.notes}
                  onChange={(e) => updateRow(index, { notes: e.target.value })}
                  placeholder="e.g., seminar-style, participation-heavy; prof grades the midterm hard"
                  rows={3}
                />
              </label>

              <label className={styles.field}>
                <span className="type-caption">Syllabus (PDF, optional)</span>
                <input
                  className={styles.input}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleSyllabusUpload(index, file);
                  }}
                />
                {syllabusBusy === index && <span className="type-caption">Extracting text…</span>}
                {course.syllabusFilename && (
                  <span className="type-caption">Attached: {course.syllabusFilename}</span>
                )}
              </label>

              <div className={styles.field}>
                <span className="type-caption">Grading breakdown (optional)</span>
                {course.gradingBreakdown.map((g, gIndex) => (
                  <div key={gIndex} className={styles.fieldRow}>
                    <input
                      className={styles.input}
                      value={g.category}
                      onChange={(e) => updateGradingRow(index, gIndex, { category: e.target.value })}
                      placeholder="e.g., Midterm"
                    />
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      max="100"
                      value={g.weight}
                      onChange={(e) => updateGradingRow(index, gIndex, { weight: e.target.value })}
                      placeholder="%"
                    />
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => removeGradingRow(index, gIndex)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.secondaryButton} onClick={() => addGradingRow(index)}>
                  Add grading component
                </button>
                {course.gradingBreakdown.some((g) => g.category.trim() || g.weight.trim()) && (
                  <p className={`type-caption ${gradingBreakdownValid(course) ? '' : styles.error}`}>
                    {gradingWeightSum(course)}% of 100%
                    {!gradingBreakdownValid(course) && ' — weights must sum to exactly 100% before you can continue.'}
                  </p>
                )}
              </div>
            </div>
          )}

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
      {syllabusError && <p className={`${styles.error} type-caption`}>{syllabusError}</p>}
    </div>
  );
}
