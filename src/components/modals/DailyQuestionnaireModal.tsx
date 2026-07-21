import { useEffect, useState } from 'react';
import { ClipboardList, X } from 'lucide-react';
import { GlassPanel } from '../shared/GlassPanel';
import { Icon } from '../shared/Icon';
import { DailyConversationForm } from '../../screens/Now/RoutineQuestionnaireCard';
import { hasDailyRoutineResponse } from '../../ipc/bindings';
import { useBootstrap } from '../../state/bootstrapContext';
import styles from './ModalShell.module.css';

/** `YYYY-MM-DD` for the user's local calendar day — same convention as
 * `RoutineQuestionnaireCard.tsx`'s own `localDateToday`. Duplicated
 * here rather than imported since it's a one-line pure function and
 * `RoutineQuestionnaireCard.tsx` doesn't currently export it. */
function localDateToday(): string {
  return new Date().toLocaleDateString('en-CA');
}

interface DailyQuestionnaireModalProps {
  onDismiss: () => void;
}

/**
 * Opened by `bootstrapContext.tsx`'s `daily-questionnaire-due` event
 * listener (fired by the Rust background trigger in
 * `routine_scheduler.rs`). Reuses `Now/RoutineQuestionnaireCard.tsx`'s
 * exact `DailyConversationForm` — no duplicate form logic, same as
 * `Settings/RoutineTriggerSection.tsx`'s own manual-trigger reuse.
 *
 * Unlike `ChallengeDialogShell`/`DeepWorkGuardShell` (both
 * `role="alertdialog"`, no dismiss affordance other than their own
 * action buttons), this modal is explicitly dismissible per the task
 * spec ("not hard-blocking") — a close button, a click on the overlay
 * (handled by `ModalLayer.tsx`), and Escape (`ModalLayer.tsx`'s
 * existing dev-shortcut handler already closes on Escape unconditionally,
 * which happens to cover this modal too).
 *
 * Defensively re-checks `hasDailyRoutineResponse` on mount: the
 * backend trigger already skips firing when today is answered, but a
 * user could in principle answer via the Now card or Settings in the
 * moment between the event firing and this modal mounting — in that
 * unlikely race, this just dismisses itself instead of showing a stale
 * prompt.
 */
export function DailyQuestionnaireModal({ onDismiss }: DailyQuestionnaireModalProps) {
  const { state } = useBootstrap();
  const [checked, setChecked] = useState(false);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasDailyRoutineResponse(localDateToday())
      .then((answered) => {
        if (cancelled) return;
        setAlreadyAnswered(answered);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (checked && alreadyAnswered) onDismiss();
  }, [checked, alreadyAnswered, onDismiss]);

  if (!checked || alreadyAnswered) return null;

  return (
    <GlassPanel className={styles.dialog} role="dialog" aria-labelledby="daily-questionnaire-modal-title">
      <div className={styles.header}>
        <Icon icon={ClipboardList} size="action" />
        <span className="type-micro">Quick check-in</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
        >
          <Icon icon={X} size="action" />
        </button>
      </div>
      <h2 id="daily-questionnaire-modal-title" className={`${styles.title} type-headline`}>
        Today's check-in is ready
      </h2>
      <p className={`${styles.body} type-body`}>
        A couple of quick questions about today — answer now, or dismiss and catch it later on the Now screen or in
        Settings.
      </p>
      <DailyConversationForm courses={state?.courses ?? []} onDone={onDismiss} onCancel={onDismiss} />
    </GlassPanel>
  );
}
