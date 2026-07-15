import { ConfidenceBadge } from '../../components/shared/ConfidenceBadge';
import { NumberDisplay } from '../../components/shared/NumberDisplay';
import type { MetricSwimlane as MetricSwimlaneType, ZoomLevel } from '../../mock/types';
import styles from './MetricSwimlane.module.css';

interface MetricSwimlaneProps {
  metric: MetricSwimlaneType;
  zoom: ZoomLevel;
}

const CHART_WIDTH = 480;
const CHART_HEIGHT = 64;
const PADDING = 6;

function buildPath(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (CHART_WIDTH - PADDING * 2) / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = PADDING + index * stepX;
      const normalized = (value - min) / range;
      const y = CHART_HEIGHT - PADDING - normalized * (CHART_HEIGHT - PADDING * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function targetY(values: number[], target: number): number {
  const min = Math.min(...values, target);
  const max = Math.max(...values, target);
  const range = max - min || 1;
  const normalized = (target - min) / range;
  return CHART_HEIGHT - PADDING - normalized * (CHART_HEIGHT - PADDING * 2);
}

/** One trend swimlane against its target line, at the current zoom level (spec §5.2). */
export function MetricSwimlane({ metric, zoom }: MetricSwimlaneProps) {
  const points = metric.series[zoom];
  const values = points.map((point) => point.value);
  const path = buildPath(values);
  const yTarget = values.length > 0 ? targetY(values, metric.target) : CHART_HEIGHT / 2;

  return (
    <div className={styles.lane}>
      <div className={styles.meta}>
        <span className={`${styles.label} type-body-medium`}>{metric.label}</span>
        <NumberDisplay value={metric.current} unit={metric.unit} trend={metric.trend} />
        <ConfidenceBadge confidence={metric.confidence} />
      </div>
      <div className={styles.chartWrap}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${metric.label} trend, current ${metric.current}${metric.unit}, target ${metric.target}${metric.unit}`}
        >
          <line
            x1={PADDING}
            x2={CHART_WIDTH - PADDING}
            y1={yTarget}
            y2={yTarget}
            className={styles.targetLine}
          />
          <path d={path} className={styles.line} />
        </svg>
      </div>
    </div>
  );
}
