import { NumberDisplay } from '../../components/shared/NumberDisplay';
import type { DsaPracticeLogDto } from '../../ipc/bindings';
import styles from './SnapshotCard.module.css';

interface LeetCodeSnapshotCardProps {
  snapshot: DsaPracticeLogDto;
}

/**
 * Renders the most recent LeetCode snapshot (07_INTEGRATIONS.md §1.2).
 * Same previously-dead-binding situation as `CodeforcesSnapshotCard`:
 * `getLatestLeetCodeSnapshot` was only reachable from
 * `ConnectorsStep.tsx` during onboarding.
 */
export function LeetCodeSnapshotCard({ snapshot }: LeetCodeSnapshotCardProps) {
  return (
    <div className={styles.card}>
      <span className={`${styles.label} type-body-medium`}>LeetCode · {snapshot.handle}</span>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <NumberDisplay value={snapshot.total_solved} />
          <span className={`${styles.statLabel} type-caption`}>Total solved</span>
        </div>
        <div className={styles.stat}>
          <NumberDisplay value={snapshot.easy_solved} />
          <span className={`${styles.statLabel} type-caption`}>Easy</span>
        </div>
        <div className={styles.stat}>
          <NumberDisplay value={snapshot.medium_solved} />
          <span className={`${styles.statLabel} type-caption`}>Medium</span>
        </div>
        <div className={styles.stat}>
          <NumberDisplay value={snapshot.hard_solved} />
          <span className={`${styles.statLabel} type-caption`}>Hard</span>
        </div>
      </div>
    </div>
  );
}
