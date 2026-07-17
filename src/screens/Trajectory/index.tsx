import { useEffect, useState } from 'react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
// import {
//   emptyCareerThreads,
//   mockCareerThreads,
//   mockMetricSwimlanes,
// } from '../../mock/trajectoryFixtures';
import type { ZoomLevel } from '../../mock/types';
import { CareerThreadSection } from './CareerThreadSection';
import { CodeforcesSnapshotCard } from './CodeforcesSnapshotCard';
import { LeetCodeSnapshotCard } from './LeetCodeSnapshotCard';
import { ProjectStatusSection } from './ProjectStatusSection';
// import { MetricSwimlane } from './MetricSwimlane';

import { TrendingUp } from 'lucide-react';

import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';

import {
  getLatestCodeforcesSnapshot,
  getLatestLeetCodeSnapshot,
  listProjectStatusSnapshots,
  type CodeforcesSnapshotDto,
  type DsaPracticeLogDto,
  type ProjectStatusSnapshotDto,
} from '../../ipc/bindings';
import { useBootstrap } from '../../state/bootstrapContext';
import styles from './Trajectory.module.css';
import { ZoomToggle } from './ZoomToggle';

/**
 * Trajectory — CGPA/DSA/project trends against target lines at three
 * zoom levels, plus career threads as one section (spec §5.2). Static
 * mock fixtures only this sprint (SPRINT2_SPEC.md §0).
 */
// export default function Trajectory() {
//   const [zoom, setZoom] = useState<ZoomLevel>('month');
//   const [showEmptyThreads, setShowEmptyThreads] = useState(false);

//   return (
//     <div className={styles.screen}>
//       <div className={styles.header}>
//         <p className={`${styles.eyebrow} type-caption`}>Trajectory</p>
//         <div className={styles.headerControls}>
//           <ZoomToggle zoom={zoom} onChange={setZoom} />
//           <DensityToggle />
//         </div>
//       </div>

//       <Card>
//         <div className={styles.metricList}>
//           {mockMetricSwimlanes.map((metric) => (
//             <MetricSwimlane key={metric.id} metric={metric} zoom={zoom} />
//           ))}
//         </div>
//       </Card>

//       <section className={styles.section}>
//         <h2 className={`${styles.sectionTitle} type-body-medium`}>Career threads</h2>
//         <CareerThreadSection threads={showEmptyThreads ? emptyCareerThreads : mockCareerThreads} />
//       </section>

//       {import.meta.env.DEV ? (
//         <button type="button" className={styles.devToggle} onClick={() => setShowEmptyThreads((v) => !v)}>
//           Dev: toggle career threads empty state
//         </button>
//       ) : null}
//     </div>
//   );
// }


/**
 * Trajectory — CGPA/DSA/project trends against target lines at three
 * zoom levels, plus career threads as one section (spec §5.2).
 *
 * The trend-swimlane section renders the latest Codeforces/LeetCode
 * snapshots when either exists — real current-value reads via
 * `getLatestCodeforcesSnapshot`/`getLatestLeetCodeSnapshot`
 * (07_INTEGRATIONS.md §1.1/§1.2), previously only reachable from
 * `ConnectorsStep.tsx` during onboarding. This is still not the
 * `grade_snapshots`/time-series trend `MetricSwimlane.tsx` was built
 * for — no such table exists yet — so an honest empty state remains
 * the correct render when neither snapshot exists. Career threads are
 * real — `deadlines WHERE category = 'career'` from
 * `get_bootstrap_state`.
 */
export default function Trajectory() {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const { state, loading } = useBootstrap();

  const [cfSnapshot, setCfSnapshot] = useState<CodeforcesSnapshotDto | null>(null);
  const [lcSnapshot, setLcSnapshot] = useState<DsaPracticeLogDto | null>(null);
  const [projectSnapshots, setProjectSnapshots] = useState<ProjectStatusSnapshotDto[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLatestCodeforcesSnapshot(), getLatestLeetCodeSnapshot(), listProjectStatusSnapshots()])
      .then(([cf, lc, projects]) => {
        if (cancelled) return;
        setCfSnapshot(cf);
        setLcSnapshot(lc);
        setProjectSnapshots(projects);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSnapshotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !state) {
    return (
      <div className={styles.screen}>
        <LoadingState shape="metric" />
      </div>
    );
  }

  const hasSnapshots = cfSnapshot != null || lcSnapshot != null;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Trajectory</p>
        <div className={styles.headerControls}>
          <ZoomToggle zoom={zoom} onChange={setZoom} />
          <DensityToggle />
        </div>
      </div>

      <Card>
        {snapshotsLoading ? (
          <LoadingState shape="metric" />
        ) : hasSnapshots ? (
          <div className={styles.metricList}>
            {cfSnapshot ? <CodeforcesSnapshotCard snapshot={cfSnapshot} /> : null}
            {lcSnapshot ? <LeetCodeSnapshotCard snapshot={lcSnapshot} /> : null}
          </div>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No trend data tracked yet"
            description="CGPA, Codeforces rating, and research-hour trends will appear here once they're being logged."
          />
        )}
      </Card>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Career threads</h2>
        <CareerThreadSection deadlines={state?.career_deadlines ?? []} />
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Linked repos</h2>
        {snapshotsLoading ? <LoadingState shape="list" /> : <ProjectStatusSection snapshots={projectSnapshots} />}
      </section>
    </div>
  );
}
