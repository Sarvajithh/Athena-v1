import { useState } from 'react';
import { Card } from '../../components/shared/Card';
import { seedSampleData } from '../../ipc/bindings';
import styles from './Semester.module.css';

interface AdvancedTabProps {
  onSeeded: () => void | Promise<void>;
}

/**
 * Semester → Advanced. Dev/demo convenience, not part of any
 * user-facing onboarding flow — "Seed sample data" calls
 * `seed_sample_data` (`commands::onboarding::seed_sample_data`), which
 * inserts one sample semester, courses, deadlines, and disruptions
 * through the same repositories every other Semester action already
 * uses. Exists so the Adaptive Planner and Priority Resolution can be
 * exercised end-to-end without hand-filling a semester first.
 */
export function AdvancedTab({ onSeeded }: AdvancedTabProps) {
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededAt, setSeededAt] = useState<string | null>(null);

  const handleSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    setError(null);
    try {
      await seedSampleData();
      setSeededAt(new Date().toLocaleTimeString());
      await onSeeded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Card className={styles.card}>
      <h2 className={`${styles.sectionTitle} type-body-medium`}>Seed sample data</h2>
      <p className={`${styles.hint} type-caption`}>
        Inserts a sample semester with courses, deadlines (academic, career, DSA, research), and a
        couple of schedule disruptions, so you can try Now, Deadlines, Trajectory, and the planner
        immediately. This replaces whatever semester is currently active — it won't merge with real
        data.
      </p>
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      {seededAt && !error && (
        <p className={`${styles.hint} type-caption`}>Seeded a sample semester at {seededAt}.</p>
      )}
      <button type="button" className={styles.primaryButton} onClick={handleSeed} disabled={seeding}>
        {seeding ? 'Seeding…' : 'Seed sample data'}
      </button>
    </Card>
  );
}
