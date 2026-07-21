import { Suspense, useCallback, useEffect, useState } from 'react';
import { allRoutes, defaultScreenId, routes, type ScreenId } from '../../router';
import { DensityProvider } from '../../state/densityContext';
import { ModalProvider } from '../../state/modalContext';
import { NavigationProvider } from '../../state/navigationContext';
import { LoadingState } from '../shared/LoadingState';
import { ModalLayer } from './ModalLayer';
import { NavRail } from './NavRail';
import { TitleBar } from './TitleBar';
import styles from './AppShell.module.css';

/**
 * AppShell
 *  - TitleBar (hidden on the Settings screen, which renders edge-to-edge
 *    without the title bar's top strip — see the `activeScreen` check
 *    below)
 *  - NavRail
 *  - ContentRouter (renders exactly one of the five screens)
 *  - ModalLayer (reserved, behaviorally inert)
 * (SPRINT2_SPEC.md §4). Boots directly to Now within the main app.
 * `App.tsx` is the layer that decides whether to render this shell at
 * all — it renders the pre-AppShell Onboarding flow instead whenever no
 * profile/semester exists yet (03_ONBOARDING.md §1), bypassing the nav
 * rail entirely for first launch.
 */
export function AppShell() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>(defaultScreenId);

  const navigate = useCallback((id: ScreenId) => setActiveScreen(id), []);

  // Keyboard shortcuts ⌘1–⌘5 / Ctrl+1–5 map to the five screens (§5).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const route = routes.find((r) => r.shortcut === event.key);
      if (!route) return;
      event.preventDefault();
      setActiveScreen(route.id);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // `allRoutes` (routes + settingsRoute) is a fixed, non-empty literal, so
  // the fallback index access is safe; non-null assert to satisfy
  // noUncheckedIndexedAccess (Sprint1 tsconfig) without weakening the type.
  const ActiveScreen = allRoutes.find((route) => route.id === activeScreen)?.component ?? allRoutes[0]!.component;

  return (
    <DensityProvider>
      <ModalProvider>
        <NavigationProvider activeScreen={activeScreen} navigate={navigate}>
          <div className={styles.shell}>
            <TitleBar />
            <div className={styles.body}>
              <NavRail activeScreen={activeScreen} onNavigate={navigate} />
              <main className={styles.content} key={activeScreen}>
                <Suspense fallback={<LoadingState shape="verdict" />}>
                  <ActiveScreen />
                </Suspense>
              </main>
            </div>
            <ModalLayer />
          </div>
        </NavigationProvider>
      </ModalProvider>
    </DensityProvider>
  );
}
