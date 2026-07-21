import { GraduationCap } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import type { DeadlineRow, ProfileRow } from '../../ipc/bindings';
import styles from './CgpaProjectionCard.module.css';

interface MastersTrackerCardProps {
  profile: ProfileRow | null;
  deadlines: DeadlineRow[];
}

function applyByLabel(dueAt: string): string {
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (Number.isNaN(days)) return 'No date';
  if (days < 0) return 'Past due';
  if (days === 0) return 'Today';
  return `${days}d`;
}

/**
 * Masters/higher-studies tracker — combines `profile.masters_target`
 * (real field from Profile creation, `03_ONBOARDING.md` §2) with
 * `category: 'career'` deadlines whose title starts with "Higher
 * studies — " (the prefix `Semester → Career` writes for that goal
 * type). Same "filter over existing rows, no new table" approach as
 * `InternshipTrackerCard`.
 */
export function MastersTrackerCard({ profile, deadlines }: MastersTrackerCardProps) {
  const items = deadlines
    .filter((d) => /^higher studies\s—/i.test(d.title))
    .slice()
    .sort((a, b) => a.due_at.localeCompare(b.due_at));

  return (
    <Card className={styles.card}>
      <h3 className={`${styles.title} type-caption`}>Masters tracker</h3>
      {profile?.masters_target && <p className={styles.gap}>Target: {profile.masters_target}</p>}
      {items.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No higher-studies goals"
          description="Add one from Semester → Career."
        />
      ) : (
        <div className={styles.trackerList}>
          {items.map((item) => (
            <div key={item.id} className={styles.trackerRow}>
              <span className={styles.trackerTitle}>{item.title.replace(/^higher studies\s—\s/i, '')}</span>
              <span className={styles.trackerDue}>{applyByLabel(item.due_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
