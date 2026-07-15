import { Timer } from 'lucide-react';
import { GlassPanel } from '../shared/GlassPanel';
import { Icon } from '../shared/Icon';
import styles from './ModalShell.module.css';

interface DeepWorkGuardShellProps {
  onDismiss: () => void;
}

/**
 * Visual shell only (spec §1.3) — the real Deep Work Guard override
 * logic lives in the Rust domain layer and is out of scope this sprint
 * (MASTER_SPECIFICATION.md §4.5). Only the glass container, copy
 * placement, and deliberate entrance ship here.
 */
export function DeepWorkGuardShell({ onDismiss }: DeepWorkGuardShellProps) {
  return (
    <GlassPanel className={styles.dialog} role="alertdialog" aria-labelledby="deep-work-guard-title">
      <div className={styles.header}>
        <Icon icon={Timer} size="action" />
        <span className="type-micro">Deep work guard</span>
      </div>
      <h2 id="deep-work-guard-title" className={`${styles.title} type-headline`}>
        You're 10 minutes into a deep-work block
      </h2>
      <p className={`${styles.body} type-body`}>
        Leaving now breaks the block early. You can still leave — this just confirms it's a deliberate choice,
        not an accidental tab switch.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.buttonGhost} onClick={onDismiss}>
          Leave anyway
        </button>
        <button type="button" className={styles.buttonPrimary} onClick={onDismiss}>
          Stay in block
        </button>
      </div>
      <p className={`${styles.devNote} type-caption`}>
        Visual shell only — not wired to real guard logic this sprint.
      </p>
    </GlassPanel>
  );
}
