import { lazy } from 'react';
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Calendar, Compass, ListChecks, MessageCircle, Settings as SettingsIcon, TrendingUp } from 'lucide-react';

const Now = lazy(() => import('./screens/Now'));
const Deadlines = lazy(() => import('./screens/Deadlines'));
const Trajectory = lazy(() => import('./screens/Trajectory'));
const AskAthena = lazy(() => import('./screens/AskAthena'));
const Semester = lazy(() => import('./screens/Semester'));
const Settings = lazy(() => import('./screens/Settings'));

export type ScreenId = 'now' | 'deadlines' | 'trajectory' | 'ask-athena' | 'semester' | 'settings';

export interface RouteConfig {
  id: ScreenId;
  label: string;
  icon: LucideIcon;
  shortcut: string;
  component: ComponentType;
}

/**
 * Flat, five primary items, no nesting. Navigation redesign
 * (post-Sprint2): Decision Log is removed entirely (no Decision
 * Challenge Layer exists yet to populate it, and the old
 * `screens/DecisionLog` has been deleted along with it). Settings is
 * no longer a primary flat destination; it's reachable via the gear
 * icon docked to the bottom of the nav rail instead (see
 * `NavRail.tsx`) and is therefore intentionally excluded from this
 * array — `routes` is exactly the five primary destinations, and
 * `settings` is still a valid `ScreenId` that `AppShell` can render
 * via `settingsRoute` below, just not one `NavRail` lists inline.
 *
 * Order here is the single source of truth for nav-rail order and
 * ⌘1–⌘5 keyboard mapping. Now is first and is the default/landing
 * screen.
 */
export const routes: RouteConfig[] = [
  { id: 'now', label: 'Now', icon: Compass, shortcut: '1', component: Now },
  { id: 'deadlines', label: 'Deadlines', icon: ListChecks, shortcut: '2', component: Deadlines },
  { id: 'trajectory', label: 'Trajectory', icon: TrendingUp, shortcut: '3', component: Trajectory },
  { id: 'ask-athena', label: 'Ask Athena', icon: MessageCircle, shortcut: '4', component: AskAthena },
  { id: 'semester', label: 'Semester', icon: Calendar, shortcut: '5', component: Semester },
];

/** Not in `routes` (see doc comment above) — reached only via the nav rail's gear icon. */
export const settingsRoute: RouteConfig = {
  id: 'settings',
  label: 'Settings',
  icon: SettingsIcon,
  shortcut: '6',
  component: Settings,
};

/** All routes AppShell/NavRail need to resolve a `ScreenId` to a component, including `settingsRoute`. */
export const allRoutes: RouteConfig[] = [...routes, settingsRoute];

export const defaultScreenId: ScreenId = 'now';
