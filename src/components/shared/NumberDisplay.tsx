import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { Trend } from '../../mock/types';
import { Icon } from './Icon';
import styles from './NumberDisplay.module.css';

const TREND_ICON = {
  up: ArrowUp,
  down: ArrowDown,
  flat: ArrowRight,
} as const;

const TREND_LABEL: Record<Trend, string> = {
  up: 'Trending up',
  down: 'Trending down',
  flat: 'Holding steady',
};

interface NumberDisplayProps {
  value: string | number;
  unit?: string;
  trend?: Trend;
  className?: string;
}

/**
 * "Numbers as the largest thing on any screen" (spec §5.1). The optional
 * trend arrow is informational only, at 60% opacity, and is never
 * colored red/green — a bad-news slope is named in text elsewhere, not
 * turned into a gaming-style indicator (SPRINT2_SPEC.md §12).
 */
export function NumberDisplay({ value, unit, trend, className }: NumberDisplayProps) {
  const TrendIcon = trend ? TREND_ICON[trend] : null;
  return (
    <span className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <span className={`${styles.value} type-display`}>{value}</span>
      {unit ? <span className={`${styles.unit} type-body`}>{unit}</span> : null}
      {TrendIcon && trend ? (
        <span className={styles.trend} title={TREND_LABEL[trend]}>
          <Icon icon={TrendIcon} size="inline" />
          <span className="visually-hidden">{TREND_LABEL[trend]}</span>
        </span>
      ) : null}
    </span>
  );
}
