import { useState } from 'react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
// import {
//   emptyCareerThreads,
//   mockCareerThreads,
//   mockMetricSwimlanes,
// } from '../../mock/trajectoryFixtures';
import type { ZoomLevel } from '../../mock/types';
import { CareerThreadSection } from './CareerThreadSection';
// import { MetricSwimlane } from './MetricSwimlane';

import { TrendingUp } from 'lucide-react';

import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';

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
 * The trend-swimlane section is an honest empty state this change: no
 * `grade_snapshots`/`codeforces_snapshots`/research-hours entry UI
 * exists yet (out of scope for onboarding), so there is no real
 * time-series to plot, and Sprint 2's mock swimlane numbers are not
 * reproduced. Career threads, in contrast, are real —
 * `deadlines WHERE category = 'career'` from `get_bootstrap_state`.
 */
export default function Trajectory() {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const { state, loading } = useBootstrap();

  if (loading && !state) {
    return (
      <div className={styles.screen}>
        <LoadingState shape="metric" />
      </div>
    );
  }

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
        <EmptyState
          icon={TrendingUp}
          title="No trend data tracked yet"
          description="CGPA, Codeforces rating, and research-hour trends will appear here once they're being logged."
        />
      </Card>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Career threads</h2>
        <CareerThreadSection deadlines={state?.career_deadlines ?? []} />
      </section>
    </div>
  );
}
