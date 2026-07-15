import styles from './LoadingState.module.css';

export type SkeletonShape = 'verdict' | 'list' | 'metric';

interface LoadingStateProps {
  shape: SkeletonShape;
  className?: string;
}

/**
 * Structural placeholder for the future IPC-connected loading state
 * (SPRINT2_SPEC.md §15). No live loading logic is wired this sprint —
 * this component only ships the visual skeleton and is demoed
 * statically. Never a spinner, which would compete with the
 * single-dominant-element principle (§3 rule 1) rather than serve it.
 */
export function LoadingState({ shape, className }: LoadingStateProps) {
  return (
    <div
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      role="status"
      aria-label="Loading"
    >
      {shape === 'verdict' && (
        <>
          <div className={styles.block} style={{ height: 56, width: '70%' }} />
          <div className={styles.block} style={{ height: 16, width: '45%' }} />
        </>
      )}
      {shape === 'metric' && (
        <>
          <div className={styles.block} style={{ height: 16, width: '30%' }} />
          <div className={styles.block} style={{ height: 56, width: '55%' }} />
          <div className={styles.block} style={{ height: 80, width: '100%' }} />
        </>
      )}
      {shape === 'list' && (
        <>
          <div className={styles.block} style={{ height: 48, width: '100%' }} />
          <div className={styles.block} style={{ height: 48, width: '100%' }} />
          <div className={styles.block} style={{ height: 48, width: '100%' }} />
        </>
      )}
      <span className="visually-hidden">Loading</span>
    </div>
  );
}
