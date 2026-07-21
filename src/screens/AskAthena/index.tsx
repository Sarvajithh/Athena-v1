import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MessageCircle, SendHorizontal } from 'lucide-react';
import { Icon } from '../../components/shared/Icon';
import { askAthena, type RecommendationDto } from '../../ipc/bindings';
import styles from './AskAthena.module.css';

interface ChatMessage {
  id: string;
  role: 'user' | 'athena';
  text: string;
  /** Present only on `role: 'athena'` messages — carries the same provenance/confidence affordances every other capability screen shows. */
  meta?: Pick<RecommendationDto, 'source' | 'confidence'>;
}

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `msg-${nextId}`;
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'claude':
      return 'Claude';
    case 'gemini':
      return 'Gemini';
    case 'huggingface':
      return 'Hugging Face';
    case 'ollama':
      return 'Ollama (local)';
    case 'template':
      return 'no AI phrasing available right now';
    default:
      return source;
  }
}

/**
 * Ask Athena — persistent AI chat (navigation redesign). Unlike every
 * other AI-surfaced screen in the app (Now's Daily Briefing, Trajectory's
 * Weekly Digest, Semester's Weakness Analysis), this screen requires no
 * Verdict and no open deadline to be useful — it's reachable and works
 * for a brand-new user with an empty semester. Backed by the new,
 * additive `ask_athena` reasoning capability
 * (`athena_reasoning::capabilities::ask_athena`) via `askAthena()`
 * (`ipc/bindings.ts`), which goes through the exact same provider
 * cascade/grounding/template-fallback pipeline every other capability
 * uses — so this screen is never "AI unavailable," it just falls back
 * to a plainer, still-honest response.
 *
 * Chat history is local component state only (Reflection Engine's own
 * spec explicitly rejects persistent conversational memory for the
 * "why?" follow-up mode — the same reasoning applies here: each call to
 * `askAthena` is independent, and re-grounding never depends on prior
 * turns). Refreshing or navigating away clears the scrollback.
 */
export default function AskAthena() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = { id: newId(), role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setSending(true);
    setError(null);
    scrollToBottom();

    try {
      const response = await askAthena(text);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'athena',
          text: response.reasoning,
          meta: { source: response.source, confidence: response.confidence },
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong reaching Athena.');
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Ask Athena</p>
      </div>

      <div className={styles.thread} ref={scrollRef}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <Icon icon={MessageCircle} size="rail" aria-hidden />
            <p className={`${styles.emptyTitle} type-body-medium`}>Ask Athena anything</p>
            <p className={`${styles.emptyDescription} type-caption`}>
              No Verdict or deadline needed — this is a free-form chat. Try "what should I prioritize
              this week?" or "explain the leverage classes."
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={styles.messageRow} data-role={message.role}>
              <div className={styles.bubble} data-role={message.role}>
                <p className={`${styles.bubbleText} type-body`}>{message.text}</p>
                {message.meta && (
                  <p className={`${styles.bubbleMeta} type-caption`}>{sourceLabel(message.meta.source)}</p>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className={styles.messageRow} data-role="athena">
            <div className={styles.bubble} data-role="athena">
              <p className={`${styles.bubbleText} type-body ${styles.thinking}`}>Thinking…</p>
            </div>
          </div>
        )}
      </div>

      {error && <p className={`${styles.error} type-caption`}>{error}</p>}

      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.input}
          placeholder="Ask Athena…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={sending}
          aria-label="Message Athena"
        />
        <button type="submit" className={styles.sendButton} disabled={sending || !draft.trim()} aria-label="Send">
          <Icon icon={SendHorizontal} size="inline" />
        </button>
      </form>
    </div>
  );
}
