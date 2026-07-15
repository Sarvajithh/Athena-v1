import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { Icon } from '../../components/shared/Icon';
import { SeverityDot } from '../../components/shared/SeverityDot';
import {
  emptyDeepWorkAllocation,
  mockBottleneck,
  mockDeepWorkAllocation,
  mockDriftBanner,
  mockVerdict,
} from '../../mock/nowFixtures';
import { BottleneckStrip } from './BottleneckStrip';
import { DeepWorkAllocationCard } from './DeepWorkAllocationCard';
import styles from './Now.module.css';
import { VerdictCard } from './VerdictCard';

/**
 * Now — the default screen. Answers one question: what's the one thing
 * right now? (spec §5.2). Renders entirely against static mock fixtures
 * this sprint (SPRINT2_SPEC.md §0) — no IPC, no domain computation.
 */
export default function Now() {
  const [showEmpty, setShowEmpty] = useState(false);
  const allocation = showEmpty ? emptyDeepWorkAllocation : mockDeepWorkAllocation;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Now</p>
        <DensityToggle />
      </div>

      <VerdictCard verdict={mockVerdict} />

      <div className={styles.secondaryRow}>
        <div className={styles.driftBanner}>
          <SeverityDot severity={mockDriftBanner.severity} showLabel={false} />
          <Icon icon={AlertCircle} size="inline" />
          <span className={`${styles.driftText} type-caption`}>{mockDriftBanner.message}</span>
        </div>
        <BottleneckStrip bottleneck={mockBottleneck} />
        <DeepWorkAllocationCard allocation={allocation} />
      </div>

      {import.meta.env.DEV ? (
        <button type="button" className={styles.devToggle} onClick={() => setShowEmpty((v) => !v)}>
          Dev: toggle deep-work empty state
        </button>
      ) : null}
    </div>
  );
}
