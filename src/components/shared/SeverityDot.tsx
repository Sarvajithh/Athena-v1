import type { Severity } from '../../mock/types';
import styles from './SeverityDot.module.css';

const SEVERITY_META: Record<Severity, { color: string; label: string }> = {
  watch: { color: 'var(--severity-watch)', label: 'Watch' },
  flag: { color: 'var(--severity-flag)', label: 'Flag' },
  urgent: { color: 'var(--severity-urgent)', label: 'Urgent' },
};

interface SeverityDotProps {
  severity: Severity;
  /** Shows the text label next to the dot. Even when hidden, the label
   * is still exposed to assistive tech — severity is never color-only
   * (SPRINT2_SPEC.md §16). */
  showLabel?: boolean;
  className?: string;
}

export function SeverityDot({ severity, showLabel = true, className }: SeverityDotProps) {
  const meta = SEVERITY_META[severity];
  return (
    <span className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <span className={styles.dot} style={{ backgroundColor: meta.color }} aria-hidden="true" />
      {showLabel ? (
        <span className={`${styles.label} type-caption`}>{meta.label}</span>
      ) : (
        <span className="visually-hidden">{meta.label}</span>
      )}
    </span>
  );
}
