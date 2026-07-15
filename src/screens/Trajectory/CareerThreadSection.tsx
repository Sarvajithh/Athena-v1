import { Briefcase } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import { SeverityDot } from '../../components/shared/SeverityDot';
import { Timeline } from '../../components/shared/Timeline';
import type { CareerThread } from '../../mock/types';
import styles from './CareerThreadSection.module.css';

interface CareerThreadSectionProps {
  threads: CareerThread[];
}

/**
 * Career/internship threads live here as one section, not a separate
 * screen (spec §5.2) — with real apply-by urgency rendered honestly,
 * never suppressed for calmness (spec §1.2). Uses the shared `Timeline`
 * visual language (spec §6, §5.2 — same language as Decision Log).
 */
export function CareerThreadSection({ threads }: CareerThreadSectionProps) {
  if (threads.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No open career threads this semester"
        description="Internship and research threads you're tracking will show up here."
      />
    );
  }

  return (
    <Timeline
      entries={threads.map((thread) => ({
        key: thread.id,
        node: <SeverityDot severity={thread.severity} showLabel={false} className={styles.node} />,
        content: (
          <Card className={styles.entry}>
            <div className={styles.text}>
              <span className={`${styles.role} type-body-medium`}>{thread.role}</span>
              <span className={`${styles.company} type-caption`}>
                {thread.company} · {thread.status}
              </span>
            </div>
            <div className={styles.meta}>
              <span className={`${styles.applyBy} type-caption`}>{thread.applyBy}</span>
            </div>
          </Card>
        ),
      }))}
    />
  );
}
