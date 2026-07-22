import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MessageCircle, Plus, SendHorizontal } from 'lucide-react';
import { Icon } from '../../components/shared/Icon';
import {
  askAthena,
  getAskAthenaConversation,
  listAskAthenaConversations,
  saveAskAthenaMessage,
  type AskAthenaConversationDto,
  type RecommendationDto,
} from '../../ipc/bindings';
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

/** A fresh conversation id — one per "New chat" and one generated at mount for the very first session. `crypto.randomUUID()` is available in every Tauri webview target this app ships to. */
function newConversationId(): string {
  return crypto.randomUUID();
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
 * Chat history is persisted across sessions as separate conversations,
 * ChatGPT/Gemini-style (V9 migration's `ask_athena_messages` table,
 * extended by V10 with `conversation_id`) — this overrides the screen's
 * original design, which followed the Reflection Engine's own spec
 * rejecting persistent conversational memory for the "why?" follow-up
 * mode. That reasoning still holds for *grounding*: each call to
 * `askAthena` remains independent per turn and re-grounding never
 * depends on prior turns (`athena_reasoning::capabilities::ask_athena`
 * is unchanged, and a whole prior conversation's text is never sent
 * back to it). Only the *scrollback* is now durable — persistence here
 * is purely a rendering convenience, layered on top of the existing
 * optimistic-UI flow (`setMessages`), never a new input to grounding.
 *
 * Capped at the 5 most recently active conversations
 * (`ask_athena_history::MAX_RETAINED_CONVERSATIONS`, enforced
 * server-side after every `saveAskAthenaMessage` call) rather than kept
 * forever — an unbounded chat log grows storage without limit, and 5
 * recent threads is enough to pick back up a recent line of
 * questioning without that cost.
 */
export default function AskAthena() {
  const [conversationId, setConversationId] = useState<string>(() => newConversationId());
  const [conversations, setConversations] = useState<AskAthenaConversationDto[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowToMessage = (row: {
    id: number;
    role: 'user' | 'athena';
    text: string;
    source: string | null;
    confidence: string | null;
  }): ChatMessage => ({
    id: `history-${row.id}`,
    role: row.role,
    text: row.text,
    meta:
      row.role === 'athena' && row.source && row.confidence
        ? { source: row.source, confidence: row.confidence as RecommendationDto['confidence'] }
        : undefined,
  });

  // On mount: load the recent-chats list, and open the most recently
  // active conversation if one exists (otherwise the fresh id this
  // component was initialized with stays a real, if still-empty, "new
  // chat"). A failure here is non-fatal — see the catches below —
  // same "starts empty rather than blocking the composer" reasoning
  // the original single-scrollback version used.
  useEffect(() => {
    let cancelled = false;
    listAskAthenaConversations()
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        const mostRecent = list[0];
        if (!mostRecent) return;
        setConversationId(mostRecent.conversation_id);
        return getAskAthenaConversation(mostRecent.conversation_id).then((history) => {
          if (cancelled) return;
          setMessages(history.map(rowToMessage));
        });
      })
      .catch(() => {
        // Non-fatal — see comment above.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  /** Refreshes the recent-chats list in the background — fire-and-forget, same as the message-save calls below, so a slow/failed refresh never blocks sending or switching. */
  const refreshConversationList = () => {
    listAskAthenaConversations()
      .then((list) => {
        setConversations(list);
      })
      .catch(() => {
        // Non-fatal.
      });
  };

  const startNewChat = () => {
    if (sending) return;
    setConversationId(newConversationId());
    setMessages([]);
    setError(null);
  };

  const openConversation = async (id: string) => {
    if (sending || id === conversationId) return;
    setConversationId(id);
    setError(null);
    try {
      const history = await getAskAthenaConversation(id);
      setMessages(history.map(rowToMessage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that conversation.');
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const activeConversationId = conversationId;
    const userMessage: ChatMessage = { id: newId(), role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    // Fire-and-forget: persistence is additive to the optimistic UI
    // above, never a gate on it. A save failure shouldn't block the
    // user from seeing their own message or from Athena replying.
    void saveAskAthenaMessage({ conversation_id: activeConversationId, role: 'user', text }).then(
      refreshConversationList,
    );
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
      void saveAskAthenaMessage({
        conversation_id: activeConversationId,
        role: 'athena',
        text: response.reasoning,
        source: response.source,
        confidence: response.confidence,
      }).then(refreshConversationList);
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
        <button
          type="button"
          className={styles.newChatButton}
          onClick={startNewChat}
          disabled={sending}
          aria-label="New chat"
        >
          <Icon icon={Plus} size="inline" />
          New chat
        </button>
      </div>

      {conversations.length > 0 && (
        <div className={styles.recentChats} role="tablist" aria-label="Recent chats">
          {conversations.map((conversation) => (
            <button
              key={conversation.conversation_id}
              type="button"
              role="tab"
              aria-selected={conversation.conversation_id === conversationId}
              className={styles.recentChatChip}
              data-active={conversation.conversation_id === conversationId}
              onClick={() => openConversation(conversation.conversation_id)}
              disabled={sending}
              title={conversation.title}
            >
              {conversation.title}
            </button>
          ))}
        </div>
      )}

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
