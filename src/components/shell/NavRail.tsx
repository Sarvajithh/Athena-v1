import { routes, type ScreenId } from '../../router';
import { NavRailItem } from './NavRailItem';
import styles from './NavRail.module.css';

interface NavRailProps {
  activeScreen: ScreenId;
  onNavigate: (id: ScreenId) => void;
}

/**
 * Slim always-visible icon rail, not a wide sidebar (SPRINT2_SPEC.md
 * §4). Five flat destinations don't need a labeled sidebar's width —
 * this keeps the content area maximal per spec §5.1's "minimal
 * surface, maximum signal."
 */
export function NavRail({ activeScreen, onNavigate }: NavRailProps) {
  return (
    <nav className={styles.rail} aria-label="Primary">
      {routes.map((route) => (
        <NavRailItem
          key={route.id}
          icon={route.icon}
          label={route.label}
          shortcut={route.shortcut}
          active={activeScreen === route.id}
          onSelect={() => onNavigate(route.id)}
        />
      ))}
    </nav>
  );
}
