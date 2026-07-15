import type { LucideIcon } from 'lucide-react';
import { Icon } from '../shared/Icon';
import styles from './NavRailItem.module.css';

interface NavRailItemProps {
  icon: LucideIcon;
  label: string;
  shortcut: string;
  active: boolean;
  onSelect: () => void;
}

export function NavRailItem({ icon, label, shortcut, active, onSelect }: NavRailItemProps) {
  return (
    <button
      type="button"
      className={styles.item}
      data-active={active}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      aria-label={`${label} (⌘${shortcut})`}
    >
      <Icon icon={icon} size="rail" aria-hidden />
      <span className={`${styles.tooltip} type-caption`} role="tooltip">
        {label} · ⌘{shortcut}
      </span>
    </button>
  );
}
