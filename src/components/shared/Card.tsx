import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardBaseProps {
  children: ReactNode;
  className?: string;
}

type StaticCardProps = CardBaseProps &
  HTMLAttributes<HTMLDivElement> & {
    interactive?: false;
  };

type InteractiveCardProps = CardBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    interactive: true;
  };

type CardProps = StaticCardProps | InteractiveCardProps;

/**
 * Flat, `--bg-surface` card — the system's only non-elevated container
 * (SPRINT2_SPEC.md §12). Static cards never shift/lift on hover
 * (§17, "no web-style hover-everything"); only cards explicitly marked
 * `interactive` step to `--bg-surface-raised`.
 */
export function Card({ children, className, interactive, ...rest }: CardProps) {
  const classes = [styles.card, interactive ? styles.interactive : '', className].filter(Boolean).join(' ');

  if (interactive) {
    return (
      <button type="button" className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  }

  return (
    <div className={classes} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
