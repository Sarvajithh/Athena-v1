import type { HTMLAttributes, ReactNode } from 'react';
import '../../theme/glass.css';
import styles from './GlassPanel.module.css';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Whether the entrance blur-in animation should play. */
  animateIn?: boolean;
}

/**
 * The system's only glassmorphism surface (SPRINT2_SPEC.md §12): used
 * exclusively inside `ModalLayer`. No other component may import
 * `glass.css` or replicate `.glass-surface` — enforced by convention,
 * not per-screen developer judgment (Definition of Done, §18).
 */
export function GlassPanel({ children, animateIn = true, className, ...rest }: GlassPanelProps) {
  const classes = ['glass-surface', styles.panel, className].filter(Boolean).join(' ');
  return (
    <div className={classes} data-state={animateIn ? 'entering' : undefined} {...rest}>
      {children}
    </div>
  );
}
