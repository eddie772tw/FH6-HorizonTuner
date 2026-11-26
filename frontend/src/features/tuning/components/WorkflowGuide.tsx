import { useSettings } from '../../../context/SettingsContext';
import type { WorkflowReadiness } from '../tuningWorkflow';

export function WorkflowGuide({ readiness, currentStep, openStep, busy = false }: {
  readiness: WorkflowReadiness; currentStep: number; openStep: (step: number) => void; busy?: boolean;
}) {
  const { t } = useSettings();
  const target = !readiness.mechanical || !readiness.engineInputs ? 1 : !readiness.gearingAvailable ? 3 : 4;
  const action = target === 1 ? 'Complete game-visible vehicle inputs' : target === 3 ? 'Measure or reuse engine data' : 'Confirm setup and record a run';
  if (currentStep === target) return null;
  return <div className="mt-2">
    <button className="btn btn-sm btn-outline-primary" disabled={busy} aria-describedby="tuning-save-status" onClick={() => openStep(target)}>{t(action)}</button>
  </div>;
}
