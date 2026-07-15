import { useDensity, type Density } from '../../state/densityContext';
import styles from './DensityToggle.module.css';

const OPTIONS: { id: Density; label: string }[] = [
  { id: 'calm', label: 'Calm' },
  { id: 'detail', label: 'Detail' },
];

/**
 * Pure UI state — no persistence, no domain logic (§18). Rendered in a
 * consistent top-right slot on every screen (§4).
 */
export function DensityToggle() {
  const { density, setDensity } = useDensity();
  return (
    <div className={styles.toggle} role="group" aria-label="Screen density">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.option} type-caption`}
          data-active={density === option.id}
          aria-pressed={density === option.id}
          onClick={() => setDensity(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
