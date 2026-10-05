// Frozen characterization reference. Never import at runtime from product code.
// Frozen pre-migration test reference; never a production fallback.
import type { TuningCarParams } from "../../utils/tuningMath";
import type { WorkflowReadiness } from "../../../../src/features/tuning/tuningWorkflow";
export function getWorkflowReadiness(profileReady: boolean,
  params: Pick<TuningCarParams, 'weight' | 'weight_distribution' | 'maxHp' | 'isElectric'> | null,
  measuredEngine: boolean, gearingAvailable = measuredEngine): WorkflowReadiness {
  const mechanical = Boolean(profileReady && params && Number.isFinite(params.weight) && params.weight > 0 &&
    Number.isFinite(params.weight_distribution) && params.weight_distribution > 0 && params.weight_distribution < 100);
  const engineInputs = mechanical && Boolean(params && (params.isElectric || (Number.isFinite(params.maxHp) && params.maxHp > 0)));
  return { mechanical, engineInputs, measuredEngine: engineInputs && measuredEngine,
    gearingAvailable: engineInputs && measuredEngine && gearingAvailable };
}
