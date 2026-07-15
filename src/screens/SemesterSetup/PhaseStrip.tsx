import type { SemesterPhase } from '../../mock/types';
import styles from './PhaseStrip.module.css';

interface PhaseStripProps {
  phases: SemesterPhase[];
}

/**
 * Absorbs Semester View's "Big Picture" phase strip as a visual once
 * setup is complete (spec §5.2).
 */
export function PhaseStrip({ phases }: PhaseStripProps) {
  return (
    <div className={styles.strip}>
      {phases.map((phase) => (
        <div key={phase.id} className={styles.phase} data-current={phase.current}>
          <span className={`${styles.label} type-body-medium`}>{phase.label}</span>
          <span className={`${styles.range} type-caption`}>{phase.dateRange}</span>
        </div>
      ))}
    </div>
  );
}
