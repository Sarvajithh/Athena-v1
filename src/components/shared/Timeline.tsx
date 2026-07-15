import type { ReactNode } from 'react';
import styles from './Timeline.module.css';

interface TimelineEntry {
  key: string;
  node?: ReactNode;
  content: ReactNode;
}

interface TimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

/**
 * Shared vertical timeline visual language used by both Trajectory
 * (career threads) and Decision Log (spec §5.2: "uses the same
 * card/timeline visual language as Trajectory").
 */
export function Timeline({ entries, className }: TimelineProps) {
  return (
    <div className={[styles.timeline, className].filter(Boolean).join(' ')}>
      {entries.map((entry, index) => (
        <div key={entry.key} className={styles.entry}>
          <div className={styles.rail}>
            {entry.node ?? <span className={styles.node} aria-hidden="true" />}
            {index < entries.length - 1 ? <span className={styles.connector} aria-hidden="true" /> : null}
          </div>
          <div className={styles.content}>{entry.content}</div>
        </div>
      ))}
    </div>
  );
}
