import type { DeadlineCategory, LeverageClass } from '../../ipc/bindings';

export interface CourseRowState {
  code: string;
  title: string;
  credits: string;
  leverageClass: LeverageClass;
  instructor: string;
  targetGrade: string;
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
  return { code: '', title: '', credits: '4', leverageClass: 'medium', instructor: '', targetGrade: '' };
}

export function newDeadlineRow(): DeadlineRowState {
  return { title: '', category: 'academic', dueAt: '', leverageClass: 'medium', notes: '', courseIndex: '' };
}

export const LEVERAGE_OPTIONS: LeverageClass[] = ['high', 'medium', 'low'];
export const CATEGORY_OPTIONS: DeadlineCategory[] = ['academic', 'career', 'research', 'dsa', 'other'];
