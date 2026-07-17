import { GitBranch } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import { NumberDisplay } from '../../components/shared/NumberDisplay';
import type { ProjectStatusSnapshotDto } from '../../ipc/bindings';
import styles from './SnapshotCard.module.css';

interface ProjectStatusSectionProps {
  snapshots: ProjectStatusSnapshotDto[];
}

/**
 * Linked-repo activity, from `listProjectStatusSnapshots`
 * (07_INTEGRATIONS.md §1.3) — previously a dead binding, called
 * nowhere in the frontend despite `syncGithub`/`listLinkedGithubRepos`
 * already being wired in `ConnectorsStep.tsx`. Placed here rather than
 * as its own screen since `HealthStrip.tsx`'s Masters row already
 * signposts this exact gap ("portfolio strength not tracked yet") and
 * Trajectory is where every other real per-connector snapshot
 * (Codeforces, LeetCode) now renders. No `project_status_snapshots`
 * placement is spelled out in any doc comment this change could find —
 * flagged as an inference, not a confirmed spec position.
 */
export function ProjectStatusSection({ snapshots }: ProjectStatusSectionProps) {
  if (snapshots.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No linked repos tracked yet"
        description="Link a GitHub repo in Semester Setup's Connectors step to see recent activity here."
      />
    );
  }

  return (
    <div className={styles.card}>
      {snapshots.map((snapshot) => (
        <Card key={snapshot.repo_full_name} className={styles.card}>
          <span className={`${styles.label} type-body-medium`}>{snapshot.repo_full_name}</span>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <NumberDisplay value={snapshot.commit_count_30d} />
              <span className={`${styles.statLabel} type-caption`}>Commits (30d)</span>
            </div>
            <div className={styles.stat}>
              <NumberDisplay value={snapshot.open_pr_count} />
              <span className={`${styles.statLabel} type-caption`}>Open PRs</span>
            </div>
            <div className={styles.stat}>
              <NumberDisplay value={snapshot.open_issue_count} />
              <span className={`${styles.statLabel} type-caption`}>Open issues</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
