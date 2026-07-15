import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { Icon } from '../../components/shared/Icon';
import type { WizardStep } from '../../mock/types';
import styles from './WizardStepShell.module.css';

interface WizardStepShellProps {
  steps: WizardStep[];
}

/**
 * Semester Setup's internal wizard steps — the one place with
 * sub-navigation this sprint; the shell only, not the field-level UI
 * (courses → deadlines → timetable → deep-work window, spec §5.2, §5).
 */
export function WizardStepShell({ steps }: WizardStepShellProps) {
  return (
    <nav className={styles.steps} aria-label="Semester setup steps">
      {steps.map((step, index) => (
        <Fragment key={step.id}>
          <span className={`${styles.step} type-caption`} data-status={step.status}>
            {step.status === 'complete' ? <Icon icon={Check} size="inline" /> : null}
            {step.label}
          </span>
          {index < steps.length - 1 ? <span className={styles.connector} aria-hidden="true" /> : null}
        </Fragment>
      ))}
    </nav>
  );
}
