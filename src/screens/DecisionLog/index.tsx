import { History } from 'lucide-react';
import { CollapseList } from '../../components/shared/CollapseList';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import { useBootstrap } from '../../state/bootstrapContext';
import { DecisionCard } from './DecisionCard';
import styles from './DecisionLog.module.css';

/**
 * Decision Log — the historical record of decisions, challenges, and
 * how they resolved (spec §5.2). Enforces the hard max-5-visible rule
 * via `CollapseList` (spec §5.1). Reads the real (currently always
 * empty) `decisions` table via `get_bootstrap_state` instead of Sprint
 * 2's 8-entry mock fixture — the Decision Challenge Layer that would
 * populate it is a future sprint, so an empty state here is the honest,
 * correct state today.
 */
export default function DecisionLog() {
  const { state, loading } = useBootstrap();

  if (loading && !state) {
    return (
      <div className={styles.screen}>
        <LoadingState shape="list" />
      </div>
    );
  }

  const decisions = state?.decisions ?? [];

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
          getKey={(decision) => String(decision.id)}
          renderItem={(decision) => <DecisionCard decision={decision} />}
        />
      )}
    </div>
  );
}
