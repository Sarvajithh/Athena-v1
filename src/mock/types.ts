/**
 * Shared presentation-layer types (originally written in Sprint 2 to
 * describe the shape of static mock fixtures; those fixtures are gone
 * as of the onboarding feature — see `ipc/bindings.ts` for the real,
 * IPC-backed types). What remains here is genuinely reusable UI-layer
 * vocabulary (severity/confidence/trend labels, wizard-step status,
 * etc.) still consumed by real components. These carry no computation
 * and are not a substitute for the domain layer's own types in
 * `athena-domain` (MASTER_SPECIFICATION.md §4.4). A few types below
 * (`Bottleneck`, `DriftBanner`, `LoadState`, `CareerThread`,
 * `MetricSwimlane`, `DecisionEntry`) are currently unused — the
 * features they described (bottleneck/drift detection, trend
 * swimlanes) don't have a real data source yet and are intentionally
 * not faked; they're left in place for whichever future sprint adds
 * that data source.
 */

export type Severity = 'watch' | 'flag' | 'urgent';

export type Confidence = 'confirmed' | 'inferred' | 'insufficient_data';

export type Trend = 'up' | 'down' | 'flat';

export interface Verdict {
  headline: string;
  reasoning: string;
  confidence: Confidence;
}

export interface Bottleneck {
  label: string;
  description: string;
  severity: Severity;
}

export interface DriftBanner {
  message: string;
  severity: Severity;
}

export interface DeepWorkBlock {
  id: string;
  time: string;
  label: string;
  minutes: number;
}

export interface DeepWorkAllocation {
  windowLabel: string;
  blocks: DeepWorkBlock[];
}

export interface LoadState {
  level: 'light' | 'steady' | 'full';
  label: string;
}

export interface MetricPoint {
  period: string;
  value: number;
}

export type ZoomLevel = 'week' | 'month' | 'semester';

export interface MetricSwimlane {
  id: string;
  label: string;
  unit: string;
  current: number;
  target: number;
  trend: Trend;
  confidence: Confidence;
  series: Record<ZoomLevel, MetricPoint[]>;
}

export interface CareerThread {
  id: string;
  company: string;
  role: string;
  applyBy: string;
  severity: Severity;
  status: string;
}

export type WizardStepStatus = 'complete' | 'current' | 'upcoming';

export interface WizardStep {
  id: string;
  label: string;
  status: WizardStepStatus;
}

export interface SemesterPhase {
  id: string;
  label: string;
  dateRange: string;
  current: boolean;
}

export type DecisionType = 'recommendation' | 'challenge' | 'override';

export interface DecisionEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  type: DecisionType;
  confidence: Confidence;
  resolution: string;
}
