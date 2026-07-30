import { useState } from 'react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
import {
  addCourseToSemester,
  commitSemesterSetup,
  countCourseLinkedDeadlines,
  deleteCourse,
  type CourseInput,
  type LeverageClass,
} from '../../ipc/bindings';
import { useBootstrap } from '../../state/bootstrapContext';
import { AdvancedTab } from './AdvancedTab';
import { CareerTab } from './CareerTab';
import { CourseDetailsPanel } from './CourseDetailsPanel';
import { MaterialsTab } from './MaterialsTab';
import { PullDeadlinesPanel } from './PullDeadlinesPanel';
import styles from './Semester.module.css';

type SemesterTab = 'overview' | 'materials' | 'career' | 'advanced';

const TABS: { id: SemesterTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'materials', label: 'Materials' },
  { id: 'career', label: 'Career' },
  { id: 'advanced', label: 'Advanced' },
];

interface SemesterScreenProps {
  /**
   * `first-run` when reached from `Onboarding` right after Profile
   * creation (no semester exists yet, no nav rail around it).
   * `standalone` for the always-reachable nav-rail destination this
   * screen normally is. Defaults to `standalone`, since `AppShell`
   * renders this screen with no props (workflow reform brief, Part 1).
   */
  mode?: 'first-run' | 'standalone';
  /** Called after the first semester is started, only meaningful in `first-run` mode. */
  onComplete?: () => void | Promise<void>;
}

const emptyCourseForm = () => ({
  code: '',
  title: '',
  credits: '4',
  leverageClass: 'medium' as LeverageClass,
});

/** One row in the "Start a new semester" form's inline course list — same shape as `emptyCourseForm`, kept separate since it lives in its own array rather than a single form. */
const emptyNewSemesterCourseRow = () => ({
  code: '',
  title: '',
  credits: '4',
  leverageClass: 'medium' as LeverageClass,
});

/**
 * The Semester screen (workflow reform brief, Part 1): a single,
 * persistent, always-reachable place to start a new semester, add a
 * course to the active one, and pull deadlines from a connector — none
 * of it gated behind a one-time onboarding wizard. Replaces
 * `screens/SemesterSetup`'s five-step wizard entirely; the deep-work
 * window and generic CSV/PDF/ICS import steps that wizard bundled in
 * are out of scope here (deep-work window is set during Profile
 * creation and is not re-configured per-semester; generic import was
 * unrelated to "I have a new course" or "start a new term").
 *
 * Single-active-semester model: `create_semester` (called via
 * `commit_semester_setup`) already flips any previously-current
 * semester to inactive in the same transaction, and `courses`/
 * `deadlines` already carry `semester_id` — no schema change was
 * needed to support this.
 */
export default function Semester({ mode = 'standalone', onComplete }: SemesterScreenProps) {
  const { state, refresh } = useBootstrap();
  const isFirstRun = mode === 'first-run';
  const currentSemester = state?.current_semester ?? null;

  const [startingNew, setStartingNew] = useState(isFirstRun || !currentSemester);
  const [label, setLabel] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // The "Start a new semester" form's own inline course list —
  // `commit_semester_setup` rejects a semester with zero courses *and*
  // zero deadlines (onboarding.rs's validation, "Athena cannot produce
  // a meaningful verdict with zero grounded data"), and this form
  // collects no deadlines at all, so at least one course here is not
  // optional decoration — without it, "Start semester" always fails.
  const [newSemesterCourses, setNewSemesterCourses] = useState([emptyNewSemesterCourseRow()]);

  const [courseForm, setCourseForm] = useState(emptyCourseForm());
  const [addingCourse, setAddingCourse] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);

  // Which course's details card is open, and which of its dedicated
  // sections (Info/Materials/Notes/Log) is currently showing — at most
  // one course open at a time, accordion-style, so the list doesn't
  // turn into a wall of open cards as courses accumulate; the section
  // resets to "Info" whenever a *different* course is opened, so
  // "Materials" from a previously-viewed course doesn't linger as the
  // default for the next one.
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);
  const [activeCourseSection, setActiveCourseSection] = useState<'info' | 'materials' | 'notes' | 'log'>('info');

  const toggleCourseExpanded = (courseId: number) => {
    setExpandedCourseId((id) => (id === courseId ? null : courseId));
    setActiveCourseSection('info');
  };

  const [activeTab, setActiveTab] = useState<SemesterTab>('overview');

  // Course delete: a real confirm (not a snackbar-undo like deadline
  // delete) since cascading to linked deadlines is a bigger, less
  // reversible action — the student sees exactly how many deadlines
  // will go with it before committing.
  const [confirmingDeleteCourseId, setConfirmingDeleteCourseId] = useState<number | null>(null);
  const [linkedDeadlineCount, setLinkedDeadlineCount] = useState<number | null>(null);
  const [loadingLinkedCount, setLoadingLinkedCount] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [deleteCourseError, setDeleteCourseError] = useState<string | null>(null);

  const courses = state?.courses ?? [];
  const deadlines = state?.deadlines ?? [];

  const nonEmptyNewSemesterCourses = newSemesterCourses.filter((c) => c.code.trim() || c.title.trim());

  const updateNewSemesterCourseRow = (index: number, patch: Partial<(typeof newSemesterCourses)[number]>) => {
    setNewSemesterCourses((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addNewSemesterCourseRow = () => {
    setNewSemesterCourses((rows) => [...rows, emptyNewSemesterCourseRow()]);
  };

  const removeNewSemesterCourseRow = (index: number) => {
    setNewSemesterCourses((rows) => rows.filter((_, i) => i !== index));
  };

  const handleStartSemester = async () => {
    if (!label.trim() || !startsOn || !endsOn || nonEmptyNewSemesterCourses.length === 0 || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const courseInputs: CourseInput[] = nonEmptyNewSemesterCourses.map((c) => ({
        code: c.code.trim(),
        title: c.title.trim(),
        credits: Number.parseInt(c.credits, 10) || 0,
        leverage_class: c.leverageClass,
        instructor: null,
        target_grade: null,
        meeting_pattern: [],
        notes: null,
        syllabus_text: null,
        grading_breakdown: [],
      }));
      await commitSemesterSetup({
        label: label.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
        courses: courseInputs,
        deadlines: [],
        is_first_run: isFirstRun,
      });
      setLabel('');
      setStartsOn('');
      setEndsOn('');
      setNewSemesterCourses([emptyNewSemesterCourseRow()]);
      setStartingNew(false);
      if (isFirstRun) {
        await onComplete?.();
      } else {
        await refresh();
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const handleAddCourse = async () => {
    if (!courseForm.code.trim() || !courseForm.title.trim() || addingCourse) return;
    setAddingCourse(true);
    setCourseError(null);
    try {
      const input: CourseInput = {
        code: courseForm.code.trim(),
        title: courseForm.title.trim(),
        credits: Number.parseInt(courseForm.credits, 10) || 0,
        leverage_class: courseForm.leverageClass,
        instructor: null,
        target_grade: null,
        meeting_pattern: [],
        notes: null,
        syllabus_text: null,
        grading_breakdown: [],
      };
      await addCourseToSemester(input);
      setCourseForm(emptyCourseForm());
      await refresh();
    } catch (e) {
      setCourseError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingCourse(false);
    }
  };

  const startDeleteCourse = async (courseId: number) => {
    setDeleteCourseError(null);
    setConfirmingDeleteCourseId(courseId);
    setLinkedDeadlineCount(null);
    setLoadingLinkedCount(true);
    try {
      const count = await countCourseLinkedDeadlines(courseId);
      setLinkedDeadlineCount(count);
    } catch (e) {
      setDeleteCourseError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingLinkedCount(false);
    }
  };

  const cancelDeleteCourse = () => {
    setConfirmingDeleteCourseId(null);
    setLinkedDeadlineCount(null);
    setDeleteCourseError(null);
  };

  const confirmDeleteCourse = async () => {
    if (confirmingDeleteCourseId == null || deletingCourse) return;
    setDeletingCourse(true);
    setDeleteCourseError(null);
    try {
      await deleteCourse(confirmingDeleteCourseId);
      setConfirmingDeleteCourseId(null);
      setLinkedDeadlineCount(null);
      await refresh();
    } catch (e) {
      setDeleteCourseError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingCourse(false);
    }
  };

  // First-run, or no active semester at all: only the "start a
  // semester" form is shown — nothing else on this screen is
  // meaningful without a semester to attach it to.
  if (startingNew) {
    return (
      <div className={styles.screen}>
        {!isFirstRun && (
          <div className={styles.header}>
            <p className={`${styles.eyebrow} type-caption`}>Semester</p>
            <DensityToggle />
          </div>
        )}

        <Card className={styles.card}>
          <h2 className={`${styles.sectionTitle} type-body-medium`}>Start a new semester</h2>
          <div className={styles.form}>
            <label className={styles.field}>
              <span className="type-caption">Semester label</span>
              <input
                className={styles.input}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Monsoon 2026"
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
                />
              </label>
              <label className={styles.field}>
                <span className="type-caption">Ends on</span>
                <input
                  className={styles.input}
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </label>
            </div>

            <div className={styles.field}>
              <span className="type-caption">
                Courses — add at least one to start the semester (you can add more, or edit these, any time later)
              </span>
              {newSemesterCourses.map((row, index) => (
                <div key={index} className={styles.repeatRow}>
                  <div className={styles.fieldRow}>
                    <label className={styles.field}>
                      <span className="type-caption">Course code</span>
                      <input
                        className={styles.input}
                        value={row.code}
                        onChange={(e) => updateNewSemesterCourseRow(index, { code: e.target.value })}
                        placeholder="e.g., CS5590"
                      />
                    </label>
                    <label className={styles.field}>
                      <span className="type-caption">Title</span>
                      <input
                        className={styles.input}
                        value={row.title}
                        onChange={(e) => updateNewSemesterCourseRow(index, { title: e.target.value })}
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
                        value={row.credits}
                        onChange={(e) => updateNewSemesterCourseRow(index, { credits: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className="type-caption">Weight / leverage</span>
                      <select
                        className={styles.input}
                        value={row.leverageClass}
                        onChange={(e) =>
                          updateNewSemesterCourseRow(index, { leverageClass: e.target.value as LeverageClass })
                        }
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </label>
                  </div>
                  {newSemesterCourses.length > 1 && (
                    <button
                      type="button"
                      className={styles.dangerLink}
                      onClick={() => removeNewSemesterCourseRow(index)}
                    >
                      Remove course
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className={styles.secondaryButton} onClick={addNewSemesterCourseRow}>
                Add another course
              </button>
              {nonEmptyNewSemesterCourses.length === 0 && (
                <p className="type-caption">
                  Fill in at least one course's code or title above — notes, syllabus, and grading breakdown can all
                  be added later from the course list.
                </p>
              )}
            </div>

            {startError && <p className={`${styles.error} type-caption`}>{startError}</p>}
            <div className={styles.actions}>
              {!isFirstRun && currentSemester && (
                <button type="button" className={styles.secondaryButton} onClick={() => setStartingNew(false)}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleStartSemester}
                disabled={
                  !label.trim() || !startsOn || !endsOn || nonEmptyNewSemesterCourses.length === 0 || starting
                }
              >
                {starting ? 'Starting…' : 'Start semester'}
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Semester</p>
        <DensityToggle />
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Semester sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={styles.tab}
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'materials' && <MaterialsTab />}

      {activeTab === 'career' && <CareerTab deadlines={deadlines} onAdded={refresh} />}

      {activeTab === 'advanced' && <AdvancedTab onSeeded={refresh} />}

      {activeTab === 'overview' && (
        <>
          <Card className={styles.card}>
        <div className={styles.row}>
          <div className={styles.rowMeta}>
            <span className={`${styles.rowTitle} type-body-medium`}>{currentSemester?.label}</span>
            <span className={`${styles.rowDetail} type-caption`}>
              {currentSemester?.starts_on} – {currentSemester?.ends_on}
            </span>
          </div>
          <button type="button" className={styles.linkButton} onClick={() => setStartingNew(true)}>
            Start next semester
          </button>
        </div>
      </Card>

      <Card className={styles.card}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Add course</h2>
        <div className={styles.form}>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Course code</span>
              <input
                className={styles.input}
                value={courseForm.code}
                onChange={(e) => setCourseForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g., CS5590"
              />
            </label>
            <label className={styles.field}>
              <span className="type-caption">Title</span>
              <input
                className={styles.input}
                value={courseForm.title}
                onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Statistical Machine Learning"
              />
            </label>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Credits (optional)</span>
              <input
                className={styles.input}
                type="number"
                min="0"
                value={courseForm.credits}
                onChange={(e) => setCourseForm((f) => ({ ...f, credits: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className="type-caption">Weight / leverage</span>
              <select
                className={styles.input}
                value={courseForm.leverageClass}
                onChange={(e) =>
                  setCourseForm((f) => ({ ...f, leverageClass: e.target.value as LeverageClass }))
                }
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          {courseError && <p className={`${styles.error} type-caption`}>{courseError}</p>}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleAddCourse}
            disabled={!courseForm.code.trim() || !courseForm.title.trim() || addingCourse}
          >
            {addingCourse ? 'Adding…' : 'Add course'}
          </button>
        </div>

        {courses.length > 0 && (
          <div className={styles.list}>
            {courses.map((c) => (
              <Card key={c.id} className={styles.courseCard}>
                <div className={styles.row}>
                  <div className={styles.rowMeta}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => toggleCourseExpanded(c.id)}
                    >
                      <span className={`${styles.rowTitle} type-body`}>
                        {c.code} — {c.title}
                      </span>
                    </button>
                    <span className={`${styles.rowDetail} type-caption`}>
                      {c.credits} credits · {c.leverage_class} leverage
                      {c.classroom_course_id ? ' · Linked to Classroom' : ''}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={styles.linkButton} onClick={() => toggleCourseExpanded(c.id)}>
                      {expandedCourseId === c.id ? 'Collapse' : 'Expand'}
                    </button>
                    <button
                      type="button"
                      className={styles.dangerLink}
                      onClick={() => startDeleteCourse(c.id)}
                      disabled={confirmingDeleteCourseId === c.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expandedCourseId === c.id && (
                  <div className={styles.courseCardBody}>
                    <div className={styles.courseSectionNav}>
                      {(
                        [
                          ['info', 'Info'],
                          ['materials', 'Materials'],
                          ['notes', 'Notes'],
                          ['log', 'Log'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={styles.courseSectionTab}
                          data-active={activeCourseSection === id}
                          onClick={() => setActiveCourseSection(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <CourseDetailsPanel
                      styles={styles}
                      course={c}
                      section={activeCourseSection}
                      onChanged={refresh}
                    />
                  </div>
                )}

                {confirmingDeleteCourseId === c.id && (
                  <div className={styles.confirmRow}>
                    {loadingLinkedCount ? (
                      <p className="type-caption">Checking linked deadlines…</p>
                    ) : (
                      <p className="type-caption">
                        Delete {c.code} — {c.title}?
                        {linkedDeadlineCount != null && linkedDeadlineCount > 0
                          ? ` This will also delete ${linkedDeadlineCount} linked deadline${
                              linkedDeadlineCount === 1 ? '' : 's'
                            }.`
                          : ' No deadlines are linked to it.'}
                      </p>
                    )}
                    {deleteCourseError && <p className={`${styles.error} type-caption`}>{deleteCourseError}</p>}
                    <div className={styles.confirmActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={cancelDeleteCourse}
                        disabled={deletingCourse}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.dangerLink}
                        onClick={confirmDeleteCourse}
                        disabled={deletingCourse || loadingLinkedCount}
                      >
                        {deletingCourse ? 'Deleting…' : 'Delete course'}
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Card className={styles.card}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Pull deadlines</h2>
        <PullDeadlinesPanel onAdded={refresh} />
        <p className={`${styles.hint} type-caption`}>
          View pulled deadlines on the Deadlines screen.
        </p>
      </Card>
        </>
      )}
    </div>
  );
}
