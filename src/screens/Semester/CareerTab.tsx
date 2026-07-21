import { useState } from 'react';
import { Briefcase } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { EmptyState } from '../../components/shared/EmptyState';
import { addDeadlinesToSemester, type DeadlineRow, type LeverageClass } from '../../ipc/bindings';
import styles from './Semester.module.css';

interface CareerTabProps {
  deadlines: DeadlineRow[];
  onAdded: () => void | Promise<void>;
}

type GoalKind = 'placement' | 'internship' | 'higher_studies' | 'other';

const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  placement: 'Placement',
  internship: 'Internship',
  higher_studies: 'Higher studies',
  other: 'Other',
};

function emptyForm() {
  return {
    kind: 'placement' as GoalKind,
    title: '',
    targetDate: '',
    notes: '',
  };
}

function applyByLabel(dueAt: string): string {
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (Number.isNaN(days)) return 'No target date';
  if (days < 0) return 'Past due';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/**
 * Career — long-term goal tracking (placements, internships, higher
 * studies), decoupled from the old five-step Semester Setup wizard.
 * Previously the only way a `category: 'career'` deadline could exist
 * was via that wizard's connector-pull step at onboarding time; this
 * tab lets a user add, and browse, career goals at any point in the
 * semester using the same `addDeadlinesToSemester` command
 * `PullDeadlinesPanel` already uses — no new backend command, no
 * change to `athena-domain`'s planner/repositories, just a second,
 * always-available entry point into the same `deadlines` table
 * (`category = 'career'`).
 */
export function CareerTab({ deadlines, onAdded }: CareerTabProps) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const careerGoals = deadlines
    .filter((d) => d.category === 'career')
    .slice()
    .sort((a, b) => a.due_at.localeCompare(b.due_at));

  const handleAdd = async () => {
    if (!form.title.trim() || !form.targetDate || saving) return;
    setSaving(true);
    setError(null);
    try {
      const leverageClass: LeverageClass = form.kind === 'other' ? 'medium' : 'high';
      await addDeadlinesToSemester([
        {
          course_id: null,
          title: `${GOAL_KIND_LABEL[form.kind]} — ${form.title.trim()}`,
          category: 'career',
          due_at: form.targetDate,
          leverage_class: leverageClass,
          notes: form.notes.trim() || null,
        },
      ]);
      setForm(emptyForm());
      await onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className={styles.card}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Add a career goal</h2>
        <div className={styles.form}>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className="type-caption">Type</span>
              <select
                className={styles.input}
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as GoalKind }))}
              >
                <option value="placement">Placement</option>
                <option value="internship">Internship</option>
                <option value="higher_studies">Higher studies</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className="type-caption">Target date</span>
              <input
                className={styles.input}
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className="type-caption">Title</span>
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g., Goldman Sachs SDE — application deadline"
            />
          </label>
          <label className={styles.field}>
            <span className="type-caption">Notes (optional)</span>
            <input
              className={styles.input}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g., referral from Priya, round 2 is a system design interview"
            />
          </label>
          {error && <p className={`${styles.error} type-caption`}>{error}</p>}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleAdd}
            disabled={!form.title.trim() || !form.targetDate || saving}
          >
            {saving ? 'Adding…' : 'Add goal'}
          </button>
        </div>
      </Card>

      <Card className={styles.card}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Career goals this semester</h2>
        {careerGoals.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No career goals yet"
            description="Add a placement, internship, or higher-studies goal above — it'll also show up on Deadlines and Trajectory."
          />
        ) : (
          <div className={styles.list}>
            {careerGoals.map((goal) => (
              <div key={goal.id} className={styles.row}>
                <div className={styles.rowMeta}>
                  <span className={`${styles.rowTitle} type-body`}>{goal.title}</span>
                  {goal.notes && <span className={`${styles.rowDetail} type-caption`}>{goal.notes}</span>}
                </div>
                <span className={`${styles.rowDetail} type-caption`}>{applyByLabel(goal.due_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
