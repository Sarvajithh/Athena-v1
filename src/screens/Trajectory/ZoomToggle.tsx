import type { ZoomLevel } from '../../mock/types';
import styles from './ZoomToggle.module.css';

const OPTIONS: { id: ZoomLevel; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'semester', label: 'Semester' },
];

interface ZoomToggleProps {
  zoom: ZoomLevel;
  onChange: (zoom: ZoomLevel) => void;
}

/** Week / month / semester zoom levels for trend swimlanes (spec §5.2). */
export function ZoomToggle({ zoom, onChange }: ZoomToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label="Trend zoom level">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.option} type-caption`}
          data-active={zoom === option.id}
          aria-pressed={zoom === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
