import { useState } from 'react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
import {
  emptyCareerThreads,
  mockCareerThreads,
  mockMetricSwimlanes,
} from '../../mock/trajectoryFixtures';
import type { ZoomLevel } from '../../mock/types';
import { CareerThreadSection } from './CareerThreadSection';
import { MetricSwimlane } from './MetricSwimlane';
import styles from './Trajectory.module.css';
import { ZoomToggle } from './ZoomToggle';

/**
 * Trajectory — CGPA/DSA/project trends against target lines at three
 * zoom levels, plus career threads as one section (spec §5.2). Static
 * mock fixtures only this sprint (SPRINT2_SPEC.md §0).
 */
export default function Trajectory() {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [showEmptyThreads, setShowEmptyThreads] = useState(false);

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Trajectory</p>
        <div className={styles.headerControls}>
          <ZoomToggle zoom={zoom} onChange={setZoom} />
          <DensityToggle />
        </div>
      </div>

      <Card>
        <div className={styles.metricList}>
          {mockMetricSwimlanes.map((metric) => (
            <MetricSwimlane key={metric.id} metric={metric} zoom={zoom} />
          ))}
        </div>
      </Card>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} type-body-medium`}>Career threads</h2>
        <CareerThreadSection threads={showEmptyThreads ? emptyCareerThreads : mockCareerThreads} />
      </section>

      {import.meta.env.DEV ? (
        <button type="button" className={styles.devToggle} onClick={() => setShowEmptyThreads((v) => !v)}>
          Dev: toggle career threads empty state
        </button>
      ) : null}
    </div>
  );
}
