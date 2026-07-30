import { useEffect, useState } from 'react';
import {
  addCourseLog,
  deleteCourseLog,
  linkCourseToClassroom,
  listClassroomCourses,
  listClassroomMaterials,
  listCourseLogs,
  markClassroomMaterialsSeen,
  setClassroomMaterialStudied,
  updateCourseNotes,
  type ClassroomCourseDto,
  type ClassroomMaterialDto,
  type CourseLogRow,
  type CourseRow,
} from '../../ipc/bindings';

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  drive_file: 'File',
  youtube: 'Video',
  link: 'Link',
  form: 'Form',
};

interface CourseDetailsPanelProps {
  styles: Record<string, string>;
  course: CourseRow;
  /** Which dedicated section to show — the Semester screen's course card picks this via its own sub-navigation. */
  section: 'info' | 'materials' | 'notes' | 'log';
  /** Bootstrap refresh — called after a successful notes save or Classroom link change so `state.courses` picks up the change. */
  onChanged: () => void | Promise<void>;
}

/**
 * Per-course details (Semester screen course card) — the messy-student
 * surface for this app. Split into four independently-shown sections
 * via the `section` prop, so the course card's own sub-navigation
 * (Info / Materials / Notes / Log) can give each one real dedicated
 * space instead of stacking everything into one long scroll:
 *
 * - **Info** — links this course to its Google Classroom course (V15).
 * - **Materials** — that Classroom course's materials, each with a
 *   person-set "studied" checkbox — materials live where the course
 *   lives, not only in the separate global Materials tab.
 * - **Notes** — one standing free-text field (`courses.notes`, V12),
 *   editable any time, not just at creation.
 * - **Log** — a running, timestamped journal (V13__course_logs.sql)
 *   for the small dated things worth jotting down over a semester
 *   ("missed lecture, need notes from Priya") that don't belong
 *   overwriting the standing Notes block.
 *
 * All four sections' data loads up front regardless of which one is
 * currently shown (see the `useEffect`s below) — switching sections is
 * just a render-time filter, not a re-fetch, so it's instant.
 */
export function CourseDetailsPanel({ styles, course, section, onChanged }: CourseDetailsPanelProps) {
  const [notes, setNotes] = useState(course.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const [logs, setLogs] = useState<CourseLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logDraft, setLogDraft] = useState('');
  const [addingLog, setAddingLog] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);

  const [classroomCourses, setClassroomCourses] = useState<ClassroomCourseDto[]>([]);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [materials, setMaterials] = useState<ClassroomMaterialDto[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [togglingMaterialId, setTogglingMaterialId] = useState<string | null>(null);

  // Keeps the textarea in sync if `course.notes` changes from outside
  // (e.g. a bootstrap refresh triggered elsewhere) without clobbering
  // an in-progress edit on every keystroke — only resyncs when the
  // underlying course row's own `notes` value changes.
  useEffect(() => {
    setNotes(course.notes ?? '');
  }, [course.notes]);

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    setLogsError(null);
    listCourseLogs(course.id)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((e) => {
        if (!cancelled) setLogsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [course.id]);

  const handleSaveNotes = async () => {
    if (savingNotes) return;
    setSavingNotes(true);
    setNotesError(null);
    setJustSaved(false);
    try {
      await updateCourseNotes(course.id, notes.trim() ? notes.trim() : null);
      setJustSaved(true);
      await onChanged();
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingNotes(false);
    }
  };

  // Populates the "link to Classroom course" dropdown. A short list in
  // practice (one entry per course the person is enrolled in), so a
  // plain fetch-on-mount is enough — no pagination/search needed.
  useEffect(() => {
    let cancelled = false;
    listClassroomCourses()
      .then((rows) => {
        if (!cancelled) setClassroomCourses(rows);
      })
      .catch(() => {
        // Silent: an empty dropdown (fallback state below) already
        // communicates "nothing to link to" whether that's because
        // Classroom isn't connected or the fetch failed — no need for
        // a second error surface on top of the notes/log ones already
        // in this panel.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshMaterials = (classroomCourseId: string) => {
    setMaterialsLoading(true);
    setMaterialsError(null);
    listClassroomMaterials()
      .then(async (all) => {
        const mine = all.filter((m) => m.course_id === classroomCourseId);
        setMaterials(mine);
        const unseenIds = mine.filter((m) => !m.seen).map((m) => m.material_id);
        if (unseenIds.length > 0) await markClassroomMaterialsSeen(unseenIds);
      })
      .catch((e) => setMaterialsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setMaterialsLoading(false));
  };

  // Loads this course's materials whenever it's linked to a Classroom
  // course; clears them when unlinked.
  useEffect(() => {
    if (course.classroom_course_id) {
      refreshMaterials(course.classroom_course_id);
    } else {
      setMaterials([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.classroom_course_id]);

  const handleLinkChange = async (classroomCourseId: string) => {
    setLinking(true);
    setLinkError(null);
    try {
      await linkCourseToClassroom(course.id, classroomCourseId || null);
      await onChanged();
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  };

  const handleToggleStudied = async (material: ClassroomMaterialDto) => {
    setTogglingMaterialId(material.material_id);
    setMaterialsError(null);
    try {
      await setClassroomMaterialStudied(material.material_id, !material.studied);
      setMaterials((existing) =>
        existing.map((m) => (m.material_id === material.material_id ? { ...m, studied: !m.studied } : m)),
      );
    } catch (e) {
      setMaterialsError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingMaterialId(null);
    }
  };

  const handleAddLog = async () => {
    if (!logDraft.trim() || addingLog) return;
    setAddingLog(true);
    setLogsError(null);
    try {
      await addCourseLog(course.id, logDraft.trim());
      setLogDraft('');
      const rows = await listCourseLogs(course.id);
      setLogs(rows);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingLog(false);
    }
  };

  const handleDeleteLog = async (logId: number) => {
    setDeletingLogId(logId);
    setLogsError(null);
    try {
      await deleteCourseLog(logId);
      setLogs((existing) => existing.filter((l) => l.id !== logId));
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingLogId(null);
    }
  };

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div className={styles.detailsPanel}>
      {section === 'info' && (
        <div className={styles.field}>
          <span className="type-caption">Google Classroom course</span>
          <select
            className={styles.input}
            value={course.classroom_course_id ?? ''}
            onChange={(e) => void handleLinkChange(e.target.value)}
            disabled={linking}
          >
            <option value="">Not linked</option>
            {classroomCourses.map((cc) => (
              <option key={cc.course_id} value={cc.course_id}>
                {cc.section ? `${cc.name} — ${cc.section}` : cc.name}
              </option>
            ))}
          </select>
          {classroomCourses.length === 0 && (
            <p className="type-caption">
              No Classroom courses found — connect Google Classroom (Settings → Connectors) to link one.
            </p>
          )}
          {course.classroom_course_id && (
            <p className="type-caption">
              Linked — that Classroom course's materials appear in this course's Materials section
              automatically.
            </p>
          )}
          {linkError && <p className={`${styles.error} type-caption`}>{linkError}</p>}
        </div>
      )}

      {section === 'notes' && (
        <>
          <label className={styles.field}>
            <span className="type-caption">Notes</span>
            <textarea
              className={styles.input}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setJustSaved(false);
              }}
              placeholder="e.g., seminar-style, participation-heavy; prof grades the midterm hard"
              rows={5}
            />
          </label>
          <div className={styles.actions}>
            {justSaved && !savingNotes && <span className="type-caption">Saved.</span>}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleSaveNotes}
              disabled={savingNotes}
            >
              {savingNotes ? 'Saving…' : 'Save notes'}
            </button>
          </div>
          {notesError && <p className={`${styles.error} type-caption`}>{notesError}</p>}
        </>
      )}

      {section === 'log' && (
        <div className={styles.field}>
          <span className="type-caption">Quick, dated notes as the semester goes</span>
          <div className={styles.fieldRow}>
            <input
              className={styles.input}
              value={logDraft}
              onChange={(e) => setLogDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddLog();
              }}
              placeholder="e.g., missed lecture 7/29, need notes from Priya"
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleAddLog}
              disabled={!logDraft.trim() || addingLog}
            >
              {addingLog ? 'Adding…' : 'Add entry'}
            </button>
          </div>

          {logsLoading ? (
            <p className="type-caption">Loading log…</p>
          ) : logs.length === 0 ? (
            <p className="type-caption">No entries yet.</p>
          ) : (
            <ul className={styles.logList}>
              {logs.map((entry) => (
                <li key={entry.id} className={styles.logEntry}>
                  <div className={styles.logEntryBody}>
                    <span className="type-caption">{formatTimestamp(entry.created_at)}</span>
                    <p className="type-body">{entry.body}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.dangerLink}
                    onClick={() => handleDeleteLog(entry.id)}
                    disabled={deletingLogId === entry.id}
                  >
                    {deletingLogId === entry.id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {logsError && <p className={`${styles.error} type-caption`}>{logsError}</p>}
        </div>
      )}

      {section === 'materials' && (
        <div className={styles.field}>
          {!course.classroom_course_id ? (
            <p className="type-caption">
              Not linked to a Google Classroom course yet — link one in the Info section to pull its
              materials in here.
            </p>
          ) : materialsLoading ? (
            <p className="type-caption">Loading materials…</p>
          ) : materials.length === 0 ? (
            <p className="type-caption">Nothing synced for this course yet.</p>
          ) : (
            <ul className={styles.logList}>
              {materials.map((m) => (
                <li key={m.material_id} className={styles.logEntry}>
                  <label className={styles.logEntryBody}>
                    <span className="type-body">
                      <input
                        type="checkbox"
                        checked={m.studied}
                        onChange={() => void handleToggleStudied(m)}
                        disabled={togglingMaterialId === m.material_id}
                      />{' '}
                      {m.title}
                      {!m.seen && ' · New'}
                    </span>
                    <span className="type-caption">
                      {m.material_type ? MATERIAL_TYPE_LABELS[m.material_type] ?? m.material_type : 'Material'}
                      {m.posted_at ? ` · ${formatTimestamp(m.posted_at)}` : ''}
                      {m.studied ? ' · Studied' : ''}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {materialsError && <p className={`${styles.error} type-caption`}>{materialsError}</p>}
        </div>
      )}
    </div>
  );
}
