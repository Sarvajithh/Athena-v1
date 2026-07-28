import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Plus, X } from 'lucide-react';
import {
  askAthena,
  parseChatDeadlineDraft,
  addDeadlinesToSemester,
  saveAskAthenaMessage,
  listAskAthenaConversations,
  getAskAthenaConversation,
  deleteAskAthenaConversation,
  type RecommendationDto,
  type AskAthenaMessageDto,
  type AskAthenaConversationDto,
  type ChatDeadlineDraftDto,
  type DeadlineCategory,
  type LeverageClass,
} from '../../ipc/bindings';
import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
import styles from './AskAthena.module.css';

/**
 * Ask Athena — persistent, free-form chat (06_AI_ENGINE.md, additive
 * capability). This screen was previously overwritten with a copy of
 * `src/ipc/bindings.ts` (confirmed via `git log` — the file compiled
 * only because it happened to re-export the same named bindings; it
 * had no default export, so `router.tsx`'s `lazy(() => import(...))`
 * could never actually render it). This is the real component,
 * rebuilt against the CSS module that was already sitting here
 * untouched (`AskAthena.module.css`), which is what the class names
 * below are matched to.
 *
 * Persona: a messy, overwhelmed student typing vague questions at 1am
 * on a bad connection (see the rebuild brief). Every design choice
 * below is in service of that — starter chips so an empty chat isn't
 * an empty box, an "explain like I'm overwhelmed" toggle for one next
 * action instead of a wall of options, an honest fallback note when no
 * AI phrasing was available, and a chat-native deadline-capture card
 * that never auto-commits.
 */

type ChatRole = 'user' | 'athena';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  source?: string;
  confidence?: RecommendationDto['confidence'];
  /** Set only on an 'athena' message that was a chat-capture confirmation card, not a real answer. */
  draft?: ChatDeadlineDraftDto;
  draftResolved?: 'added' | 'discarded';
}

const STARTER_CHIPS = [
  'What should I do tonight?',
  "What's due this week?",
  'Add a deadline',
  'Explain my leverage classes.',
];

function newConversationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function AskAthena() {
  const [conversations, setConversations] = useState<AskAthenaConversationDto[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [overwhelmed, setOverwhelmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const convos = await listAskAthenaConversations();
        if (cancelled) return;
        setConversations(convos);
        const mostRecent = convos[0];
        if (mostRecent) {
          setConversationId(mostRecent.conversation_id);
          const rows = await getAskAthenaConversation(mostRecent.conversation_id);
          if (!cancelled) setMessages(rows.map(rowToChatMessage));
        }
      } catch {
        // No conversations yet, or the backend isn't reachable — an
        // empty starter-chip screen is the correct degraded state,
        // not an error banner.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function rowToChatMessage(row: AskAthenaMessageDto): ChatMessage {
    return {
      id: String(row.id),
      role: row.role,
      text: row.text,
      source: row.source ?? undefined,
      confidence: (row.confidence as RecommendationDto['confidence']) ?? undefined,
    };
  }

  async function startNewChat() {
    setConversationId(newConversationId());
    setMessages([]);
    setError(null);
    setOverwhelmed(false);
  }

  async function switchConversation(id: string) {
    setConversationId(id);
    setError(null);
    try {
      const rows = await getAskAthenaConversation(id);
      setMessages(rows.map(rowToChatMessage));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeConversation(id: string) {
    try {
      await deleteAskAthenaConversation(id);
      setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setInput('');
    setSending(true);

    const activeConversationId = conversationId ?? newConversationId();
    if (!conversationId) setConversationId(activeConversationId);

    const userMessage: ChatMessage = { id: `local-${Date.now()}`, role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMessage]);

    try {
      await saveAskAthenaMessage({ conversation_id: activeConversationId, role: 'user', text: trimmed });

      // Part 3: chat-native deadline capture. Purely heuristic, zero
      // network/AI dependency — check this before spending a provider
      // call on what might just be a capture request.
      const draft = await parseChatDeadlineDraft(trimmed, localDateString()).catch(() => null);
      if (draft) {
        const cardMessage: ChatMessage = {
          id: `local-${Date.now()}-draft`,
          role: 'athena',
          text: "I found a deadline in that — check the details below before I add it.",
          draft,
        };
        setMessages((prev) => [...prev, cardMessage]);
        await saveAskAthenaMessage({
          conversation_id: activeConversationId,
          role: 'athena',
          text: cardMessage.text,
        });
        setSending(false);
        // Refresh the recent-chats list so a brand-new conversation shows up.
        listAskAthenaConversations().then(setConversations).catch(() => {});
        return;
      }

      const response = await askAthena(trimmed, activeConversationId, overwhelmed, []);
      const athenaMessage: ChatMessage = {
        id: `local-${Date.now()}-reply`,
        role: 'athena',
        text: response.reasoning,
        source: response.source,
        confidence: response.confidence,
      };
      setMessages((prev) => [...prev, athenaMessage]);
      await saveAskAthenaMessage({
        conversation_id: activeConversationId,
        role: 'athena',
        text: response.reasoning,
        source: response.source,
        confidence: response.confidence,
      });
      listAskAthenaConversations().then(setConversations).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
      setOverwhelmed(false);
    }
  }

  async function tryAgainSkipping(messageId: string, previousSource: string) {
    // Find the user message immediately preceding this athena reply.
    const idx = messages.findIndex((m) => m.id === messageId);
    const priorUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
    if (!priorUser || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await askAthena(priorUser.text, conversationId, false, [previousSource]);
      const athenaMessage: ChatMessage = {
        id: `local-${Date.now()}-retry`,
        role: 'athena',
        text: response.reasoning,
        source: response.source,
        confidence: response.confidence,
      };
      setMessages((prev) => [...prev, athenaMessage]);
      if (conversationId) {
        await saveAskAthenaMessage({
          conversation_id: conversationId,
          role: 'athena',
          text: response.reasoning,
          source: response.source,
          confidence: response.confidence,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function confirmDraft(messageId: string, edited: ChatDeadlineDraftDto) {
    try {
      await addDeadlinesToSemester([
        {
          course_id: null,
          title: edited.title,
          category: edited.category,
          due_at: edited.due_at,
          leverage_class: edited.leverage_class,
          notes: null,
        },
      ]);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, draftResolved: 'added' } : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function discardDraft(messageId: string) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, draftResolved: 'discarded' } : m)));
  }

  function updateDraftField(messageId: string, field: keyof ChatDeadlineDraftDto, value: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId && m.draft ? { ...m, draft: { ...m.draft, [field]: value } } : m)),
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h2 className="type-title">Ask Athena</h2>
        <button type="button" className={styles.newChatButton} onClick={startNewChat} disabled={sending}>
          <Plus size={16} aria-hidden="true" /> New chat
        </button>
      </div>

      {conversations.length > 0 && (
        <div className={styles.recentChats}>
          {conversations.map((c) => (
            <div key={c.conversation_id} className={styles.recentChatItem}>
              <button
                type="button"
                className={styles.recentChatChip}
                data-active={c.conversation_id === conversationId}
                onClick={() => switchConversation(c.conversation_id)}
                disabled={sending}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                type="button"
                className={styles.deleteChatButton}
                onClick={() => removeConversation(c.conversation_id)}
                disabled={sending}
                aria-label={`Delete conversation: ${c.title}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.thread} ref={threadRef}>
        {isEmpty ? (
          <div className={styles.empty}>
            <MessageCircle size={32} aria-hidden="true" />
            <p className={`${styles.emptyTitle} type-body`}>Ask Athena anything.</p>
            <p className={`${styles.emptyDescription} type-caption`}>
              What's due, what to prioritize tonight, or just drop a deadline in — "add a deadline: essay due
              friday 11:59pm" works right here in chat.
            </p>
            <div className={styles.chipsRow}>
              {STARTER_CHIPS.map((chip) => (
                <button key={chip} type="button" className={styles.chip} onClick={() => sendMessage(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={styles.messageRow} data-role={m.role}>
              {m.draft && !m.draftResolved ? (
                <DraftCard
                  draft={m.draft}
                  onChange={(field, value) => updateDraftField(m.id, field, value)}
                  onConfirm={() => confirmDraft(m.id, m.draft!)}
                  onDiscard={() => discardDraft(m.id)}
                />
              ) : (
                <div className={styles.bubble} data-role={m.role}>
                  <p className={`${styles.bubbleText} type-body`}>
                    {m.draftResolved === 'added'
                      ? 'Added to your deadlines.'
                      : m.draftResolved === 'discarded'
                        ? 'Okay, not added.'
                        : m.text}
                  </p>
                  {m.role === 'athena' && m.source && !m.draft && (
                    <p className={`${styles.bubbleMeta} type-micro`}>
                      {m.source === 'template' ? (
                        <span className={styles.fallbackNote}>
                          Athena's AI is unavailable right now — here's the plain data.
                        </span>
                      ) : (
                        <>Answered by {m.source}</>
                      )}
                      {m.confidence && <ConfidenceBadge confidence={m.confidence} />}
                    </p>
                  )}
                  {m.role === 'athena' && m.source && m.source !== 'template' && !m.draft && (
                    <button
                      type="button"
                      className={styles.tryAgainButton}
                      onClick={() => tryAgainSkipping(m.id, m.source!)}
                      disabled={sending}
                    >
                      Try again (skip {m.source})
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div className={styles.messageRow} data-role="athena">
            <div className={styles.bubble} data-role="athena">
              <p className={`${styles.thinking} type-body`}>Thinking…</p>
            </div>
          </div>
        )}
      </div>

      {error && <p className={`${styles.error} type-caption`}>{error}</p>}

      <div className={styles.composer}>
        <button
          type="button"
          className={styles.overwhelmedToggle}
          data-active={overwhelmed}
          onClick={() => setOverwhelmed((v) => !v)}
          title="Ask for one prioritized next action instead of a full answer"
        >
          Overwhelmed?
        </button>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="Ask Athena anything…"
          disabled={sending}
        />
        <button
          type="button"
          className={styles.sendButton}
          onClick={() => sendMessage(input)}
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS: DeadlineCategory[] = ['academic', 'career', 'research', 'dsa', 'other'];
const LEVERAGE_OPTIONS: LeverageClass[] = ['high', 'medium', 'low'];

interface DraftCardProps {
  draft: ChatDeadlineDraftDto;
  onChange: (field: keyof ChatDeadlineDraftDto, value: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}

/** Part 3's inline, editable confirmation card — pre-filled but never
 * auto-committed. Every field can be corrected before "Add deadline"
 * actually writes anything. */
function DraftCard({ draft, onChange, onConfirm, onDiscard }: DraftCardProps) {
  return (
    <div className={styles.draftCard}>
      <p className={`${styles.draftTitle} type-caption`}>Add this deadline?</p>
      <div className={styles.draftFieldRow}>
        <label className={styles.draftField}>
          <span className="type-micro">Title</span>
          <input
            className={styles.draftInput}
            value={draft.title}
            onChange={(e) => onChange('title', e.target.value)}
          />
        </label>
      </div>
      <div className={styles.draftFieldRow}>
        <label className={styles.draftField}>
          <span className="type-micro">Due</span>
          <input
            className={styles.draftInput}
            type="datetime-local"
            value={draft.due_at.slice(0, 16)}
            onChange={(e) => onChange('due_at', `${e.target.value}:00`)}
          />
        </label>
        <label className={styles.draftField}>
          <span className="type-micro">Category</span>
          <select
            className={styles.draftInput}
            value={draft.category}
            onChange={(e) => onChange('category', e.target.value)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.draftField}>
          <span className="type-micro">Leverage</span>
          <select
            className={styles.draftInput}
            value={draft.leverage_class}
            onChange={(e) => onChange('leverage_class', e.target.value)}
          >
            {LEVERAGE_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.draftActions}>
        <button type="button" className={styles.discardButton} onClick={onDiscard}>
          Discard
        </button>
        <button type="button" className={styles.confirmButton} onClick={onConfirm}>
          Add deadline
        </button>
      </div>
    </div>
  );
}
