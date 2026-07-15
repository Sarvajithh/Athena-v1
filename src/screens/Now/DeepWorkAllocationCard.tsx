import { Moon } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import type { DeepWorkAllocation } from '../../mock/types';
import styles from './DeepWorkAllocationCard.module.css';

interface DeepWorkAllocationCardProps {
  allocation: DeepWorkAllocation;
}

/**
 * The deep-work allocation for tonight's window (spec §5.2) — replaces
 * the cut "Quick Wins" task-clearing prompt, since that pattern
 * re-introduces proxy-metric gaming (spec §1.7, §1.4).
 */
export function DeepWorkAllocationCard({ allocation }: DeepWorkAllocationCardProps) {
  return (
    <Card>
      <div className={styles.header}>
        <span className={`${styles.title} type-body-medium`}>{allocation.windowLabel}</span>
      </div>
      {allocation.blocks.length === 0 ? (
        <EmptyState
          icon={Moon}
          title="No deep-work blocks allocated yet"
          description="Confirm a deep-work window in Semester Setup to see tonight's plan here."
        />
      ) : (
        <div>
          {allocation.blocks.map((block) => (
            <div key={block.id} className={styles.block}>
              <span className={`${styles.time} type-caption`}>{block.time}</span>
              <span className={`${styles.label} type-body`}>{block.label}</span>
              <span className={`${styles.minutes} type-caption`}>{block.minutes}m</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
