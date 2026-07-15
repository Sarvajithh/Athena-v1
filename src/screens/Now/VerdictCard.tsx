import { Sparkles } from 'lucide-react';
import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
import { Icon } from '../../components/shared/Icon';
import type { Verdict } from '../../mock/types';
import styles from './VerdictCard.module.css';

interface VerdictCardProps {
  verdict: Verdict;
}

/**
 * The dominant element on Now (spec §5.2): the Priority Resolution
 * engine's ranked answer — verdict, one-sentence reasoning, confidence
 * badge. Not the next chronological calendar item. Largest, highest-
 * contrast thing on screen; nothing else competes with it (§3 rule 1).
 */
export function VerdictCard({ verdict }: VerdictCardProps) {
  return (
    <section className={styles.card} aria-labelledby="verdict-headline">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.eyebrow}>
        <Icon icon={Sparkles} size="inline" />
        <span className="type-micro">Right now</span>
      </div>
      <h1 id="verdict-headline" className={`${styles.headline} type-headline`}>
        {verdict.headline}
      </h1>
      <p className={`${styles.reasoning} type-body`}>{verdict.reasoning}</p>
      <div className={styles.footer}>
        <ConfidenceBadge confidence={verdict.confidence} />
      </div>
    </section>
  );
}
