


// import { emptyWizardSteps, mockSemesterPhases, mockWizardSteps } from '../../mock/semesterFixtures';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { EmptyState } from '../../components/shared/EmptyState';
import {
  commitSemesterSetup,
  type CourseInput,
  type DeadlineCategory,
  type DeadlineInput,
  type LeverageClass,
} from '../../ipc/bindings';
import type { SemesterPhase, WizardStep } from '../../mock/types';
import { useBootstrap } from '../../state/bootstrapContext';
import { PhaseStrip } from './PhaseStrip';
import styles from './SemesterSetup.module.css';
import { WizardStepShell } from './WizardStepShell';
/**
 * Semester Setup — the re-derivation wizard run at the start of each
 * term (spec §5.2). This sprint ships the wizard-step shell and the
 * completed-setup phase strip only; field-level import/edit UI (CSV/ICS
 * import, timetable entry) is out of scope (SPRINT2_SPEC.md §5).
 */
// export default function SemesterSetup() {
//   const [showEmpty, setShowEmpty] = useState(false);
//   const steps = showEmpty ? emptyWizardSteps : mockWizardSteps;

//   return (
//     <div className={styles.screen}>
//       <div className={styles.header}>
//         <p className={`${styles.eyebrow} type-caption`}>Semester Setup</p>
//         <DensityToggle />
//       </div>

//       {steps.length === 0 ? (
//         <EmptyState
//           icon={ClipboardList}
//           title="No semester configured yet"
//           description="Run setup to import courses, deadlines, your timetable, and a deep-work window."
//         />
//       ) : (
//         <>
//           <WizardStepShell steps={steps} />
//           <Card className={styles.placeholderCard}>
//             <p className="type-body">
//               Field-level setup (course import, deadline CSV/ICS import, timetable entry) is a follow-on
//               deliverable — this sprint ships the navigable step shell only.
//             </p>
//           </Card>
//           <section>
//             <h2 className={`${styles.sectionTitle} type-body-medium`}>This semester at a glance</h2>
//             <PhaseStrip phases={mockSemesterPhases} />
//           </section>
//         </>
//       )}

//       {import.meta.env.DEV ? (
//         <button type="button" className={styles.devToggle} onClick={() => setShowEmpty((v) => !v)}>
//           Dev: toggle empty state
//         </button>
//       ) : null}
//     </div>
//   );
// }


interface SemesterSetupProps {
  /**
   * `first-run` when reached from `Onboarding` (no existing semester,
   * continuous with Profile creation, no nav rail). `standalone` when
   * reached from the nav rail at any later point, to start the next
   * semester (03_ONBOARDING.md §7.1 rollover). Defaults to `standalone`
   * since `AppShell` renders this screen with no props.
   */
  mode?: 'first-run' | 'standalone';
  /** Called after commit succeeds, only meaningful in `first-run` mode. */
  onComplete?: () => void | Promise<void>;
}

const STEP_LABELS = ['Basics', 'Courses', 'Deadlines', 'Deep-work window', 'Review & start'];
const LEVERAGE_OPTIONS: LeverageClass[] = ['high', 'medium', 'low'];
const CATEGORY_OPTIONS: DeadlineCategory[] = ['academic', 'career', 'research', 'dsa', 'other'];

function wizardStepsFor(current: number): WizardStep[] {
  return STEP_LABELS.map((label, index) => ({
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    status: index < current ? 'complete' : index === current ? 'current' : 'upcoming',
  }));
}

interface CourseRowState {
  code: string;
  title: string;
  credits: string;
  leverageClass: LeverageClass;
  instructor: string;
  targetGrade: string;
}

interface DeadlineRowState {
  title: string;
  category: DeadlineCategory;
  dueAt: string;
  leverageClass: LeverageClass;
  notes: string;
  courseIndex: string; // '' = none, otherwise an index into the courses array as a string
}

function newCourseRow(): CourseRowState {
  return { code: '', title: '', credits: '4', leverageClass: 'medium', instructor: '', targetGrade: '' };
}

function newDeadlineRow(): DeadlineRowState {
  return { title: '', category: 'academic', dueAt: '', leverageClass: 'medium', notes: '', courseIndex: '' };
}

/**
 * Semester Setup — the wizard run once at the start of every semester
 * (03_ONBOARDING.md §3): Basics, Courses, Deadlines, a read-only
 * deep-work window confirmation, then Review & commit. The Timetable
 * Confirmation step described in §3 is deferred — this change does not
 * build meeting-pattern entry UI, so there is nothing yet to confirm;
 * `courses.meeting_pattern` remains available in the schema for that
 * follow-on deliverable.
 */
export default function SemesterSetup({ mode = 'standalone', onComplete }: SemesterSetupProps) {
  const { state, refresh } = useBootstrap();
  const isFirstRun = mode === 'first-run';
  const hasExistingSemester = Boolean(state?.current_semester);

  const [wizardOpen, setWizardOpen] = useState(isFirstRun || !hasExistingSemester);
  const [step, setStep] = useState(0);
  const [label, setLabel] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [courses, setCourses] = useState<CourseRowState[]>([newCourseRow()]);
  const [deadlines, setDeadlines] = useState<DeadlineRowState[]>([newDeadlineRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = state?.profile ?? null;

  const nonEmptyCourses = courses.filter((c) => c.code.trim() || c.title.trim());
  const nonEmptyDeadlines = deadlines.filter((d) => d.title.trim());

  const canAdvanceFromStep = (index: number): boolean => {
    switch (index) {
      case 0:
        return label.trim().length > 0 && startsOn.length > 0 && endsOn.length > 0;
      case 1:
      case 2:
        return true; // Courses/deadlines can each be empty individually — only their sum must be non-zero.
      default:
        return true;
    }
  };

  const canCommit = nonEmptyCourses.length > 0 || nonEmptyDeadlines.length > 0;

  const handleCommit = async () => {
    if (!canCommit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const courseInputs: CourseInput[] = nonEmptyCourses.map((c) => ({
        code: c.code.trim(),
        title: c.title.trim(),
        credits: Number.parseInt(c.credits, 10) || 0,
        leverage_class: c.leverageClass,
        instructor: c.instructor.trim() ? c.instructor.trim() : null,
        target_grade: c.targetGrade.trim() ? c.targetGrade.trim() : null,
        meeting_pattern: [],
      }));

      // Map each surviving deadline's course selection to its index within
      // `nonEmptyCourses` (the array actually sent, and so the array whose
      // indices `commit_semester_setup` resolves against).
      const deadlineInputs: DeadlineInput[] = nonEmptyDeadlines.map((d) => {
        const originalIndex = d.courseIndex === '' ? -1 : Number.parseInt(d.courseIndex, 10);
        const course = originalIndex >= 0 ? courses[originalIndex] : undefined;
        const resolvedIndex = course ? nonEmptyCourses.indexOf(course) : -1;
        return {
          course_index: resolvedIndex >= 0 ? resolvedIndex : null,
          title: d.title.trim(),
          category: d.category,
          due_at: d.dueAt,
          leverage_class: d.leverageClass,
          notes: d.notes.trim() ? d.notes.trim() : null,
        };
      });

      await commitSemesterSetup({
        label: label.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
        courses: courseInputs,
        deadlines: deadlineInputs,
        is_first_run: isFirstRun,
      });

      if (isFirstRun) {
        await onComplete?.();
      } else {
        await refresh();
        setWizardOpen(false);
        setStep(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const currentSemesterPhase: SemesterPhase[] =
    state?.current_semester && !wizardOpen
      ? [
          {
            id: String(state.current_semester.id),
            label: state.current_semester.label,
            dateRange: `${state.current_semester.starts_on} – ${state.current_semester.ends_on}`,
            current: true,
          },
        ]
      : [];

  if (!wizardOpen) {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <p className={`${styles.eyebrow} type-caption`}>Semester Setup</p>
          <DensityToggle />
        </div>

        <section>
          <h2 className={`${styles.sectionTitle} type-body-medium`}>This semester at a glance</h2>
          <PhaseStrip phases={currentSemesterPhase} />
        </section>

        <Card className={styles.placeholderCard}>
          <p className="type-body">
            {state?.courses.length ?? 0} course{state?.courses.length === 1 ? '' : 's'} ·{' '}
            {state?.deadlines.length ?? 0} deadline{state?.deadlines.length === 1 ? '' : 's'} tracked this semester.
          </p>
        </Card>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setWizardOpen(true);
            setStep(0);
          }}
        >
          Start next semester
        </button>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Semester Setup</p>
        {!isFirstRun && <DensityToggle />}
      </div>

      <WizardStepShell steps={wizardStepsFor(step)} />

      <Card className={styles.wizardCard}>
        {step === 0 && (
          <div className={styles.form}>
            <label className={styles.field}>
              <span className="type-caption">Semester label</span>
              <input
                className={styles.input}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Monsoon 2026"
                required
              />
            </label>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className="type-caption">Starts on</span>
                <input
                  className={styles.input}
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  required
                />
              </label>
              <label className={styles.field}>
                <span className="type-caption">Ends on</span>
                <input
                  className={styles.input}
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  required
                />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className={styles.form}>
            {courses.map((course, index) => (
              <div key={index} className={styles.repeatRow}>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span className="type-caption">Course code</span>
                    <input
                      className={styles.input}
                      value={course.code}
                      onChange={(e) =>
                        setCourses((rows) => rows.map((r, i) => (i === index ? { ...r, code: e.target.value } : r)))
                      }
                      placeholder="e.g., CS5590"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className="type-caption">Title</span>
                    <input
                      className={styles.input}
                      value={course.title}
                      onChange={(e) =>
                        setCourses((rows) => rows.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))
                      }
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
                      onChange={(e) =>
                        setCourses((rows) => rows.map((r, i) => (i === index ? { ...r, credits: e.target.value } : r)))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className="type-caption">Leverage</span>
                    <select
                      className={styles.input}
                      value={course.leverageClass}
                      onChange={(e) =>
                        setCourses((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, leverageClass: e.target.value as LeverageClass } : r)),
                        )
                      }
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
                      onChange={(e) =>
                        setCourses((rows) => rows.map((r, i) => (i === index ? { ...r, instructor: e.target.value } : r)))
                      }
                    />
                  </label>
                </div>
                {courses.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => setCourses((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove course
                  </button>
                )}
              </div>
            ))}
            <button type="button" className={styles.secondaryButton} onClick={() => setCourses((rows) => [...rows, newCourseRow()])}>
              Add another course
            </button>
          </div>
        )}

        {step === 2 && (
          <div className={styles.form}>
            {deadlines.map((deadline, index) => (
              <div key={index} className={styles.repeatRow}>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span className="type-caption">Title</span>
                    <input
                      className={styles.input}
                      value={deadline.title}
                      onChange={(e) =>
                        setDeadlines((rows) => rows.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))
                      }
                      placeholder="e.g., CS3231 problem set 3"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className="type-caption">Due</span>
                    <input
                      className={styles.input}
                      type="datetime-local"
                      value={deadline.dueAt}
                      onChange={(e) =>
                        setDeadlines((rows) => rows.map((r, i) => (i === index ? { ...r, dueAt: e.target.value } : r)))
                      }
                    />
                  </label>
                </div>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span className="type-caption">Category</span>
                    <select
                      className={styles.input}
                      value={deadline.category}
                      onChange={(e) =>
                        setDeadlines((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, category: e.target.value as DeadlineCategory } : r)),
                        )
                      }
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
                      onChange={(e) =>
                        setDeadlines((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, leverageClass: e.target.value as LeverageClass } : r)),
                        )
                      }
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
                        onChange={(e) =>
                          setDeadlines((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, courseIndex: e.target.value } : r)),
                          )
                        }
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
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => setDeadlines((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove deadline
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setDeadlines((rows) => [...rows, newDeadlineRow()])}
            >
              Add another deadline
            </button>
          </div>
        )}

        {step === 3 && (
          <div className={styles.form}>
            {profile ? (
              <p className="type-body">
                Your deep-work window is <strong>{profile.deep_work_window_start}–{profile.deep_work_window_end}</strong>,
                set during Profile creation. Athena will allocate this semester's deep-work blocks inside it.
              </p>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No deep-work window on file"
                description="Complete Profile creation to set a deep-work window."
              />
            )}
          </div>
        )}

        {step === 4 && (
          <div className={styles.form}>
            <p className="type-body">
              <strong>{label || 'Untitled semester'}</strong> · {startsOn || '—'} to {endsOn || '—'}
            </p>
            <p className="type-body">
              {nonEmptyCourses.length} course{nonEmptyCourses.length === 1 ? '' : 's'}, {nonEmptyDeadlines.length}{' '}
              deadline{nonEmptyDeadlines.length === 1 ? '' : 's'}.
            </p>
            {!canCommit && (
              <p className={`${styles.error} type-caption`}>
                Add at least one course or one deadline before starting the semester.
              </p>
            )}
            {error && <p className={`${styles.error} type-caption`}>{error}</p>}
          </div>
        )}

        <div className={styles.actions}>
          {step > 0 && (
            <button type="button" className={styles.secondaryButton} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {step < STEP_LABELS.length - 1 ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => canAdvanceFromStep(step) && setStep((s) => s + 1)}
              disabled={!canAdvanceFromStep(step)}
            >
              Continue
            </button>
          ) : (
            <button type="button" className={styles.primaryButton} onClick={handleCommit} disabled={!canCommit || submitting}>
              {submitting ? 'Starting semester…' : 'Start semester'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
