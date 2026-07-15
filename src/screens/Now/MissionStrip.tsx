import type { ProfileRow } from '../../ipc/bindings';
import styles from './MissionStrip.module.css';

interface MissionStripProps {
  profile: ProfileRow;
}

/**
 * Section 0 — Mission Strip (05_OS_HOME.md §3). A single, small,
 * persistent line rendered verbatim from `user_profile` fields — no
 * synthesis, no LLM involvement, never competing with the Recommended
 * Action for visual weight.
 *
 * Spec §3 also specifies tapping this opens Profile editing at the
 * same entry point as `03_ONBOARDING.md` §6. No such entry point exists
 * in this codebase yet (onboarding is explicitly out of scope for this
 * change), so this deliberately renders as a static line rather than a
 * button that would navigate nowhere real.
 */
export function MissionStrip({ profile }: MissionStripProps) {
  const cgpaSegment =
    profile.current_cgpa != null
      ? `CGPA ${profile.current_cgpa} → ${profile.target_cgpa}`
      : `CGPA not yet entered → target ${profile.target_cgpa}`;

  const segments = [cgpaSegment, profile.career_target, profile.masters_target ?? "No Master's target set"];

  return (
    <p className={`${styles.strip} type-caption`} aria-label="Your current mission">
      {segments.join(' · ')}
    </p>
  );
}
