import { useState } from 'react';
import { History } from 'lucide-react';
import { CollapseList } from '../../components/shared/CollapseList';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { EmptyState } from '../../components/shared/EmptyState';
import { emptyDecisionLog, mockDecisionLog } from '../../mock/decisionLogFixtures';
import { DecisionCard } from './DecisionCard';
import styles from './DecisionLog.module.css';

/**
 * Decision Log — the historical record of decisions, challenges, and
 * how they resolved (spec §5.2). Enforces the hard max-5-visible rule
 * via `CollapseList` (spec §5.1) against 8 mock entries.
 */
export default function DecisionLog() {
  const [showEmpty, setShowEmpty] = useState(false);
  const decisions = showEmpty ? emptyDecisionLog : mockDecisionLog;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Decision Log</p>
        <DensityToggle />
      </div>

      {decisions.length === 0 ? (
        <EmptyState
          icon={History}
          title="No decisions logged yet"
          description="Recommendations, challenges, and overrides will appear here as they happen."
        />
      ) : (
        <CollapseList
          items={decisions}
          getKey={(decision) => decision.id}
          renderItem={(decision) => <DecisionCard decision={decision} />}
        />
      )}

      {import.meta.env.DEV ? (
        <button type="button" className={styles.devToggle} onClick={() => setShowEmpty((v) => !v)}>
          Dev: toggle empty state
        </button>
      ) : null}
    </div>
  );
}
