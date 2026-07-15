import { AppShell } from './components/shell/AppShell';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { LoadingState } from './components/shared/LoadingState';
import { Onboarding } from './screens/Onboarding';
import { BootstrapProvider, useBootstrap } from './state/bootstrapContext';
import styles from './App.module.css';
import './theme/tokens.css';
import './theme/typography.css';

/**
 * Decides, from the single `get_bootstrap_state` read
 * (01_ARCHITECTURE.md §2.1), whether to render the pre-AppShell
 * Onboarding flow or the main AppShell — per AppShell.tsx's own
 * doc-comment contract. Rendered inside `BootstrapProvider` so
 * `useBootstrap()` (used by every screen and by Onboarding itself)
 * always has a provider above it.
 */
function AppGate() {
  const { state, loading, error, refresh } = useBootstrap();

  if (loading && !state) {
    return (
      <div className={styles.bootScreen}>
        <LoadingState shape="verdict" />
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className={styles.bootScreen}>
        <p role="alert">Athena couldn&apos;t start: {error}</p>
      </div>
    );
  }

  // No profile yet, or a profile with no current semester (app closed
  // mid-onboarding) — bypass the nav rail entirely (03_ONBOARDING.md §1).
  const needsOnboarding = !state?.has_profile || !state?.current_semester;

  if (needsOnboarding) {
    return <Onboarding onComplete={refresh} />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BootstrapProvider>
        <AppGate />
      </BootstrapProvider>
    </ErrorBoundary>
  );
}