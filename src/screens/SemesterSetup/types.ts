import type { DeadlineCategory, LeverageClass } from '../../ipc/bindings';

export interface GradingComponentState {
  category: string;
  weight: string; // kept as string while editing, same pattern as `credits`
}

export interface CourseRowState {
  code: string;
  title: string;
  credits: string;
  leverageClass: LeverageClass;
  instructor: string;
  targetGrade: string;
  notes: string;
  syllabusFilename: string; // display only — the extracted text lives in syllabusText
  syllabusText: string;
  gradingBreakdown: GradingComponentState[];
  detailsOpen: boolean; // whether the expanded "Add details" section is showing
}

export interface DeadlineRowState {
  title: string;
  category: DeadlineCategory;
  dueAt: string;
  leverageClass: LeverageClass;
  notes: string;
  courseIndex: string; // '' = none, otherwise an index into the courses array as a string
}

export function newCourseRow(): CourseRowState {
  return {
    code: '',
    title: '',
    credits: '4',
    leverageClass: 'medium',
    instructor: '',
    targetGrade: '',
    notes: '',
    syllabusFilename: '',
    syllabusText: '',
    gradingBreakdown: [],
    detailsOpen: false,
  };
}

/** Rows the person has actually started filling in — a category
 * typed, a weight typed, or both. An "Add grading component" click
 * that's left untouched (both blank) shouldn't count toward the sum or
 * block anything; it's not a real entry yet. */
function startedGradingRows(row: CourseRowState): GradingComponentState[] {
  return row.gradingBreakdown.filter((g) => g.category.trim() || g.weight.trim());
}

/** Sum of a row's grading weights — used to gate commit, same "the UI
 * is the only writer/validator of grading_breakdown" reasoning as the
 * V12 migration's comment. Only counts rows the person has actually
 * started (see `startedGradingRows`) — an untouched blank row shouldn't
 * silently drag the sum down and trap someone on this step with no
 * visible cause if they've collapsed that course's details.
 */
export function gradingWeightSum(row: CourseRowState): number {
  return startedGradingRows(row).reduce((sum, g) => sum + (Number.parseInt(g.weight, 10) || 0), 0);
}

/** A row's grading breakdown is valid if nothing's been started yet
 * (fine — it's optional) or every started row sums to exactly 100. */
export function gradingBreakdownValid(row: CourseRowState): boolean {
  const started = startedGradingRows(row);
  return started.length === 0 || gradingWeightSum(row) === 100;
}

export function newDeadlineRow(): DeadlineRowState {
  return { title: '', category: 'academic', dueAt: '', leverageClass: 'medium', notes: '', courseIndex: '' };
}

export const LEVERAGE_OPTIONS: LeverageClass[] = ['high', 'medium', 'low'];
export const CATEGORY_OPTIONS: DeadlineCategory[] = ['academic', 'career', 'research', 'dsa', 'other'];
