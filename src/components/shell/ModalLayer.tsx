import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useModal } from '../../state/modalContext';
import { ChallengeDialogShell } from '../modals/ChallengeDialogShell';
import { DeepWorkGuardShell } from '../modals/DeepWorkGuardShell';
import { DailyQuestionnaireModal } from '../modals/DailyQuestionnaireModal';
import styles from './ModalLayer.module.css';

/** Must match `routine_scheduler::DAILY_QUESTIONNAIRE_DUE_EVENT` in
 * `crates/athena-app/src/routine_scheduler.rs` exactly. */
const DAILY_QUESTIONNAIRE_DUE_EVENT = 'daily-questionnaire-due';

/**
 * Reserved z-index layer. `ChallengeDialogShell` and
 * `DeepWorkGuardShell` remain the two dev-only, behaviorally-inert
 * shells from SPRINT2_SPEC.md §4 (nothing in this task touches either
 * one). `DailyQuestionnaireModal` is the one real, production trigger
 * this layer has ever had — opened here by a `listen()` call on the
 * Rust-emitted `daily-questionnaire-due` event.
 *
 * The listener lives in this component rather than in
 * `bootstrapContext.tsx` (the task's other suggested location) because
 * `BootstrapProvider` sits *above* `ModalProvider` in `App.tsx`/
 * `AppShell.tsx`'s provider tree — a hook called from inside
 * `BootstrapProvider` has no `useModal()` to call. `ModalLayer` is
 * already the single component this whole app renders under
 * `ModalProvider` specifically to own modal-opening concerns, so this
 * is the one other sensible, non-scattered location: still exactly one
 * listener, still not duplicated across screens.
 */
export function ModalLayer() {
  const { activeModal, openModal, closeModal } = useModal();

  useEffect(() => {
    const unlistenPromise = listen(DAILY_QUESTIONNAIRE_DUE_EVENT, () => {
      openModal('daily-questionnaire');
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [openModal]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeModal();
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        openModal('challenge');
      }
      if (event.key.toLowerCase() === 'd') {
        event.preventDefault();
        openModal('deep-work-guard');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openModal, closeModal]);

  if (!activeModal) return null;

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div onClick={(event) => event.stopPropagation()}>
        {activeModal === 'challenge' ? <ChallengeDialogShell onDismiss={closeModal} /> : null}
        {activeModal === 'deep-work-guard' ? <DeepWorkGuardShell onDismiss={closeModal} /> : null}
        {activeModal === 'daily-questionnaire' ? <DailyQuestionnaireModal onDismiss={closeModal} /> : null}
      </div>
    </div>
  );
}
