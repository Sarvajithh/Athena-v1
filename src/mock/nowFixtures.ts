/**
 * PLACEHOLDER DATA — Now screen.
 * This fixture stands in for the Priority Resolution engine's real
 * output, which will arrive via typed Tauri commands from the (separate,
 * out-of-scope) IPC chokepoint sprint (SPRINT2_SPEC.md §0, §6). Nothing
 * in this file is computed; it is static and hand-authored.
 */
import type { Bottleneck, DeepWorkAllocation, DriftBanner, LoadState, Verdict } from './types';

export const mockVerdict: Verdict = {
  headline: 'Finish the CS3231 problem set before anything else today.',
  reasoning:
    'It is due in 14 hours, worth 12% of your grade, and you have not started — every other open item has more slack.',
  confidence: 'confirmed',
};

export const mockBottleneck: Bottleneck = {
  label: 'DSA practice has stalled',
  description: 'No Codeforces submissions in 9 days, against a 3-day target cadence.',
  severity: 'flag',
};

export const mockDriftBanner: DriftBanner = {
  message: 'CGPA trend is 0.06 below your target pace for this point in the semester.',
  severity: 'watch',
};

export const mockLoadState: LoadState = {
  level: 'steady',
  label: 'Steady',
};

export const mockDeepWorkAllocation: DeepWorkAllocation = {
  windowLabel: "Tonight's deep-work window · 7:30–9:30 PM",
  blocks: [
    { id: 'dw-1', time: '7:30 PM', label: 'CS3231 problem set — proofs 2 & 3', minutes: 60 },
    { id: 'dw-2', time: '8:30 PM', label: 'Codeforces — two Div. 2 A/B problems', minutes: 45 },
    { id: 'dw-3', time: '9:15 PM', label: 'Review tomorrow\u2019s lecture slides', minutes: 15 },
  ],
};

/** Empty-state variant — used to demo §14's cold-start correctness. */
export const emptyDeepWorkAllocation: DeepWorkAllocation = {
  windowLabel: "Tonight's deep-work window",
  blocks: [],
};
