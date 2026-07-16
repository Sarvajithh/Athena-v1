import type { SyncStatus } from '../../ipc/bindings';
import styles from './SyncStatusBadge.module.css';

const STATUS_META: Record<SyncStatus, { color: string; label: string }> = {
  disconnected: { color: 'var(--text-secondary)', label: 'Not connected' },
  idle: { color: 'var(--text-secondary)', label: 'Idle' },
  syncing: { color: 'var(--confidence-inferred)', label: 'Syncing…' },
  ok: { color: 'var(--confidence-confirmed)', label: 'Connected' },
  error: { color: 'var(--severity-urgent)', label: 'Sync failed' },
};

interface SyncStatusBadgeProps {
  status: SyncStatus;
  className?: string;
}

/**
 * A connector's current status (07_INTEGRATIONS.md §5: "staleness is a
 * first-class, visible state, not a silent failure"). Same shape as
 * `ConfidenceBadge` — a colored dot plus a short label — reused rather
 * than reinvented, since both are "data qualifier, not status pill."
 */
export function SyncStatusBadge({ status, className }: SyncStatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span className={[styles.badge, 'type-micro', className].filter(Boolean).join(' ')}>
      <span className={styles.dot} style={{ backgroundColor: meta.color }} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
