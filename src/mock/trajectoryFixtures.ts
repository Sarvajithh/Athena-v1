/**
 * PLACEHOLDER DATA — Trajectory screen.
 * Stands in for real time-series and career-thread data from the
 * domain layer via the future IPC chokepoint (SPRINT2_SPEC.md §0, §6).
 */
import type { CareerThread, MetricSwimlane } from './types';

const weekSeries = [
  { period: 'Mon', value: 7.2 },
  { period: 'Tue', value: 7.25 },
  { period: 'Wed', value: 7.24 },
  { period: 'Thu', value: 7.3 },
  { period: 'Fri', value: 7.28 },
  { period: 'Sat', value: 7.31 },
  { period: 'Sun', value: 7.34 },
];

const monthSeries = [
  { period: 'W1', value: 7.1 },
  { period: 'W2', value: 7.18 },
  { period: 'W3', value: 7.24 },
  { period: 'W4', value: 7.34 },
];

const semesterSeries = [
  { period: 'Aug', value: 6.9 },
  { period: 'Sep', value: 7.05 },
  { period: 'Oct', value: 7.18 },
  { period: 'Nov', value: 7.34 },
];

export const mockMetricSwimlanes: MetricSwimlane[] = [
  {
    id: 'cgpa',
    label: 'CGPA',
    unit: '',
    current: 7.34,
    target: 7.4,
    trend: 'up',
    confidence: 'confirmed',
    series: { week: weekSeries, month: monthSeries, semester: semesterSeries },
  },
  {
    id: 'dsa',
    label: 'Codeforces rating',
    unit: '',
    current: 1412,
    target: 1500,
    trend: 'flat',
    confidence: 'confirmed',
    series: {
      week: [
        { period: 'Mon', value: 1408 },
        { period: 'Tue', value: 1408 },
        { period: 'Wed', value: 1412 },
        { period: 'Thu', value: 1412 },
        { period: 'Fri', value: 1412 },
        { period: 'Sat', value: 1412 },
        { period: 'Sun', value: 1412 },
      ],
      month: [
        { period: 'W1', value: 1390 },
        { period: 'W2', value: 1401 },
        { period: 'W3', value: 1405 },
        { period: 'W4', value: 1412 },
      ],
      semester: [
        { period: 'Aug', value: 1320 },
        { period: 'Sep', value: 1355 },
        { period: 'Oct', value: 1390 },
        { period: 'Nov', value: 1412 },
      ],
    },
  },
  {
    id: 'research',
    label: 'Research hours logged',
    unit: 'hrs/wk',
    current: 3,
    target: 6,
    trend: 'down',
    confidence: 'inferred',
    series: {
      week: [
        { period: 'Mon', value: 1 },
        { period: 'Tue', value: 0 },
        { period: 'Wed', value: 1 },
        { period: 'Thu', value: 0 },
        { period: 'Fri', value: 1 },
        { period: 'Sat', value: 0 },
        { period: 'Sun', value: 0 },
      ],
      month: [
        { period: 'W1', value: 5 },
        { period: 'W2', value: 4 },
        { period: 'W3', value: 3.5 },
        { period: 'W4', value: 3 },
      ],
      semester: [
        { period: 'Aug', value: 6 },
        { period: 'Sep', value: 5 },
        { period: 'Oct', value: 4 },
        { period: 'Nov', value: 3 },
      ],
    },
  },
];

export const mockCareerThreads: CareerThread[] = [
  {
    id: 'thread-1',
    company: 'Two Sigma',
    role: 'Quant Research Intern',
    applyBy: 'Applications close in 2 days',
    severity: 'urgent',
    status: 'Not started',
  },
  {
    id: 'thread-2',
    company: 'Jane Street',
    role: 'Software Engineering Intern',
    applyBy: 'Applications close in 11 days',
    severity: 'flag',
    status: 'Draft in progress',
  },
  {
    id: 'thread-3',
    company: 'DeepMind',
    role: 'Research Assistant (Summer)',
    applyBy: 'Applications close in 26 days',
    severity: 'watch',
    status: 'Not started',
  },
];

export const emptyCareerThreads: CareerThread[] = [];
