// import { useState } from 'react';
// import { AlertCircle } from 'lucide-react';
import { DensityToggle } from '../../components/shared/DensityToggle';
// import { Icon } from '../../components/shared/Icon';
// import { SeverityDot } from '../../components/shared/SeverityDot';
// import {
//   emptyDeepWorkAllocation,
//   mockBottleneck,
//   mockDeepWorkAllocation,
//   mockDriftBanner,
//   mockVerdict,
// } from '../../mock/nowFixtures';
// import { BottleneckStrip } from './BottleneckStrip';
import { DeepWorkAllocationCard } from './DeepWorkAllocationCard';
import styles from './Now.module.css';
import { VerdictCard } from './VerdictCard';

import { LoadingState } from '../../components/shared/LoadingState';
import { useBootstrap } from '../../state/bootstrapContext';

/**
 * Now — the default screen. Answers one question: what's the one thing
 * right now? (spec §5.2). Renders entirely against static mock fixtures
 * this sprint (SPRINT2_SPEC.md §0) — no IPC, no domain computation.
 */
// export default function Now() {
//   const [showEmpty, setShowEmpty] = useState(false);
//   const allocation = showEmpty ? emptyDeepWorkAllocation : mockDeepWorkAllocation;

//   return (
//     <div className={styles.screen}>
//       <div className={styles.header}>
//         <p className={`${styles.eyebrow} type-caption`}>Now</p>
//         <DensityToggle />
//       </div>

//       <VerdictCard verdict={mockVerdict} />

//       <div className={styles.secondaryRow}>
//         <div className={styles.driftBanner}>
//           <SeverityDot severity={mockDriftBanner.severity} showLabel={false} />
//           <Icon icon={AlertCircle} size="inline" />
//           <span className={`${styles.driftText} type-caption`}>{mockDriftBanner.message}</span>
//         </div>
//         <BottleneckStrip bottleneck={mockBottleneck} />
//         <DeepWorkAllocationCard allocation={allocation} />
//       </div>

//       {import.meta.env.DEV ? (
//         <button type="button" className={styles.devToggle} onClick={() => setShowEmpty((v) => !v)}>
//           Dev: toggle deep-work empty state
//         </button>
//       ) : null}
//     </div>
//   );
// }



function formatWindow(start: string, end: string): string {
  const format = (hhmm: string) => {
    const parts = hhmm.split(':');
    const h = Number.parseInt(parts[0] ?? '0', 10);
    const m = parts[1] ?? '00';
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m} ${period}`;
  };
  return `Tonight's deep-work window · ${format(start)}–${format(end)}`;
}

/**
 * Now — the default screen. Answers one question: what's the one thing
 * right now? (spec §5.2). Renders against `get_bootstrap_state` — real
 * persisted deadlines and profile data, not Sprint 2's static mock
 * fixtures. The verdict itself is computed by `athena-domain::priority`
 * (a minimal, honest, deterministic pick — see that module's doc
 * comment for what it deliberately does not implement).
 */
export default function Now() {
  const { state, loading } = useBootstrap();

  if (loading && !state) {
    return (
      <div className={styles.screen}>
        <LoadingState shape="verdict" />
      </div>
    );
  }

  if (!state) {
    return null;
  }

  const allocation = state.profile
    ? {
        windowLabel: formatWindow(state.profile.deep_work_window_start, state.profile.deep_work_window_end),
        // No deep-work block allocation engine exists yet (out of scope
        // for this change) — an honest empty state, not fabricated blocks.
        blocks: [],
      }
    : { windowLabel: "Tonight's deep-work window", blocks: [] };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Now</p>
        <DensityToggle />
      </div>

      <VerdictCard verdict={state.verdict} />

      <div className={styles.secondaryRow}>
        <DeepWorkAllocationCard allocation={allocation} />
      </div>
    </div>
  );
}
