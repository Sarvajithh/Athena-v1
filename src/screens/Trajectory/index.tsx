import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import {
  getLatestCodeforcesSnapshot,
  getLatestLeetCodeSnapshot,
  type CodeforcesSnapshotDto,
  type DsaPracticeLogDto,
} from '../../ipc/bindings';
import type { ZoomLevel } from '../../mock/types';
import { useBootstrap } from '../../state/bootstrapContext';
import { CareerThreadSection } from './CareerThreadSection';
import { CgpaProjectionCard } from './CgpaProjectionCard';
import { CodeforcesSnapshotCard } from './CodeforcesSnapshotCard';
import { InternshipTrackerCard } from './InternshipTrackerCard';
import { LeetCodeSnapshotCard } from './LeetCodeSnapshotCard';
import { MastersTrackerCard } from './MastersTrackerCard';
import styles from './Trajectory.module.css';
import { ZoomToggle } from './ZoomToggle';

/**
 * Trajectory — long-term trend + goal-tracking screen, built entirely
 * from real data already returned by `get_bootstrap_state` and the
 * two connector-snapshot commands below; no mock fixtures.
 *
 * - CGPA + target projection: `state.profile.current_cgpa`/`target_cgpa`
 *   (`03_ONBOARDING.md` §2 fields, previously collected but never
 *   surfaced back to the user anywhere).
 * - LeetCode / Codeforces: latest real snapshot via
 *   `getLatestLeetCodeSnapshot`/`getLatestCodeforcesSnapshot`
 *   (07_INTEGRATIONS.md §1.1/§1.2).
 * - Internship + Masters trackers: `state.career_deadlines`
 *   (`deadlines WHERE category = 'career'`), the same rows the new
 *   Semester → Career tab writes — titles created there are prefixed
 *   `"Internship — …"` / `"Placement — …"` / `"Higher studies — …"`,
 *   which is what these two cards group by.
 *
 * The "Linked repos" section has been removed from this screen
 * completely — no GitHub-activity tracking is part of the current spec
 * for this screen, and it read from a snapshot table nothing else in
 * the app populates. Its component (`ProjectStatusSection.tsx`) has
 * been deleted along with the import; `listProjectStatusSnapshots` /
 * `ProjectStatusSnapshotDto` remain in `ipc/bindings.ts` as a mirror of
 * the still-live backend command, in case a future GitHub-activity
 * feature wants them.
 */
export default function Trajectory() {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const { state, loading } = useBootstrap();

  const [cfSnapshot, setCfSnapshot] = useState<CodeforcesSnapshotDto | null>(null);
  const [lcSnapshot, setLcSnapshot] = useState<DsaPracticeLogDto | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLatestCodeforcesSnapshot(), getLatestLeetCodeSnapshot()])
      .then(([cf, lc]) => {
        if (cancelled) return;
        setCfSnapshot(cf);
        setLcSnapshot(lc);
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
  const careerDeadlines = state?.career_deadlines ?? [];

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Trajectory</p>
        <div className={styles.headerControls}>
          <ZoomToggle zoom={zoom} onChange={setZoom} />
          <DensityToggle />
        </div>
      </div>

      <div className={styles.grid}>
        <CgpaProjectionCard profile={state?.profile ?? null} zoom={zoom} />
        <InternshipTrackerCard deadlines={careerDeadlines} />
        <MastersTrackerCard profile={state?.profile ?? null} deadlines={careerDeadlines} />
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
            title="No DSA practice tracked yet"
            description="Connect LeetCode or Codeforces from Settings to see your practice trend here."
          />
        )}
      </Card>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Career threads</h2>
        <CareerThreadSection deadlines={careerDeadlines} />
      </section>
    </div>
  );
}
