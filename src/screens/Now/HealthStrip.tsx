import { Briefcase, BookOpen, GraduationCap } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { Icon } from '../../components/shared/Icon';
import type { DeadlineRow, ProfileRow } from '../../ipc/bindings';
import styles from './HealthStrip.module.css';

interface HealthStripProps {
  profile: ProfileRow;
  /** Real, open, `category: 'career'` deadlines — same read model Trajectory's Career Threads uses. */
  careerDeadlines: DeadlineRow[];
  onOpenTrajectory: () => void;
}

function daysUntil(dueAt: string): number | null {
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Number.isNaN(days) ? null : days;
}

/**
 * Section 4 — Health Strip: Semester · Career · Masters (05_OS_HOME.md
 * §7). Three compact, equal-weight teaser rows, each a direct derived-
 * query render — never LLM prose (per §7's own render-time contract).
 * Each row deep-links into Trajectory (the "compact-summary-that-links-
 * to-the-real-screen" pattern).
 *
 * Two of the three rows in the spec (Semester's `grade_snapshots`
 * trend; Masters' `project_status_snapshots.portfolio_strength_score`
 * / `research_activities`) have no persisted source anywhere in this
 * schema yet — no such tables exist. Per this same document's own
 * render-time contract ("rows may be empty → 'insufficient data' text
 * per row"), those two rows render an honest insufficient-data message
 * instead of a fabricated number. The Career row is fully real, backed
 * by `deadlines WHERE category = 'career' AND status = 'open'`.
 */
export function HealthStrip({ profile, careerDeadlines, onOpenTrajectory }: HealthStripProps) {
  const soonest = careerDeadlines[0];
  const soonestDays = soonest ? daysUntil(soonest.due_at) : null;

  return (
    <div className={styles.strip}>
      <Card interactive onClick={onOpenTrajectory} className={styles.row}>
        <Icon icon={BookOpen} size="action" className={styles.icon} />
        <span className={`${styles.label} type-body-medium`}>Semester</span>
        <span className={`${styles.value} type-caption`}>
          {profile.current_cgpa != null
            ? `CGPA ${profile.current_cgpa}, target ${profile.target_cgpa}`
            : 'No CGPA entered yet this semester'}
        </span>
      </Card>

      <Card interactive onClick={onOpenTrajectory} className={styles.row}>
        <Icon icon={Briefcase} size="action" className={styles.icon} />
        <span className={`${styles.label} type-body-medium`}>Career</span>
        <span className={`${styles.value} type-caption`}>
          {careerDeadlines.length === 0
            ? 'No open career threads this semester'
            : `${careerDeadlines.length} open ${careerDeadlines.length === 1 ? 'thread' : 'threads'}${
                soonestDays != null ? `, next apply-by in ${soonestDays} day${soonestDays === 1 ? '' : 's'}` : ''
              }`}
        </span>
      </Card>

      <Card interactive onClick={onOpenTrajectory} className={styles.row}>
        <Icon icon={GraduationCap} size="action" className={styles.icon} />
        <span className={`${styles.label} type-body-medium`}>Masters</span>
        <span className={`${styles.value} type-caption`}>
          {profile.masters_target
            ? `Target: ${profile.masters_target} — portfolio strength not tracked yet`
            : "No Master's target set"}
        </span>
      </Card>
    </div>
  );
}
