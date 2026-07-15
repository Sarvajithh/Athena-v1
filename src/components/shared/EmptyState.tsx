import type { LucideIcon } from 'lucide-react';
import { Icon } from './Icon';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

/**
 * "Insufficient data" is a real, expected, correct product state (spec
 * §4.7) — this is designed with the same polish as a populated screen,
 * never an apologetic placeholder. No glass, no glow: the calmest
 * possible rendering of a screen (SPRINT2_SPEC.md §14, §3 rule 2).
 */
export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className={styles.wrapper}>
      <Icon icon={icon} size="action" className={styles.icon} />
      <p className={`${styles.title} type-body-medium`}>{title}</p>
      {description ? <p className={`${styles.description} type-caption`}>{description}</p> : null}
    </div>
  );
}
