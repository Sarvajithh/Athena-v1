/**
 * Motion tokens — SPRINT2_SPEC.md §11.
 * "Slow physical motion, never bouncy/urgent-reading" (spec §5.1).
 * No spring/elastic easing anywhere in the system — this is the single
 * easing curve used for every transition in the app.
 */

export const EASE_STANDARD = 'cubic-bezier(0.4, 0.0, 0.2, 1)';

export const DURATION_FAST = 120; // hover states, focus rings
export const DURATION_STANDARD = 220; // screen transitions, list collapse/expand
export const DURATION_DELIBERATE = 360; // modal entrance/exit — the two named exceptions

export const DURATION_FAST_MS = `${DURATION_FAST}ms`;
export const DURATION_STANDARD_MS = `${DURATION_STANDARD}ms`;
export const DURATION_DELIBERATE_MS = `${DURATION_DELIBERATE}ms`;

/** Standard CSS transition shorthand, honoring reduced-motion (§16). */
export function transition(properties: string[], duration = DURATION_STANDARD): string {
  return properties.map((prop) => `${prop} ${duration}ms ${EASE_STANDARD}`).join(', ');
}

/** Duration to use for a given transition, collapsed to --duration-fast
 * when the OS requests reduced motion (§16). Read at call time so it
 * always reflects the live media query rather than a cached value. */
export function reducedMotionSafeDuration(preferred: number): number {
  if (typeof window === 'undefined') return preferred;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return prefersReduced ? DURATION_FAST : preferred;
}
