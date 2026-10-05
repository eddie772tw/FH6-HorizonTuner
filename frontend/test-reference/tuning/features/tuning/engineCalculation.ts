// Frozen characterization reference. Never import at runtime from product code.
import type { EngineCalculationSummary } from '../../../../src/domain/tuning/types';
export type { EngineCalculationSummary } from '../../../../src/domain/tuning/types';
import type { TuningCaptureFile, TuningCaptureSample } from "../../../../src/domain/tuning/telemetryCapture";
import {
  advanceTuningMeasurement, createEngineCalculation, ENGINE_ANALYSIS_VERSION,
  getTuningMeasurementReadiness, qualifiedEnginePeaks, retainReadyMeasurementSnapshot,
  type EngineMeasurementFrame, type TuningMeasurementGuidance, type TuningMeasurementPeak, type TuningMeasurementState,
} from "./tuningMeasurement";



export function engineCalculationSummary(state: TuningMeasurementState | null, observationId: string): EngineCalculationSummary {
  const base = { analysisVersion: ENGINE_ANALYSIS_VERSION, observationId };
  if (!state || state.analysisVersion !== ENGINE_ANALYSIS_VERSION) {
    return { ...base, status: 'unavailable', reason: 'capture-unavailable', acceptedMs: 0 };
  }
  const readiness = getTuningMeasurementReadiness(state, state.lastProgressedAtMs ?? 0);
  const peaks = qualifiedEnginePeaks(state.rpmEvidenceBins ?? []);
  return { ...base, status: readiness.ready ? 'ready' : 'collecting', reason: readiness.guidance,
    acceptedMs: state.acceptedMs, engineMaxRpm: state.engineMaxRpm, effectiveRedline: state.effectiveRedline,
    peakPower: peaks.power, peakTorque: peaks.torque };
}

/** Preserve missing-channel evidence instead of turning capture fallback zeroes into observations. */
export function captureToEngineFrame(sample: TuningCaptureSample): EngineMeasurementFrame {
  const value = (key: string, n: number | null | undefined) =>
    sample.missingChannels?.includes(key) || typeof n !== 'number' ? NaN : n;
  return {
    TimestampMS: value('TimestampMS', sample.timestampMS), IsRaceOn: value('IsRaceOn', sample.isRaceOn),
    CarOrdinal: value('CarOrdinal', sample.carOrdinal), CarClass: value('CarClass', sample.carClass),
    CarPerformanceIndex: value('CarPerformanceIndex', sample.performanceIndex),
    EngineMaxRpm: value('EngineMaxRpm', sample.engineMaxRpm), CurrentEngineRpm: value('CurrentEngineRpm', sample.rpm),
    SpeedMetersPerSecond: value('SpeedMetersPerSecond', sample.speedMps), Gear: value('Gear', sample.gear),
    PowerWatts: value('PowerWatts', sample.powerWatts), TorqueNewtons: value('TorqueNewtons', sample.torqueNewtons),
    AccelInput: value('AccelInput', sample.accelInput), BrakeInput: value('BrakeInput', sample.brakeInput),
    ClutchInput: value('ClutchInput', sample.clutchInput), HandBrakeInput: value('HandBrakeInput', sample.handBrakeInput),
    TireSlipRatio: sample.tireSlipRatio,
  };
}

/** Same incremental reducer as live collection. Never rewrites an archived observation. */
export function analyzeEngineCapture(observationId: string, carId: string, capture?: TuningCaptureFile | null,
  expected?: TuningMeasurementState): EngineCalculationSummary {
  if (!capture?.samples.length || capture.samples.length > 30000) return engineCalculationSummary(null, observationId);
  let state = createEngineCalculation(carId);
  let ready: TuningMeasurementState | undefined;
  for (const sample of capture.samples) {
    const frame = captureToEngineFrame(sample);
    state = advanceTuningMeasurement(state, frame, true, frame.TimestampMS);
    if (['car-mismatch', 'identity-incomplete'].includes(state.guidance)) ready = undefined;
    else ready = retainReadyMeasurementSnapshot(ready, state, frame.TimestampMS);
  }
  const result = ready ?? state;
  if (expected && (result.identity?.ordinal !== expected.identity?.ordinal ||
    result.identity?.carClass !== expected.identity?.carClass ||
    result.identity?.performanceIndex !== expected.identity?.performanceIndex ||
    result.engineMaxRpm !== expected.engineMaxRpm)) {
    return { ...engineCalculationSummary(null, observationId), reason: 'identity-changed' };
  }
  return engineCalculationSummary(result, observationId);
}
