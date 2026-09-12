import { useSettings } from '../../../context/SettingsContext';
import type { WorkflowReadiness } from '../tuningWorkflow';

export function WorkflowGuide({ readiness, currentStep, openStep }: {
  readiness: WorkflowReadiness; currentStep: number; openStep: (step: number) => void;
}) {
  const { t } = useSettings();
  const target = !readiness.mechanical || !readiness.engineInputs ? 1 : !readiness.measuredEngine ? 3 : 4;
  const action = target === 1 ? 'Complete game-visible vehicle inputs' : target === 3 ? 'Measure or reuse engine data' : 'Confirm setup and record a run';
  return <div className="mt-2">
    {currentStep !== target && <button className="btn btn-sm btn-outline-primary" onClick={() => openStep(target)}>{t(action)}</button>}
    <details className="small text-body-secondary mt-2">
      <summary>{t('Why this order? What should I revisit?')}</summary>
      <p className="mt-2 mb-1">{t('These steps build an initial baseline. With the required inputs ready, you can revisit any available step before recording.')}</p>
      <ul className="mb-1">
        <li>{t('First confirm installed parts, tire compound and vehicle weight in Step 1. Baseline tire pressures, suspension and wheel alignment are calculated together in Step 2.')}</li>
        <li>{t('Gearing needs engine output data and driven tire dimensions. Recheck after powertrain or tire-size changes in Step 3.')}</li>
        <li>{t('Verify overall dynamic balance and lap times on your intended route in Step 4.')}</li>
      </ul>
    </details>
  </div>;
}
