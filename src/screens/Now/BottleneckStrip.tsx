import { AlertTriangle } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { Icon } from '../../components/shared/Icon';
import { SeverityDot } from '../../components/shared/SeverityDot';
import type { Bottleneck } from '../../mock/types';
import styles from './BottleneckStrip.module.css';

interface BottleneckStripProps {
  bottleneck: Bottleneck;
}

/** Secondary element below the verdict — the current bottleneck, if any (spec §5.2). */
export function BottleneckStrip({ bottleneck }: BottleneckStripProps) {
  return (
    <Card className={styles.strip}>
      <Icon icon={AlertTriangle} size="action" className={styles.icon} />
      <div className={styles.text}>
        <span className={`${styles.label} type-body-medium`}>{bottleneck.label}</span>
        <span className={`${styles.description} type-caption`}>{bottleneck.description}</span>
      </div>
      <SeverityDot severity={bottleneck.severity} className={styles.severity} />
    </Card>
  );
}
