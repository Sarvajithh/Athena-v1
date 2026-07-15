/**
 * PLACEHOLDER DATA — Semester Setup screen.
 * The wizard step shell and phase strip render against this static
 * fixture; the field-level import/edit UI is out of scope this sprint
 * (SPRINT2_SPEC.md §5).
 */
import type { SemesterPhase, WizardStep } from './types';

export const mockWizardSteps: WizardStep[] = [
  { id: 'courses', label: 'Courses', status: 'complete' },
  { id: 'deadlines', label: 'Deadlines', status: 'complete' },
  { id: 'timetable', label: 'Timetable', status: 'current' },
  { id: 'deep-work', label: 'Deep-work window', status: 'upcoming' },
];

export const mockSemesterPhases: SemesterPhase[] = [
  { id: 'phase-1', label: 'Foundation weeks', dateRange: 'Aug 5 – Sep 1', current: false },
  { id: 'phase-2', label: 'Midterm block', dateRange: 'Sep 2 – Oct 6', current: false },
  { id: 'phase-3', label: 'Application season', dateRange: 'Oct 7 – Nov 10', current: true },
  { id: 'phase-4', label: 'Finals runway', dateRange: 'Nov 11 – Dec 12', current: false },
];

export const emptyWizardSteps: WizardStep[] = [];
