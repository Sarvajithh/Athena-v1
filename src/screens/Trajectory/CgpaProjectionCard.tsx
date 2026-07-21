import { GraduationCap } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import { NumberDisplay } from '../../components/shared/NumberDisplay';
import type { ProfileRow } from '../../ipc/bindings';
import type { ZoomLevel } from '../../mock/types';
import styles from './CgpaProjectionCard.module.css';

interface CgpaProjectionCardProps {
  profile: ProfileRow | null;
  /** Only affects the projection horizon copy ("this month" vs "this semester" vs "this year") — no time-series data exists yet to actually chart a trend line against. */
  zoom: ZoomLevel;
}

const ZOOM_HORIZON: Record<ZoomLevel, string> = {
  week: 'this week',
  month: 'this month',
  semester: 'by semester end',
};

/**
 * CGPA + target projection, built from `profile.current_cgpa` /
 * `profile.target_cgpa` (`03_ONBOARDING.md` §2 — collected at Profile
 * creation, previously never displayed anywhere after that screen).
 * There is no `grade_snapshots`/CGPA-history table yet, so this is
 * deliberately a current-value-vs-target reading, not a line chart —
 * same "don't fabricate a trend from one data point" rule
 * `MetricSwimlane`'s removal already established elsewhere in this
 * screen. The gap-to-target number is real arithmetic on real fields,
 * not a projection model.
 */
export function CgpaProjectionCard({ profile, zoom }: CgpaProjectionCardProps) {
  if (!profile) {
    return (
      <Card className={styles.card}>
        <EmptyState icon={GraduationCap} title="No profile yet" description="Complete onboarding to track CGPA." />
      </Card>
    );
  }

  const { current_cgpa, target_cgpa } = profile;
  const gap = current_cgpa != null ? Math.round((target_cgpa - current_cgpa) * 100) / 100 : null;

  return (
    <Card className={styles.card}>
      <h3 className={`${styles.title} type-caption`}>CGPA vs target</h3>
      <div className={styles.row}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Current</span>
          <NumberDisplay value={current_cgpa != null ? current_cgpa.toFixed(2) : '—'} />
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Target</span>
          <NumberDisplay value={target_cgpa.toFixed(2)} />
        </div>
      </div>
      {gap != null && (
        <p className={`${styles.gap} type-caption`} data-ahead={gap <= 0}>
          {gap <= 0
            ? `${Math.abs(gap).toFixed(2)} ahead of target`
            : `${gap.toFixed(2)} to close ${ZOOM_HORIZON[zoom]}`}
        </p>
      )}
      {current_cgpa == null && (
        <p className={`${styles.gap} type-caption`}>Log a current CGPA in Settings to see the gap to target.</p>
      )}
    </Card>
  );
}
