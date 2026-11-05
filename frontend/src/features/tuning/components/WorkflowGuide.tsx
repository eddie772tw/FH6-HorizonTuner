import { useSettings } from '../../../context/SettingsContext';
import type { WorkflowReadiness } from '../tuningWorkflow';

export function WorkflowGuide({ readiness, currentStep, openStep, forwardBlocked = false, busy = false }: {
  readiness: WorkflowReadiness; currentStep: number; openStep: (step: number) => void; forwardBlocked?: boolean; busy?: boolean;
}) {
  const { t } = useSettings();
  const target = !readiness.mechanical || !readiness.engineInputs ? 1 : !readiness.gearingAvailable ? 3 : 4;
  const action = target === 1 ? 'Complete game-visible vehicle inputs' : target === 3 ? 'Measure or reuse engine data' : 'Confirm setup and record a run';
  if (currentStep === target) return null;
  return <div className="mt-2">
    <button className="btn btn-sm btn-outline-primary" disabled={busy || (forwardBlocked && target > 1)} aria-describedby="tuning-save-status tuning-target-status" onClick={() => openStep(target)}>{t(action)}</button>
  </div>;
}
