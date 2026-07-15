// import { Card } from '../../components/shared/Card';
// import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
// import type { DecisionEntry } from '../../mock/types';
// import styles from './DecisionCard.module.css';

// interface DecisionCardProps {
//   decision: DecisionEntry;
// }

// /** One entry in the historical record of decisions, challenges, and overrides (spec §5.2). */
// export function DecisionCard({ decision }: DecisionCardProps) {
//   return (
//     <Card className={styles.card}>
//       <div className={styles.header}>
//         <span className={`${styles.date} type-caption`}>{decision.date}</span>
//         <ConfidenceBadge confidence={decision.confidence} />
//       </div>
//       <h3 className={`${styles.title} type-body-medium`}>{decision.title}</h3>
//       <p className={`${styles.summary} type-body`}>{decision.summary}</p>
//       <div className={styles.footer}>
//         <span className={`${styles.typeTag} type-micro`}>{decision.type}</span>
//         <span className={`${styles.resolution} type-caption`}>{decision.resolution}</span>
//       </div>
//     </Card>
//   );
// }
import { Card } from '../../components/shared/Card';
import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
import type { DecisionRow } from '../../ipc/bindings';
import styles from './DecisionCard.module.css';

interface DecisionCardProps {
  decision: DecisionRow;
}

/**
 * One entry in the historical record of decisions, challenges, and
 * overrides (spec §5.2). Renders the real `decisions` row shape
 * (04_DATA_MODEL.md §9) directly — that table has no write path yet
 * (the Decision Challenge Layer is a future sprint), so this component
 * currently never actually renders; it exists so Decision Log queries
 * real, honestly-empty data instead of Sprint 2's mock fixture.
 */
export function DecisionCard({ decision }: DecisionCardProps) {
  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={`${styles.date} type-caption`}>{decision.decided_at}</span>
        {/* `decisions` carries no confidence column in the current schema
            (04_DATA_MODEL.md §9) — shown as insufficient_data until a
            future sprint's Decision Challenge Layer adds one. */}
        <ConfidenceBadge confidence="insufficient_data" />
      </div>
      <h3 className={`${styles.title} type-body-medium`}>{decision.description}</h3>
      {decision.challenge_reasoning ? (
        <p className={`${styles.summary} type-body`}>{decision.challenge_reasoning}</p>
      ) : null}
      <div className={styles.footer}>
        <span className={`${styles.typeTag} type-micro`}>{decision.decision_type}</span>
        <span className={`${styles.resolution} type-caption`}>{decision.final_outcome ?? 'Pending'}</span>
      </div>
    </Card>
  );
}
