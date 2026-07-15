import { Card } from '../../components/shared/Card';
import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
import type { DecisionEntry } from '../../mock/types';
import styles from './DecisionCard.module.css';

interface DecisionCardProps {
  decision: DecisionEntry;
}

/** One entry in the historical record of decisions, challenges, and overrides (spec §5.2). */
export function DecisionCard({ decision }: DecisionCardProps) {
  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={`${styles.date} type-caption`}>{decision.date}</span>
        <ConfidenceBadge confidence={decision.confidence} />
      </div>
      <h3 className={`${styles.title} type-body-medium`}>{decision.title}</h3>
      <p className={`${styles.summary} type-body`}>{decision.summary}</p>
      <div className={styles.footer}>
        <span className={`${styles.typeTag} type-micro`}>{decision.type}</span>
        <span className={`${styles.resolution} type-caption`}>{decision.resolution}</span>
      </div>
    </Card>
  );
}
