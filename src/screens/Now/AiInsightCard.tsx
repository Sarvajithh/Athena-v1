import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
import { Icon } from '../../components/shared/Icon';
import {
  getDailyBriefing,
  getWeaknessAnalysis,
  getWeeklyPlan,
  type RecommendationDto,
} from '../../ipc/bindings';
import styles from './AiInsightCard.module.css';

type Capability = 'daily' | 'weekly' | 'weakness';

const CAPABILITIES: { id: Capability; label: string; fetch: () => Promise<RecommendationDto> }[] = [
  { id: 'daily', label: 'Daily briefing', fetch: getDailyBriefing },
  { id: 'weekly', label: 'Weekly plan', fetch: getWeeklyPlan },
  { id: 'weakness', label: 'Weakness analysis', fetch: getWeaknessAnalysis },
];

const SOURCE_LABEL: Record<string, string> = {
  claude: 'Claude',
  ollama: 'Ollama',
  huggingface: 'Hugging Face',
  template: 'Template (no AI provider connected)',
};

/**
 * On-demand elaboration of Now's verdict (06_AI_ENGINE.md §4.1/§4.2/
 * §4.4) — a supplementary, collapsed-by-default card, never the
 * dominant element (`VerdictCard.tsx`'s own doc comment: "nothing else
 * competes with it"). Wires `getDailyBriefing`/`getWeeklyPlan`/
 * `getWeaknessAnalysis`, previously typed in `ipc/bindings.ts` but
 * called nowhere in the frontend. `source: "template"` is rendered as a
 * normal state, never an error — bindings.ts's own doc comment: "never
 * a failure state, per §10's offline-first requirement."
 */
export function AiInsightCard() {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<Capability>('daily');
  const [result, setResult] = useState<RecommendationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCapability = async (capability: Capability) => {
    setActive(capability);
    setLoading(true);
    setError(null);
    try {
      const fetcher = CAPABILITIES.find((c) => c.id === capability)!.fetch;
      const next = await fetcher();
      setResult(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !result && !loading) {
      void runCapability(active);
    }
  };

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLabel}>
          <Icon icon={Sparkles} size="action" />
          <span className="type-body-medium">AI insight</span>
        </div>
        <button type="button" className={styles.toggleButton} onClick={handleExpand}>
          {expanded ? 'Close' : 'Ask Athena'}
        </button>
      </div>

      {expanded ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label="AI insight capability">
            {CAPABILITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                className={styles.tab}
                data-active={active === c.id}
                aria-selected={active === c.id}
                onClick={() => void runCapability(c.id)}
                disabled={loading}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className={styles.body}>
            {loading ? <p className="type-caption">Thinking…</p> : null}
            {error ? <p className={`${styles.error} type-caption`}>{error}</p> : null}
            {!loading && !error && result ? (
              <>
                <p className="type-body-medium">{result.verdict}</p>
                <p className={`${styles.reasoning} type-body`}>{result.reasoning}</p>
                <div className={styles.footer}>
                  <ConfidenceBadge confidence={result.confidence} />
                  <span className={`${styles.freshness} type-caption`}>
                    {SOURCE_LABEL[result.source] ?? result.source} · {result.data_freshness_note}
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
