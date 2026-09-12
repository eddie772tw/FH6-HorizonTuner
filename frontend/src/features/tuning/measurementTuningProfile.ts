import type { TuningCarParams, MeasuredEngineInputs, GearingResult } from '../../utils/tuningMath';
import { calculateMeasuredGearing } from '../../utils/tuningMath';

/** Wizard adapter: legacy labels remain readable, but never affect calculations. */
export function calculateWizardMeasuredGearing(goal: string, gears: number, profile: TuningCarParams | null, engine: MeasuredEngineInputs | null): GearingResult | null {
  if (!profile) return null;
  const { tireType: _historicalLabel, ...observableProfile } = profile;
  return calculateMeasuredGearing(goal, gears, observableProfile, engine);
}
