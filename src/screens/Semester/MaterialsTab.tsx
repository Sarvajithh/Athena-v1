import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/shared/Card';
import {
  linkCourseToClassroom,
  listClassroomMaterials,
  markClassroomMaterialsSeen,
  pullClassroomMaterials,
  setClassroomMaterialStudied,
  type ClassroomMaterialDto,
} from '../../ipc/bindings';
import { useBootstrap } from '../../state/bootstrapContext';
import styles from './Semester.module.css';

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  drive_file: 'File',
  youtube: 'Video',
  link: 'Link',
  form: 'Form',
};

/**
 * Semester → Materials. Read-only view of Google Classroom's course
 * materials — reference content (slides, readings, links, files) a
 * teacher posts, whether through the dedicated `courseWorkMaterials`
 * resource or attached directly to an assignment/announcement. Fully
 * independent from "Pull Deadlines" (`PullDeadlinesPanel`): materials
 * are never date-filtered and never turned into a deadline, and
 * pulling them (`pullClassroomMaterials`) touches a completely
 * separate code path/tables from deadline extraction.
 *
 * Two ways materials show up here: automatically, since
 * `run_google_classroom_sync` already runs on `scheduler.rs`'s 30-minute
 * background tick whenever Google Classroom is connected; or on demand,
 * via the "Pull Materials" button below, which re-fetches immediately
 * instead of waiting for the next tick.
 *
 * New-since-last-look is tracked with `classroom_materials.seen` (V14):
 * unseen rows get a "New" badge; opening this tab marks everything
 * currently loaded as seen, so the badge behaves like an inbox, not a
 * sync trigger.
 */
export function MaterialsTab() {
  const { state, refresh } = useBootstrap();
  const courses = state?.courses ?? [];
  const [materials, setMaterials] = useState<ClassroomMaterialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingMaterialId, setTogglingMaterialId] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);
  const [linkingClassroomId, setLinkingClassroomId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const materialRows = await listClassroomMaterials();
    setMaterials(materialRows);
    const unseenIds = materialRows.filter((m) => !m.seen).map((m) => m.material_id);
    if (unseenIds.length > 0) {
      // Mark as seen *after* capturing the original `seen` values above
      // — the "New" badge should be visible for this one viewing, not
      // vanish before the person notices it, but shouldn't reappear on
      // the next visit either.
      await markClassroomMaterialsSeen(unseenIds);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    setError(null);
    setPullResult(null);
    try {
      const count = await pullClassroomMaterials();
      await load();
      setPullResult(`Pulled ${count} material${count === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPulling(false);
    }
  };

  const handleToggleStudied = async (material: ClassroomMaterialDto) => {
    setTogglingMaterialId(material.material_id);
    try {
      await setClassroomMaterialStudied(material.material_id, !material.studied);
      setMaterials((existing) =>
        existing.map((m) => (m.material_id === material.material_id ? { ...m, studied: !m.studied } : m)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingMaterialId(null);
    }
  };

  // Manual fallback for when auto-linking (title-match, at pull time)
  // didn't catch a course — e.g. the person's Athena title and
  // Classroom's title diverge more than the strict matcher allows.
  // Reuses the same `linkCourseToClassroom` command the per-course Info
  // tab uses, just exposed inline here so fixing an unmatched group
  // doesn't require navigating away from this tab. `refresh()` updates
  // `state.courses` (which flows back into `groups` below), and `load()`
  // re-fetches materials so the just-linked group re-resolves to its
  // Athena course immediately.
  const handleManualLink = async (classroomCourseId: string, localCourseId: number) => {
    if (!localCourseId) return;
    setLinkingClassroomId(classroomCourseId);
    setLinkError(null);
    try {
      await linkCourseToClassroom(localCourseId, classroomCourseId);
      await refresh();
      await load();
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinkingClassroomId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Groups materials by the *Athena* course they belong to, not by
  // Classroom's own course — that's the whole point of this tab per
  // the product vision: a material should land under the course a
  // person actually added (whose title they chose), not under
  // whatever Classroom happens to call it (or worse, a raw numeric
  // Classroom course id if that course was never returned by
  // `listClassroomCourses`, e.g. archived/removed on Classroom's
  // side). Materials whose Classroom course hasn't been linked to any
  // Athena course yet fall into a dedicated "not added in Athena"
  // group instead of being hidden or mislabeled.
  const groups = useMemo(() => {
    const byGroup = new Map<string, ClassroomMaterialDto[]>();
    for (const m of materials) {
      // Matched materials group by the Athena course id (one bucket per
      // course, however many Classroom entities feed it). Unmatched
      // materials still group per distinct Classroom course, not lumped
      // into one bucket — an unlinked "AI3403" and an unlinked "AI4000"
      // should read as two separate "not added yet" cards, not one.
      const key = m.local_course_id != null ? `local:${m.local_course_id}` : `unmatched:${m.course_id}`;
      const list = byGroup.get(key) ?? [];
      list.push(m);
      byGroup.set(key, list);
    }

    const groupInfo = (groupMaterials: ClassroomMaterialDto[]) => {
      const first = groupMaterials[0];
      if (!first) return { matched: false, label: 'Unknown' };
      const matched = first.local_course_id != null;
      const label = matched
        ? first.local_course_code
          ? `${first.local_course_code} — ${first.local_course_title}`
          : (first.local_course_title ?? first.course_id)
        : `${first.classroom_course_name ?? first.course_id} · not added in Athena yet`;
      return { matched, label };
    };

    const entries = Array.from(byGroup.entries()).map(([key, groupMaterials]) => {
      const { matched, label } = groupInfo(groupMaterials);
      const classroomCourseId = groupMaterials[0]?.course_id ?? '';
      return { key, label, matched, classroomCourseId, groupMaterials };
    });

    // Matched (real, added) courses sorted alphabetically by their
    // Athena title and shown first; unmatched Classroom courses follow,
    // also sorted alphabetically, so they read as a distinct "still
    // needs linking" section rather than being interleaved.
    entries.sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    return entries.map(
      ({ key, label, matched, classroomCourseId, groupMaterials }) =>
        [key, label, matched, classroomCourseId, groupMaterials] as const,
    );
  }, [materials]);

  const formatTimestamp = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  const pullHeader = (
    <Card className={styles.card}>
      <div className={styles.actions}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Materials</h2>
        <button type="button" className={styles.secondaryButton} onClick={handlePull} disabled={pulling}>
          {pulling ? 'Pulling…' : 'Pull Materials'}
        </button>
      </div>
      <p className={`${styles.hint} type-caption`}>
        Pulls every file, link, and resource from Google Classroom for every course — no date range, nothing
        filtered by timeline. Also happens automatically every 30 minutes while the app is open.
      </p>
      {pullResult && <p className="type-caption">{pullResult}</p>}
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
    </Card>
  );

  if (loading) {
    return (
      <div className={styles.form}>
        {pullHeader}
        <Card className={styles.card}>
          <p className="type-caption">Loading materials…</p>
        </Card>
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className={styles.form}>
        {pullHeader}
        <Card className={styles.card}>
          <p className={`${styles.hint} type-caption`}>
            Nothing synced yet. Connect Google Classroom (Settings → Connectors), then hit "Pull Materials"
            above.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      {pullHeader}
      {groups.map(([groupKey, label, matched, classroomCourseId, courseMaterials]) => (
        <Card key={groupKey} className={styles.card}>
          <h2 className={`${styles.sectionTitle} type-body-medium`}>{label}</h2>
          {!matched && (
            <>
              <p className={`${styles.hint} type-caption`}>
                This Classroom course isn't linked to a course you've added in Athena yet — pick which one it
                is below, or add the course first (Semester → Overview) if it isn't listed.
              </p>
              {courses.length > 0 ? (
                <div className={styles.field}>
                  <select
                    className={styles.input}
                    value=""
                    disabled={linkingClassroomId === classroomCourseId}
                    onChange={(e) => {
                      const localCourseId = Number(e.target.value);
                      if (localCourseId) void handleManualLink(classroomCourseId, localCourseId);
                    }}
                  >
                    <option value="">
                      {linkingClassroomId === classroomCourseId ? 'Linking…' : 'Link to a course you added…'}
                    </option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="type-caption">No courses added yet — add one in Semester → Overview first.</p>
              )}
              {linkError && <p className={`${styles.error} type-caption`}>{linkError}</p>}
            </>
          )}
          <div className={styles.list}>
            {courseMaterials.map((m) => (
              <div key={m.material_id} className={styles.row}>
                <div className={styles.rowMeta}>
                  <label className={`${styles.rowTitle} type-body`}>
                    <input
                      type="checkbox"
                      checked={m.studied}
                      onChange={() => void handleToggleStudied(m)}
                      disabled={togglingMaterialId === m.material_id}
                    />{' '}
                    {m.title}
                    {!m.seen && ' · New'}
                  </label>
                  <span className={`${styles.rowDetail} type-caption`}>
                    {m.material_type ? MATERIAL_TYPE_LABELS[m.material_type] ?? m.material_type : 'Material'}
                    {formatTimestamp(m.posted_at) ? ` · ${formatTimestamp(m.posted_at)}` : ''}
                    {m.studied ? ' · Studied' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
