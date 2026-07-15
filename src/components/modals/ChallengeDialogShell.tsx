import { ShieldAlert } from 'lucide-react';
import { GlassPanel } from '../shared/GlassPanel';
import { Icon } from '../shared/Icon';
import styles from './ModalShell.module.css';

interface ChallengeDialogShellProps {
  onDismiss: () => void;
}

/**
 * Visual shell only (spec §1.3, §4.6) — the Decision Challenge Layer's
 * real evaluation and resubmission logic is separate, out-of-scope
 * domain work (MASTER_SPECIFICATION.md §4.6). This sprint ships the
 * glass container, copy placement, and deliberate entrance only; no
 * trigger condition, no grounding check, no resubmission handling.
 */
export function ChallengeDialogShell({ onDismiss }: ChallengeDialogShellProps) {
  return (
    <GlassPanel className={styles.dialog} role="alertdialog" aria-labelledby="challenge-dialog-title">
      <div className={styles.header}>
        <Icon icon={ShieldAlert} size="action" />
        <span className="type-micro">Decision challenge</span>
      </div>
      <h2 id="challenge-dialog-title" className={`${styles.title} type-headline`}>
        This reprioritization skips a fixed commitment
      </h2>
      <p className={`${styles.body} type-body`}>
        Moving this deadline ahead of your 6:00 PM lab session conflicts with your timetable. Confirm this is
        intentional before it's logged.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.buttonGhost} onClick={onDismiss}>
          Cancel
        </button>
        <button type="button" className={styles.buttonPrimary} onClick={onDismiss}>
          Confirm anyway
        </button>
      </div>
      <p className={`${styles.devNote} type-caption`}>
        Visual shell only — not wired to real challenge logic this sprint.
      </p>
    </GlassPanel>
  );
}
