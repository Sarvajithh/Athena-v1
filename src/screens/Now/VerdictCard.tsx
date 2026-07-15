import { Sparkles } from 'lucide-react';
import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
import { Icon } from '../../components/shared/Icon';
import type { VerdictDto } from '../../ipc/bindings';
import styles from './VerdictCard.module.css';

interface VerdictCardProps {
  verdict: VerdictDto;
}

/**
 * The dominant element on Now (spec §5.2): the Priority Resolution
 * engine's ranked answer — verdict, one-sentence reasoning, confidence
 * badge. Not the next chronological calendar item. Largest, highest-
 * contrast thing on screen; nothing else competes with it (§3 rule 1).
 *
 * Per 09_DECISION_ENGINE.md §4/§2.1: no secondary ranked list is shown
 * by default. `verdict.runners_up` is only ever non-empty when
 * `athena-domain::priority`'s Closeness Threshold determined the top
 * candidates are genuinely, closely tied — in which case up to 2
 * additional ranked items render beneath the primary verdict, each with
 * its own one-line reasoning (never more than 3 items total).
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

      {verdict.runners_up.length > 0 ? (
        <ul className={styles.runnersUp}>
          {verdict.runners_up.map((candidate) => (
            <li key={candidate.id} className={styles.runnerUpItem}>
              <span className={`${styles.runnerUpHeadline} type-body-medium`}>{candidate.headline}</span>
              <span className={`${styles.runnerUpReasoning} type-caption`}>{candidate.reasoning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
