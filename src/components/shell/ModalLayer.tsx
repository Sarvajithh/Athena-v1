import { useEffect } from 'react';
import { useModal } from '../../state/modalContext';
import { ChallengeDialogShell } from '../modals/ChallengeDialogShell';
import { DeepWorkGuardShell } from '../modals/DeepWorkGuardShell';
import styles from './ModalLayer.module.css';

/**
 * Reserved z-index layer, structurally present, behaviorally inert this
 * sprint (SPRINT2_SPEC.md §4). `ChallengeDialogShell` and
 * `DeepWorkGuardShell` are the *only* two interruptive surfaces the
 * entire app will ever have (spec §1.3) — a hard ceiling, not a
 * starting point. Nothing triggers this layer yet except the dev-only
 * shortcut wired below, gated behind `import.meta.env.DEV` (§19 manual
 * test #10: "removed or dev-flag-gated before merge").
 */
export function ModalLayer() {
  const { activeModal, openModal, closeModal } = useModal();

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
      </div>
    </div>
  );
}
