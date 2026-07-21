import { useEffect, useState } from 'react';
import { ClipboardList, Send } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { Icon } from '../../components/shared/Icon';
import {
  extractDailyRoutineAnswers,
  generateDailyRoutineQuestions,
  hasDailyRoutineResponse,
  hasWeeklyRoutineResponse,
  submitDailyRoutineResponse,
  submitWeeklyRoutineResponse,
  type CourseRow,
} from '../../ipc/bindings';
import styles from './RoutineQuestionnaireCard.module.css';

/** `YYYY-MM-DD` for the user's local calendar day, same convention as
 * `AdaptivePlannerCard`'s `logDisruption` call. */
function localDateToday(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** `YYYY-MM-DD` for the Monday of the current local week — the weekly
 * questionnaire's cadence key. */
function localWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  return monday.toLocaleDateString('en-CA');
}

interface RoutineQuestionnaireCardProps {
  semesterActive: boolean;
  courses: CourseRow[];
}

/**
 * Prompts the daily and/or weekly routine questionnaire when due, and
 * offers no prompt at all once both are already answered for their
 * current cadence — checked against `has_daily_routine_response` /
 * `has_weekly_routine_response` on mount so this never nags (Task 2's
 * "check an already-answered-today state before showing it").
 *
 * A manual "answer now" trigger also exists in Settings for anyone who
 * dismissed this card and wants to answer anyway.
 */
export function RoutineQuestionnaireCard({ semesterActive, courses }: RoutineQuestionnaireCardProps) {
  const [dailyDue, setDailyDue] = useState(false);
  const [weeklyDue, setWeeklyDue] = useState(false);
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<'daily' | 'weekly' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = localDateToday();
    const weekStart = localWeekStart();
    Promise.all([hasDailyRoutineResponse(today), hasWeeklyRoutineResponse(weekStart)])
      .then(([dailyAnswered, weeklyAnswered]) => {
        if (cancelled) return;
        setDailyDue(!dailyAnswered);
        setWeeklyDue(!weeklyAnswered);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || !semesterActive || (!dailyDue && !weeklyDue)) {
    return null;
  }

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLabel}>
          <Icon icon={ClipboardList} size="action" />
          <span className="type-body-medium">Quick check-in</span>
        </div>
      </div>

      {mode === null ? (
        <div className={styles.form}>
          <p className="type-caption">
            {dailyDue && weeklyDue
              ? "You haven't answered today's check-in or this week's review yet."
              : dailyDue
                ? "You haven't answered today's check-in yet."
                : "You haven't answered this week's review yet."}
          </p>
          <div className={styles.header}>
            {dailyDue && (
              <button type="button" className={styles.toggleButton} onClick={() => setMode('daily')}>
                Answer today's check-in
              </button>
            )}
            {weeklyDue && (
              <button type="button" className={styles.toggleButton} onClick={() => setMode('weekly')}>
                Answer this week's review
              </button>
            )}
          </div>
        </div>
      ) : mode === 'daily' ? (
        <DailyConversationForm
          courses={courses}
          onDone={() => {
            setDailyDue(false);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      ) : (
        <WeeklyForm
          courses={courses}
          onDone={() => {
            setWeeklyDue(false);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
    </Card>
  );
}

/**
 * Daily check-in as an AI conversation (replaces the old numeric-slider
 * form). Gemini (or whichever provider is configured —
 * `generateDailyRoutineQuestions` degrades gracefully) phrases 3-5
 * contextual questions; the user answers each in free text; once every
 * question is answered, the full transcript is sent to
 * `extractDailyRoutineAnswers`, which returns the same fields the old
 * form collected with sliders. Those fields are then passed to the
 * existing, unmodified `submitDailyRoutineResponse` — the Adaptive
 * Planner never sees a new shape, only `SubmitDailyRoutineInput`
 * arriving from a conversation instead of a form.
 */
export function DailyConversationForm({
  courses,
  onDone,
  onCancel,
}: {
  courses: CourseRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const contextSummary =
      courses.length > 0
        ? `Enrolled in ${courses.length} course(s) this semester, including ${courses
            .slice(0, 3)
            .map((c) => c.code)
            .join(', ')}.`
        : 'No courses added yet this semester.';
    generateDailyRoutineQuestions(contextSummary)
      .then((qs) => {
        if (!cancelled) setQuestions(qs);
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingQuestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courses]);

  const currentIndex = answers.length;
  const currentQuestion = questions?.[currentIndex] ?? null;
  const isLastQuestion = questions != null && currentIndex === questions.length - 1;

  const handleSend = async () => {
    if (!draft.trim() || !currentQuestion) return;
    const nextAnswers = [...answers, draft.trim()];
    setAnswers(nextAnswers);
    setDraft('');

    if (!isLastQuestion) return;

    // Every question answered — extract the structured fields and submit.
    setExtracting(true);
    setError(null);
    try {
      const transcript = (questions ?? [])
        .map((q, i) => `Q: ${q}\nA: ${nextAnswers[i] ?? ''}`)
        .join('\n\n');
      const extraction = await extractDailyRoutineAnswers(transcript);
      await submitDailyRoutineResponse({
        date: localDateToday(),
        energy_level: extraction.energy_level,
        hours_available_tonight: extraction.hours_available_tonight,
        had_disruption_today: extraction.had_disruption_today,
        disruption_note: extraction.disruption_note,
        focus_rating: extraction.focus_rating,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  };

  if (loadingQuestions) {
    return <p className={`${styles.error} type-caption`}>Thinking of a few questions…</p>;
  }

  if (!questions || questions.length === 0) {
    return <p className={`${styles.error} type-caption`}>Couldn't load today's check-in — try again shortly.</p>;
  }

  return (
    <div className={styles.conversation}>
      {answers.map((answer, i) => (
        <div key={i} className={styles.exchange}>
          <p className={`${styles.athenaBubble} type-caption`}>{questions[i]}</p>
          <p className={`${styles.userBubble} type-body`}>{answer}</p>
        </div>
      ))}

      {currentQuestion && !extracting && (
        <div className={styles.exchange}>
          <p className={`${styles.athenaBubble} type-caption`}>{currentQuestion}</p>
          <div className={styles.composer}>
            <input
              type="text"
              className={styles.textInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSend();
              }}
              placeholder="Type your answer…"
              autoFocus
            />
            <button type="button" className={styles.sendButton} onClick={() => void handleSend()} aria-label="Send">
              <Icon icon={Send} size="inline" />
            </button>
          </div>
        </div>
      )}

      {extracting && <p className={`${styles.error} type-caption`}>Saving your check-in…</p>}
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}

      <div className={styles.header}>
        <button type="button" className={styles.toggleButton} onClick={onCancel} disabled={extracting}>
          Not now
        </button>
      </div>
    </div>
  );
}

export function WeeklyForm({
  courses,
  onDone,
  onCancel,
}: {
  courses: CourseRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [energyTrend, setEnergyTrend] = useState(3);
  const [satisfaction, setSatisfaction] = useState(3);
  const [hardestCourseId, setHardestCourseId] = useState<string>('');
  const [biggestBlocker, setBiggestBlocker] = useState('');
  const [hoursStudied, setHoursStudied] = useState<string>('');
  const [wantsAdjustment, setWantsAdjustment] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitWeeklyRoutineResponse({
        week_starting: localWeekStart(),
        overall_energy_trend: energyTrend,
        satisfaction_with_progress: satisfaction,
        hardest_course_id: hardestCourseId ? Number.parseInt(hardestCourseId, 10) : null,
        biggest_blocker: biggestBlocker.trim() ? biggestBlocker.trim() : null,
        hours_studied_estimate: hoursStudied.trim() ? Number.parseFloat(hoursStudied) : null,
        wants_deep_work_adjustment: wantsAdjustment,
        notes: notes.trim() ? notes.trim() : null,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className="type-caption">Overall energy trend this week (1 low – 5 high)</span>
        <input
          type="number"
          min={1}
          max={5}
          className={styles.numberInput}
          value={energyTrend}
          onChange={(e) => setEnergyTrend(Number(e.target.value))}
          disabled={submitting}
        />
      </label>
      <label className={styles.field}>
        <span className="type-caption">Satisfaction with your progress (1 low – 5 high)</span>
        <input
          type="number"
          min={1}
          max={5}
          className={styles.numberInput}
          value={satisfaction}
          onChange={(e) => setSatisfaction(Number(e.target.value))}
          disabled={submitting}
        />
      </label>
      <label className={styles.field}>
        <span className="type-caption">Hardest course this week (optional)</span>
        <select
          className={styles.select}
          value={hardestCourseId}
          onChange={(e) => setHardestCourseId(e.target.value)}
          disabled={submitting}
        >
          <option value="">None in particular</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className="type-caption">Biggest blocker this week (optional)</span>
        <input
          type="text"
          className={styles.textInput}
          value={biggestBlocker}
          onChange={(e) => setBiggestBlocker(e.target.value)}
          disabled={submitting}
        />
      </label>
      <label className={styles.field}>
        <span className="type-caption">Roughly how many hours did you study? (optional)</span>
        <input
          type="number"
          min={0}
          step={0.5}
          className={styles.numberInput}
          value={hoursStudied}
          onChange={(e) => setHoursStudied(e.target.value)}
          disabled={submitting}
        />
      </label>
      <label className={styles.field}>
        <span className="type-caption">
          <input
            type="checkbox"
            checked={wantsAdjustment}
            onChange={(e) => setWantsAdjustment(e.target.checked)}
            disabled={submitting}
          />{' '}
          I'd like to adjust my deep-work window
        </span>
      </label>
      <label className={styles.field}>
        <span className="type-caption">Anything else (optional)</span>
        <input
          type="text"
          className={styles.textInput}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
        />
      </label>
      {error && <p className={`${styles.error} type-caption`}>{error}</p>}
      <div className={styles.header}>
        <button type="button" className={styles.submitButton} onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save review'}
        </button>
        <button type="button" className={styles.toggleButton} onClick={onCancel} disabled={submitting}>
          Not now
        </button>
      </div>
    </div>
  );
}
