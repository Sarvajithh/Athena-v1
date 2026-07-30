import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/shared/Card';
import {
  listClassroomCourses,
  listClassroomMaterials,
  markClassroomMaterialsSeen,
  pullClassroomMaterials,
  setClassroomMaterialStudied,
  type ClassroomCourseDto,
  type ClassroomMaterialDto,
} from '../../ipc/bindings';
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
  const [courses, setCourses] = useState<ClassroomCourseDto[]>([]);
  const [materials, setMaterials] = useState<ClassroomMaterialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingMaterialId, setTogglingMaterialId] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const [courseRows, materialRows] = await Promise.all([listClassroomCourses(), listClassroomMaterials()]);
    setCourses(courseRows);
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

  const courseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of courses) map.set(c.course_id, c.section ? `${c.name} — ${c.section}` : c.name);
    return map;
  }, [courses]);

  const groups = useMemo(() => {
    const byCourse = new Map<string, ClassroomMaterialDto[]>();
    for (const m of materials) {
      const list = byCourse.get(m.course_id) ?? [];
      list.push(m);
      byCourse.set(m.course_id, list);
    }
    return Array.from(byCourse.entries()).sort(([aId], [bId]) => {
      const aName = courseNameById.get(aId) ?? aId;
      const bName = courseNameById.get(bId) ?? bId;
      return aName.localeCompare(bName);
    });
  }, [materials, courseNameById]);

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
      {groups.map(([courseId, courseMaterials]) => (
        <Card key={courseId} className={styles.card}>
          <h2 className={`${styles.sectionTitle} type-body-medium`}>
            {courseNameById.get(courseId) ?? courseId}
          </h2>
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
