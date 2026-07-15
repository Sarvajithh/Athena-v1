import { useState } from 'react';
import SemesterSetup from '../SemesterSetup';
import { useBootstrap } from '../../state/bootstrapContext';
import { ProfileWizard } from './ProfileWizard';
import styles from './Onboarding.module.css';

interface OnboardingProps {
  /** Called once Semester Setup's own commit succeeds — the whole flow is done. */
  onComplete: () => void | Promise<void>;
}

/**
 * The pre-AppShell flow (03_ONBOARDING.md §0/§1): Profile creation, then
 * Semester Setup, continuous with no visible seam and no nav rail.
 * `App.tsx` renders this in place of `AppShell` whenever
 * `get_bootstrap_state` reports no profile, or a profile with no
 * current semester yet (e.g. the app was closed mid-onboarding, after
 * Profile creation but before Semester Setup's own commit).
 */
export function Onboarding({ onComplete }: OnboardingProps) {
  const { state, refresh } = useBootstrap();
  const [profileJustCreated, setProfileJustCreated] = useState(false);

  const hasProfile = Boolean(state?.has_profile) || profileJustCreated;

  return (
    <div className={styles.stage}>
      {hasProfile ? (
        <SemesterSetup mode="first-run" onComplete={onComplete} />
      ) : (
        <ProfileWizard
          onCreated={async () => {
            setProfileJustCreated(true);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
