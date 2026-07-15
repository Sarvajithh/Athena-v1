import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Card } from '../../components/shared/Card';
import { DensityToggle } from '../../components/shared/DensityToggle';
import { EmptyState } from '../../components/shared/EmptyState';
import { emptyWizardSteps, mockSemesterPhases, mockWizardSteps } from '../../mock/semesterFixtures';
import { PhaseStrip } from './PhaseStrip';
import styles from './SemesterSetup.module.css';
import { WizardStepShell } from './WizardStepShell';

/**
 * Semester Setup — the re-derivation wizard run at the start of each
 * term (spec §5.2). This sprint ships the wizard-step shell and the
 * completed-setup phase strip only; field-level import/edit UI (CSV/ICS
 * import, timetable entry) is out of scope (SPRINT2_SPEC.md §5).
 */
export default function SemesterSetup() {
  const [showEmpty, setShowEmpty] = useState(false);
  const steps = showEmpty ? emptyWizardSteps : mockWizardSteps;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <p className={`${styles.eyebrow} type-caption`}>Semester Setup</p>
        <DensityToggle />
      </div>

      {steps.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No semester configured yet"
          description="Run setup to import courses, deadlines, your timetable, and a deep-work window."
        />
      ) : (
        <>
          <WizardStepShell steps={steps} />
          <Card className={styles.placeholderCard}>
            <p className="type-body">
              Field-level setup (course import, deadline CSV/ICS import, timetable entry) is a follow-on
              deliverable — this sprint ships the navigable step shell only.
            </p>
          </Card>
          <section>
            <h2 className={`${styles.sectionTitle} type-body-medium`}>This semester at a glance</h2>
            <PhaseStrip phases={mockSemesterPhases} />
          </section>
        </>
      )}

      {import.meta.env.DEV ? (
        <button type="button" className={styles.devToggle} onClick={() => setShowEmpty((v) => !v)}>
          Dev: toggle empty state
        </button>
      ) : null}
    </div>
  );
}
