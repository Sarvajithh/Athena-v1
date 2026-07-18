import { useEffect, useState } from 'react';
import { getRoutineQuestionnaireTime, saveRoutineQuestionnaireTime } from '../../ipc/bindings';
import styles from './QuestionnaireScheduleSection.module.css';

/**
 * Configures what local time of day the scheduled daily-questionnaire
 * trigger (`routine_scheduler.rs`) fires — a system notification plus
 * the `daily-questionnaire-due` event that opens
 * `DailyQuestionnaireModal`. Deliberately its own file with its own
 * CSS module rather than a new block inside `Settings.module.css` /
 * `index.tsx`'s existing sections: a parallel task may be restructuring
 * Settings' layout/CSS at the same time, so this section is wired in
 * additively (see `index.tsx`) to minimize merge conflicts.
 */
export function QuestionnaireScheduleSection() {
  const [time, setTime] = useState('20:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRoutineQuestionnaireTime()
      .then((value) => {
        if (!cancelled) setTime(value);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async (nextTime: string) => {
    setTime(nextTime);
    setJustSaved(false);
    setError(null);
    setSaving(true);
    try {
      await saveRoutineQuestionnaireTime(nextTime);
      setJustSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={`${styles.sectionTitle} type-body-medium`}>Questionnaire schedule</h2>
      <p className={`${styles.sectionDescription} type-caption`}>
        Athena will show a notification and a quick prompt for the daily check-in at this time each day, unless
        you've already answered it. It never nags twice in one day.
      </p>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className="type-caption">Prompt time</span>
          <input
            type="time"
            className={styles.timeInput}
            value={time}
            disabled={loading || saving}
            onChange={(e) => void handleChange(e.target.value)}
          />
        </label>
      </div>

      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      {!error && justSaved && <p className={`${styles.status} type-caption`}>Saved.</p>}
    </section>
  );
}
