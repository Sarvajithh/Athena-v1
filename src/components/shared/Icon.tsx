import type { LucideIcon } from 'lucide-react';

export type IconSize = 'inline' | 'action' | 'rail';

const SIZE_PX: Record<IconSize, number> = {
  inline: 16,
  action: 20,
  rail: 24,
};

const STROKE_WIDTH: Record<IconSize, number> = {
  inline: 1.75,
  action: 1.75,
  rail: 1.5,
};

interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
  /** Icons never carry severity/confidence color directly (§10) —
   * only the accent/text-secondary defaults, applied via className. */
  'aria-hidden'?: boolean;
}

/**
 * Thin wrapper over the Lucide set so every icon in the app shares one
 * sizing/stroke-weight scale (SPRINT2_SPEC.md §10) instead of each call
 * site picking its own numbers.
 */
export function Icon({ icon: LucideIconComponent, size = 'inline', className, ...rest }: IconProps) {
  return (
    <LucideIconComponent
      size={SIZE_PX[size]}
      strokeWidth={STROKE_WIDTH[size]}
      className={className}
      aria-hidden={rest['aria-hidden'] ?? true}
    />
  );
}
