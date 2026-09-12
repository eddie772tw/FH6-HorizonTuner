import type { TuningCaptureSample } from '../../domain/tuning/telemetryCapture';

export interface TireEvidenceIdentity {
  carOrdinal: number;
  performanceIndex?: number;
  carClass?: number;
}

export interface TireEvidenceResult {
  status: 'observed' | 'unavailable';
  acceptedSampleCount: number;
  observedLongitudinalAccelerationMps2: number | null;
  maxObservedNormalizedSlip: number | null;
  observedTireTemperature: number[] | null;
  unavailableReasons: string[];
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const mean = (values: number[]) => values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
const missing = (sample: TuningCaptureSample, channel: string) => sample.missingChannels !== undefined
  && (!Array.isArray(sample.missingChannels) || sample.missingChannels.some((item) => typeof item !== 'string' || item === channel || item.startsWith(channel + '.')));
const completeWheels = (values: unknown): values is number[] => Array.isArray(values) && values.length === 4 && values.every(finite);

/**
 * Summarise only observable tyre evidence from a captured, straight-line run.
 * This deliberately does not estimate friction, compound, or maximum grip.
 */
export function observeTireEvidence(samples: TuningCaptureSample[], identity: TireEvidenceIdentity): TireEvidenceResult {
  const accepted: TuningCaptureSample[] = [];
  const reasons = new Set<string>();
  let previousTimestamp: number | undefined;
  let discontinuity = false;

  for (const sample of samples) {
    if (sample.carOrdinal !== identity.carOrdinal) { reasons.add('identity-mismatch'); continue; }
    if (identity.performanceIndex !== undefined && sample.performanceIndex !== identity.performanceIndex) { reasons.add('identity-mismatch'); continue; }
    if (identity.carClass !== undefined && sample.carClass !== identity.carClass) { reasons.add('identity-mismatch'); continue; }
    if (!finite(sample.timestampMS) || (previousTimestamp !== undefined && sample.timestampMS <= previousTimestamp)) { reasons.add('timestamp-invalid'); continue; }
    if (previousTimestamp !== undefined && sample.timestampMS - previousTimestamp > 250) { reasons.add('capture-discontinuous'); discontinuity = true; }
    previousTimestamp = sample.timestampMS;
    if (sample.isRaceOn !== 1 || !finite(sample.speedMps) || sample.speedMps <= 1 || !finite(sample.gear) || sample.gear < 1) { reasons.add('motion-or-gear-invalid'); continue; }
    if (!finite(sample.brakeInput) || sample.brakeInput !== 0 || !finite(sample.handBrakeInput) || sample.handBrakeInput !== 0) { reasons.add('brake-active'); continue; }
    const requiredScalars = ['AccelInput', 'BrakeInput', 'ClutchInput', 'HandBrakeInput', 'SteerInput', 'AccelerationX', 'AccelerationZ', 'Pitch', 'Roll'] as const;
    if (requiredScalars.some(channel => missing(sample, channel))) { reasons.add('required-scalar-unavailable'); continue; }
    if (!finite(sample.accelInput) || sample.accelInput <= 0 || !finite(sample.clutchInput) || sample.clutchInput !== 0) { reasons.add('throttle-or-clutch-invalid'); continue; }
    // Forza Data Out steer is a signed U8-derived count (-127..127), not a normalized float.
    if (!finite(sample.steerInput) || Math.abs(sample.steerInput) > 3 || !finite(sample.accelerationX) || Math.abs(sample.accelerationX) > 1.5) { reasons.add('not-straight'); continue; }
    if (![sample.pitch, sample.roll, sample.accelerationZ].every(finite) || Math.abs(sample.pitch!) > 0.15 || Math.abs(sample.roll!) > 0.15) { reasons.add('body-state-invalid'); continue; }
    if (missing(sample, 'TireSlipRatio') || !completeWheels(sample.tireSlipRatio)) reasons.add('slip-unavailable');
    if (missing(sample, 'TireTemp') || !completeWheels(sample.tireTemp)) reasons.add('temperature-unavailable');
    if (missing(sample, 'NormalizedSuspensionTravel') || !Array.isArray(sample.normalizedSuspensionTravel) || sample.normalizedSuspensionTravel.length !== 4 || !sample.normalizedSuspensionTravel.every(finite)
      || sample.normalizedSuspensionTravel.some((value) => value < 0.02 || value > 0.98)) { reasons.add('airborne-or-suspension-invalid'); continue; }
    accepted.push(sample);
  }

  const acceleration = mean(accepted.map((sample) => sample.accelerationZ).filter(finite));
  const slipComplete = accepted.length > 0 && accepted.every((sample) => !missing(sample, 'TireSlipRatio') && completeWheels(sample.tireSlipRatio));
  const maxSlip = slipComplete ? accepted.reduce((maximum, sample) => sample.tireSlipRatio.reduce((inner, value) => finite(value) ? Math.max(inner, Math.abs(value)) : inner, maximum), 0) : null;
  const temperatureValues = accepted.flatMap((sample) => Array.isArray(sample.tireTemp) ? sample.tireTemp.slice(0, 4) : []).filter(finite);
  const temperatureComplete = accepted.length > 0 && accepted.every((sample) => !missing(sample, 'TireTemp') && completeWheels(sample.tireTemp));
  const observedTemperature = temperatureComplete && temperatureValues.length === accepted.length * 4
    ? [0, 1, 2, 3].map((wheel) => mean(accepted.map((sample) => sample.tireTemp[wheel]).filter(finite))!)
    : null;
  const result: TireEvidenceResult = {
    status: accepted.length > 0 && !discontinuity ? 'observed' : 'unavailable',
    acceptedSampleCount: accepted.length,
    observedLongitudinalAccelerationMps2: discontinuity ? null : acceleration,
    maxObservedNormalizedSlip: discontinuity ? null : maxSlip,
    observedTireTemperature: discontinuity ? null : observedTemperature,
    unavailableReasons: [...reasons],
  };
  if (result.observedLongitudinalAccelerationMps2 === null) result.unavailableReasons.push('acceleration-unavailable');
  if (result.maxObservedNormalizedSlip === null) result.unavailableReasons.push('slip-unavailable');
  return result;
}
