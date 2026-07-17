import { NumberDisplay } from '../../components/shared/NumberDisplay';
import type { CodeforcesSnapshotDto } from '../../ipc/bindings';
import styles from './SnapshotCard.module.css';

interface CodeforcesSnapshotCardProps {
  snapshot: CodeforcesSnapshotDto;
}

/**
 * Renders the most recent Codeforces snapshot (07_INTEGRATIONS.md
 * §1.1). Previously `getLatestCodeforcesSnapshot` was only called
 * inside `ConnectorsStep.tsx` during onboarding — Trajectory showed an
 * empty state despite the snapshot already existing. This is a direct
 * current-value render, not a trend line: no `codeforces_snapshots`
 * time-series table exists yet, so this deliberately doesn't attempt
 * the swimlane `MetricSwimlane.tsx` was built for.
 */
export function CodeforcesSnapshotCard({ snapshot }: CodeforcesSnapshotCardProps) {
  return (
    <div className={styles.card}>
      <span className={`${styles.label} type-body-medium`}>Codeforces · {snapshot.handle}</span>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <NumberDisplay value={snapshot.rating ?? '—'} />
          <span className={`${styles.statLabel} type-caption`}>Rating</span>
        </div>
        <div className={styles.stat}>
          <NumberDisplay value={snapshot.max_rating ?? '—'} />
          <span className={`${styles.statLabel} type-caption`}>Max rating</span>
        </div>
        <div className={styles.stat}>
          <NumberDisplay value={snapshot.solved_count} />
          <span className={`${styles.statLabel} type-caption`}>Solved</span>
        </div>
        {snapshot.rank ? (
          <div className={styles.stat}>
            <span className="type-body-medium">{snapshot.rank}</span>
            <span className={`${styles.statLabel} type-caption`}>Rank</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
