// Frozen characterization reference. Never import at runtime from product code.
import type { WorkflowGearingResult } from '../../../../src/domain/tuning/types';
export type { WorkflowGearingResult } from '../../../../src/domain/tuning/types';
import type { TuningCarParams, MeasuredEngineInputs, GearingResult } from "../../utils/tuningMath";
import { calculateMeasuredGearing } from "../../utils/tuningMath";
import type { EvGearingResult } from "../../../../src/domain/tuning/ev/types";


/** Wizard adapter: legacy labels remain readable, but never affect calculations. */
export function calculateWizardMeasuredGearing(goal: string, gears: number, profile: TuningCarParams | null, engine: MeasuredEngineInputs | null,
  ev: EvGearingResult | null = null): WorkflowGearingResult | null {
  if (!profile) return null;
  if (profile.isElectric) return ev;
  const { tireType: _historicalLabel, ...observableProfile } = profile;
  return calculateMeasuredGearing(goal, gears, observableProfile, engine);
}
