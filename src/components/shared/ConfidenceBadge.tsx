import type { Confidence } from '../../mock/types';
import styles from './ConfidenceBadge.module.css';

const CONFIDENCE_META: Record<Confidence, { color: string; label: string }> = {
  confirmed: { color: 'var(--confidence-confirmed)', label: 'Confirmed' },
  inferred: { color: 'var(--confidence-inferred)', label: 'Inferred' },
  insufficient_data: { color: 'var(--confidence-insufficient)', label: 'Insufficient data' },
};

interface ConfidenceBadgeProps {
  confidence: Confidence;
  className?: string;
}

/**
 * Reads as a data qualifier, not a status pill (SPRINT2_SPEC.md §12).
 * `inferred` must visually read as "hypothesis," not fact (§19 test #5)
 * — it reuses `--text-secondary`, deliberately less assertive than
 * `confirmed`'s sage green.
 */
export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const meta = CONFIDENCE_META[confidence];
  return (
    <span className={[styles.badge, 'type-micro', className].filter(Boolean).join(' ')}>
      <span className={styles.dot} style={{ backgroundColor: meta.color }} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
