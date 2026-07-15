/**
 * Presentation-layer types for the static mock fixtures this sprint
 * renders against (SPRINT2_SPEC.md §0, §6). These describe the *shape*
 * of data the real IPC layer will eventually supply — they carry no
 * computation and are not a substitute for the domain layer's own
 * types in `athena-domain` (MASTER_SPECIFICATION.md §4.4).
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
