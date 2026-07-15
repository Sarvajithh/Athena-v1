import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ScreenId } from '../router';

interface NavigationContextValue {
  activeScreen: ScreenId;
  /** Switches the AppShell's active screen — the same mechanism NavRail
   * itself uses. Exposed to in-screen content so a teaser row or a
   * Quick Launch link can deep-link into another screen (05_OS_HOME.md
   * §7's "deep-links directly into the relevant section of Trajectory",
   * §9's "Open Semester Setup / Decision Log → plain navigation, no
   * data created") without each screen inventing its own routing. */
  navigate: (id: ScreenId) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
  activeScreen,
  navigate,
}: {
  children: ReactNode;
  activeScreen: ScreenId;
  navigate: (id: ScreenId) => void;
}) {
  const value = useMemo(() => ({ activeScreen, navigate }), [activeScreen, navigate]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}
