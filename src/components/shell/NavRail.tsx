import { routes, settingsRoute, type ScreenId } from '../../router';
import { NavRailItem } from './NavRailItem';
import styles from './NavRail.module.css';

interface NavRailProps {
  activeScreen: ScreenId;
  onNavigate: (id: ScreenId) => void;
}

/**
 * Slim always-visible icon rail, not a wide sidebar. Five flat primary
 * destinations (`routes`) up top; Settings is docked to the bottom as
 * a gear icon instead of living in the primary list — it's a
 * revisitable configuration surface, not a place someone navigates to
 * as often as Now/Deadlines/Trajectory/Ask Athena/Semester, so it gets
 * visual separation via `styles.spacer` pushing it to the rail's foot.
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
      <div className={styles.spacer} />
      <NavRailItem
        key={settingsRoute.id}
        icon={settingsRoute.icon}
        label={settingsRoute.label}
        shortcut={settingsRoute.shortcut}
        active={activeScreen === settingsRoute.id}
        onSelect={() => onNavigate(settingsRoute.id)}
      />
    </nav>
  );
}
