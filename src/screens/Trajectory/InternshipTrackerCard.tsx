import { Briefcase } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import type { DeadlineRow } from '../../ipc/bindings';
import styles from './CgpaProjectionCard.module.css';

interface InternshipTrackerCardProps {
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
 * Internship/placement tracker — real `category: 'career'` deadlines
 * whose title starts with the "Placement — " / "Internship — " prefix
 * `Semester → Career` (`CareerTab.tsx`) writes when that goal type is
 * selected. No separate `internships` table exists — this is a filter
 * over the same `deadlines` rows the Career tab and Career threads
 * section already read, not a second data source.
 */
export function InternshipTrackerCard({ deadlines }: InternshipTrackerCardProps) {
  const items = deadlines
    .filter((d) => /^(placement|internship)\s—/i.test(d.title))
    .slice()
    .sort((a, b) => a.due_at.localeCompare(b.due_at));

  return (
    <Card className={styles.card}>
      <h3 className={`${styles.title} type-caption`}>Internship / placement tracker</h3>
      {items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No internship or placement goals"
          description="Add one from Semester → Career."
        />
      ) : (
        <div className={styles.trackerList}>
          {items.map((item) => (
            <div key={item.id} className={styles.trackerRow}>
              <span className={styles.trackerTitle}>{item.title.replace(/^(placement|internship)\s—\s/i, '')}</span>
              <span className={styles.trackerDue}>{applyByLabel(item.due_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
