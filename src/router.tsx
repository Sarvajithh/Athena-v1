import { lazy } from 'react';
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Compass, ListChecks, SlidersHorizontal, TrendingUp } from 'lucide-react';

const Now = lazy(() => import('./screens/Now'));
const Trajectory = lazy(() => import('./screens/Trajectory'));
const SemesterSetup = lazy(() => import('./screens/SemesterSetup'));
const DecisionLog = lazy(() => import('./screens/DecisionLog'));

export type ScreenId = 'now' | 'trajectory' | 'semester-setup' | 'decision-log';

export interface RouteConfig {
  id: ScreenId;
  label: string;
  icon: LucideIcon;
  shortcut: string;
  component: ComponentType;
}

/**
 * Flat, four items, no nesting (SPRINT2_SPEC.md §5). Order here is the
 * single source of truth for nav-rail order and ⌘1–⌘4 keyboard mapping.
 * Now is first and is the default/landing screen (spec §5.2).
 */
export const routes: RouteConfig[] = [
  { id: 'now', label: 'Now', icon: Compass, shortcut: '1', component: Now },
  { id: 'trajectory', label: 'Trajectory', icon: TrendingUp, shortcut: '2', component: Trajectory },
  {
    id: 'semester-setup',
    label: 'Semester Setup',
    icon: SlidersHorizontal,
    shortcut: '3',
    component: SemesterSetup,
  },
  { id: 'decision-log', label: 'Decision Log', icon: ListChecks, shortcut: '4', component: DecisionLog },
];

export const defaultScreenId: ScreenId = 'now';
