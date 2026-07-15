/**
 * PLACEHOLDER DATA — Decision Log screen.
 * Stands in for the historical record of recommendations, challenges,
 * and overrides once persisted by the real domain/data layers
 * (SPRINT2_SPEC.md §0, §6).
 */
import type { DecisionEntry } from './types';

export const mockDecisionLog: DecisionEntry[] = [
  {
    id: 'dec-1',
    date: 'Today, 8:02 AM',
    title: 'Prioritized CS3231 problem set over Codeforces practice',
    summary: 'Deadline pressure outweighed cadence drift by a wide margin.',
    type: 'recommendation',
    confidence: 'confirmed',
    resolution: 'Accepted',
  },
  {
    id: 'dec-2',
    date: 'Yesterday, 9:41 PM',
    title: 'Challenged a skipped deep-work block',
    summary: 'Second consecutive skip of the 7:30 PM window triggered a Decision Challenge.',
    type: 'challenge',
    confidence: 'confirmed',
    resolution: 'User confirmed skip — logged as intentional',
  },
  {
    id: 'dec-3',
    date: 'Tue, 6:15 PM',
    title: 'Flagged Two Sigma application deadline',
    summary: 'Surfaced 3 days ahead of close based on inferred application-cycle length.',
    type: 'recommendation',
    confidence: 'inferred',
    resolution: 'Acknowledged',
  },
  {
    id: 'dec-4',
    date: 'Mon, 10:30 AM',
    title: 'Overrode research-hours bottleneck suggestion',
    summary: 'User marked the current low cadence as intentional given midterm load.',
    type: 'override',
    confidence: 'confirmed',
    resolution: 'Override recorded',
  },
  {
    id: 'dec-5',
    date: 'Sun, 7:00 PM',
    title: 'Recommended lighter Sunday load',
    summary: 'Week-over-week load signal suggested a recovery day before midterms.',
    type: 'recommendation',
    confidence: 'inferred',
    resolution: 'Accepted',
  },
  {
    id: 'dec-6',
    date: 'Sat, 11:12 AM',
    title: 'Challenged a same-day deadline reprioritization',
    summary: 'Reordering conflicted with a fixed timetable commitment.',
    type: 'challenge',
    confidence: 'confirmed',
    resolution: 'User adjusted timetable entry',
  },
  {
    id: 'dec-7',
    date: 'Fri, 8:45 AM',
    title: 'Recommended starting the Two Sigma application draft',
    summary: 'Nine days of slack remained, closer than any other open deadline at the time.',
    type: 'recommendation',
    confidence: 'confirmed',
    resolution: 'Accepted',
  },
  {
    id: 'dec-8',
    date: 'Thu, 6:50 PM',
    title: 'Flagged a Codeforces cadence drift',
    summary: 'Three days without a submission crossed the 3-day watch threshold.',
    type: 'recommendation',
    confidence: 'inferred',
    resolution: 'Acknowledged',
  },
];

export const emptyDecisionLog: DecisionEntry[] = [];
