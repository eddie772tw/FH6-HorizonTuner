import type { TelemetryData } from '../../hooks/useTelemetry';

/**
 * These are observation-completeness limits for a low-rate UI summary. They
 * are deliberately not FH6 vehicle, tyre, or performance-meta constants.
 */
export const TUNING_MEASUREMENT_MIN_ACCEPTED_MS = 6_000;
export const TUNING_MEASUREMENT_FRESHNESS_MS = 2_000;
export const TUNING_MEASUREMENT_MAX_CONTIGUOUS_GAP_MS = 1_000;
export const TUNING_MEASUREMENT_MIN_BINS = 8;
export const TUNING_MEASUREMENT_BIN_COUNT = 16;
export const TUNING_MEASUREMENT_WOT_INPUT = 250;
export const TUNING_MEASUREMENT_GEAR_SETTLE_MS = 500;

export type TuningMeasurementStatus = 'collecting' | 'ready' | 'blocked';

export type TuningMeasurementGuidance =
  | 'collecting'
  | 'ready'
  | 'telemetry-disconnected'
  | 'waiting-frame'
  | 'car-mismatch'
  | 'identity-incomplete'
  | 'identity-changed'
  | 'not-in-race'
  | 'timestamp-stalled'
  | 'timestamp-regressed'
  | 'input-not-wide-open'
  | 'control-input-active'
  | 'gear-not-forward'
  | 'gear-changing'
  | 'engine-rpm-invalid'
  | 'output-unavailable'
  | 'sampling-gap'
  | 'duration-insufficient'
  | 'rpm-coverage-low'
  | 'rpm-coverage-high'
  | 'bins-insufficient';

export interface TuningMeasurementIdentity {
  ordinal: number;
  carClass: number;
  performanceIndex: number;
}

/** A bounded observed bin, not a calibrated engine power curve. */
export interface TuningMeasurementBin {
  index: number;
  sampleCount: number;
  averagePowerWatts: number;
  averageTorqueNewtons: number;
  averageRpm: number;
  powerWattsSum: number;
  torqueNewtonsSum: number;
  rpmSum: number;
}

export interface TuningMeasurementPeak {
  value: number;
  rpm: number;
}

export interface TuningMeasurementState {
  carId: string;
  status: TuningMeasurementStatus;
  guidance: TuningMeasurementGuidance;
  identity?: TuningMeasurementIdentity;
  engineMaxRpm?: number;
  acceptedMs: number;
  lowestRpm?: number;
  highestRpm?: number;
  bins: TuningMeasurementBin[];
  observedPeakPower?: TuningMeasurementPeak;
  observedPeakTorque?: TuningMeasurementPeak;
  /** Forza normalized slip is diagnostic, not physical slip percentage. */
  maxObservedNormalizedSlip?: number;
  lastTimestampMs?: number;
  lastProgressedAtMs?: number;
  lastAcceptedTimestampMs?: number;
  lastObservedGear?: number;
  gearSettleUntilMs?: number;
}

export interface TuningMeasurementReadiness {
  ready: boolean;
  status: TuningMeasurementStatus;
  guidance: TuningMeasurementGuidance;
  acceptedMs: number;
  binCount: number;
  lowRpmCoverage: boolean;
  highRpmCoverage: boolean;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const asNonNegativeInteger = (value: unknown): number | undefined =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0 ? value : undefined;

function identityFromFrame(frame: TelemetryData): TuningMeasurementIdentity | undefined {
  const ordinal = asNonNegativeInteger(frame.CarOrdinal);
  const carClass = asNonNegativeInteger(frame.CarClass);
  const performanceIndex = asNonNegativeInteger(frame.CarPerformanceIndex);
  if (!ordinal || carClass === undefined || performanceIndex === undefined) return undefined;
  return { ordinal, carClass, performanceIndex };
}

function sameIdentity(left: TuningMeasurementIdentity, right: TuningMeasurementIdentity): boolean {
  return left.ordinal === right.ordinal
    && left.carClass === right.carClass
    && left.performanceIndex === right.performanceIndex;
}

function readGuidance(state: TuningMeasurementState, nowMs: number): TuningMeasurementGuidance {
  if ([
    'telemetry-disconnected',
    'waiting-frame',
    'car-mismatch',
    'identity-incomplete',
    'not-in-race',
    'identity-changed',
    'timestamp-regressed',
  ].includes(state.guidance)) return state.guidance;
  if (state.lastProgressedAtMs === undefined || nowMs - state.lastProgressedAtMs > TUNING_MEASUREMENT_FRESHNESS_MS) {
    return 'timestamp-stalled';
  }
  if (state.acceptedMs < TUNING_MEASUREMENT_MIN_ACCEPTED_MS) return 'duration-insufficient';
  if (!state.engineMaxRpm || !state.lowestRpm || state.lowestRpm > state.engineMaxRpm * 0.4) return 'rpm-coverage-low';
  if (!state.highestRpm || state.highestRpm < state.engineMaxRpm * 0.9) return 'rpm-coverage-high';
  if (state.bins.length < TUNING_MEASUREMENT_MIN_BINS) return 'bins-insufficient';
  return 'ready';
}

export function createTuningMeasurement(carId: string): TuningMeasurementState {
  return {
    carId,
    status: 'collecting',
    guidance: 'waiting-frame',
    acceptedMs: 0,
    bins: [],
  };
}

export function getTuningMeasurementReadiness(state: TuningMeasurementState, nowMs: number): TuningMeasurementReadiness {
  const guidance = readGuidance(state, nowMs);
  const ready = guidance === 'ready';
  return {
    ready,
    status: ready ? 'ready' : guidance === 'identity-changed' || guidance === 'timestamp-regressed' ? 'blocked' : 'collecting',
    guidance,
    acceptedMs: state.acceptedMs,
    binCount: state.bins.length,
    lowRpmCoverage: Boolean(state.engineMaxRpm && state.lowestRpm !== undefined && state.lowestRpm <= state.engineMaxRpm * 0.4),
    highRpmCoverage: Boolean(state.engineMaxRpm && state.highestRpm !== undefined && state.highestRpm >= state.engineMaxRpm * 0.9),
  };
}

function withGuidance(state: TuningMeasurementState, guidance: TuningMeasurementGuidance): TuningMeasurementState {
  return {
    ...state,
    status: guidance === 'ready' ? 'ready' : guidance === 'identity-changed' || guidance === 'timestamp-regressed' ? 'blocked' : 'collecting',
    guidance,
  };
}

/** Keep a usable recorded result while optional extra sampling continues.
 * Freshness gates new snapshots, not a previously completed observation.
 * A changed build or restarted telemetry session invalidates the old result.
 */
export function retainReadyMeasurementSnapshot(
  previous: TuningMeasurementState | undefined,
  current: TuningMeasurementState,
  nowMs: number,
): TuningMeasurementState | undefined {
  if (current.status === 'blocked' || (previous && previous.carId !== current.carId)) return undefined;
  return getTuningMeasurementReadiness(current, nowMs).ready ? current : previous;
}

function observedSlip(frame: TelemetryData): number | undefined {
  const slip = frame.TireSlipRatio;
  if (!Array.isArray(slip) || slip.length < 4 || !slip.slice(0, 4).every(isFiniteNumber)) return undefined;
  return Math.max(...slip.slice(0, 4).map(Math.abs));
}

function addBin(previous: TuningMeasurementBin[], rpm: number, redlineRpm: number, powerWatts: number, torqueNewtons: number): TuningMeasurementBin[] {
  const index = Math.min(TUNING_MEASUREMENT_BIN_COUNT - 1, Math.max(0, Math.floor((rpm / redlineRpm) * TUNING_MEASUREMENT_BIN_COUNT)));
  const found = previous.find((bin) => bin.index === index);
  const next = found
    ? { ...found }
    : { index, sampleCount: 0, averagePowerWatts: 0, averageTorqueNewtons: 0, averageRpm: 0, powerWattsSum: 0, torqueNewtonsSum: 0, rpmSum: 0 };
  next.sampleCount += 1;
  next.powerWattsSum += powerWatts;
  next.torqueNewtonsSum += torqueNewtons;
  next.rpmSum += rpm;
  next.averagePowerWatts = next.powerWattsSum / next.sampleCount;
  next.averageTorqueNewtons = next.torqueNewtonsSum / next.sampleCount;
  next.averageRpm = next.rpmSum / next.sampleCount;
  return [...previous.filter((bin) => bin.index !== index), next].sort((a, b) => a.index - b.index);
}

/**
 * Accept a contiguous, WOT, in-race engine-output sweep for the requested car.
 * Slip is retained as context, not a gate: engine P/T does not infer road grip.
 * `nowMs` exists solely for UI freshness; telemetry timestamps determine all
 * accumulated duration and no timer can independently make a state ready.
 */
export function advanceTuningMeasurement(
  state: TuningMeasurementState,
  frame: TelemetryData | null,
  connected: boolean,
  nowMs: number,
): TuningMeasurementState {
  if (!connected) return withGuidance({ ...state, lastAcceptedTimestampMs: undefined }, 'telemetry-disconnected');
  if (!frame) return withGuidance({ ...state, lastAcceptedTimestampMs: undefined }, 'waiting-frame');
  if (state.guidance === 'identity-changed' || state.guidance === 'timestamp-regressed') return state;

  const identity = identityFromFrame(frame);
  if (!identity) return withGuidance({ ...state, lastAcceptedTimestampMs: undefined }, 'identity-incomplete');
  if (String(identity.ordinal) !== state.carId) return withGuidance({ ...state, lastAcceptedTimestampMs: undefined }, 'car-mismatch');
  if (state.identity && !sameIdentity(state.identity, identity)) return withGuidance(state, 'identity-changed');
  if (frame.IsRaceOn !== 1) return withGuidance({ ...state, identity, lastAcceptedTimestampMs: undefined }, 'not-in-race');

  const timestamp = frame.TimestampMS;
  if (!isFiniteNumber(timestamp) || timestamp < 0) return withGuidance({ ...state, identity, lastAcceptedTimestampMs: undefined }, 'timestamp-stalled');
  if (state.lastTimestampMs !== undefined && timestamp < state.lastTimestampMs) return withGuidance(state, 'timestamp-regressed');
  if (state.lastTimestampMs !== undefined && timestamp === state.lastTimestampMs) {
    // A repeated UI snapshot is not an observation break. Keep the previous
    // accepted timestamp so the next progressed frame can remain contiguous;
    // freshness will still fail closed after two seconds without progress.
    return withGuidance(state, 'timestamp-stalled');
  }

  const progressed = { ...state, identity, lastTimestampMs: timestamp, lastProgressedAtMs: nowMs };
  const redlineRpm = frame.EngineMaxRpm;
  const rpm = frame.CurrentEngineRpm;
  const powerWatts = frame.PowerWatts;
  const torqueNewtons = frame.TorqueNewtons;
  if (!isFiniteNumber(redlineRpm) || redlineRpm <= 0 || !isFiniteNumber(rpm) || rpm <= 0 || rpm > redlineRpm) {
    return withGuidance({ ...progressed, lastAcceptedTimestampMs: undefined }, 'engine-rpm-invalid');
  }
  if (progressed.engineMaxRpm !== undefined && redlineRpm !== progressed.engineMaxRpm) {
    return withGuidance(state, 'identity-changed');
  }
  // The game reports this independently of whether the acceleration is accepted.
  progressed.engineMaxRpm = redlineRpm;
  if (!isFiniteNumber(frame.Gear) || !Number.isInteger(frame.Gear) || frame.Gear < 1 || frame.Gear > 10) {
    return withGuidance({ ...progressed, lastObservedGear: isFiniteNumber(frame.Gear) ? frame.Gear : undefined,
      gearSettleUntilMs: timestamp + TUNING_MEASUREMENT_GEAR_SETTLE_MS,
      lastAcceptedTimestampMs: undefined }, 'gear-not-forward');
  }
  if (progressed.lastObservedGear !== undefined && frame.Gear !== progressed.lastObservedGear) {
    return withGuidance({ ...progressed, lastObservedGear: frame.Gear,
      gearSettleUntilMs: timestamp + TUNING_MEASUREMENT_GEAR_SETTLE_MS,
      lastAcceptedTimestampMs: undefined }, 'gear-changing');
  }
  if (progressed.gearSettleUntilMs !== undefined && timestamp < progressed.gearSettleUntilMs) {
    return withGuidance({ ...progressed, lastAcceptedTimestampMs: undefined }, 'gear-changing');
  }
  if (!isFiniteNumber(powerWatts) || powerWatts <= 0 || !isFiniteNumber(torqueNewtons) || torqueNewtons <= 0) {
    return withGuidance({ ...progressed, lastAcceptedTimestampMs: undefined }, 'output-unavailable');
  }
  if (!isFiniteNumber(frame.AccelInput) || frame.AccelInput < TUNING_MEASUREMENT_WOT_INPUT) {
    return withGuidance({ ...progressed, lastAcceptedTimestampMs: undefined }, 'input-not-wide-open');
  }
  if (!isFiniteNumber(frame.BrakeInput) || !isFiniteNumber(frame.HandBrakeInput) || !isFiniteNumber(frame.ClutchInput)
    || frame.BrakeInput !== 0 || frame.HandBrakeInput !== 0 || frame.ClutchInput !== 0) {
    return withGuidance({ ...progressed, lastAcceptedTimestampMs: undefined }, 'control-input-active');
  }
  const normalizedSlip = observedSlip(frame);

  const deltaMs = progressed.lastAcceptedTimestampMs === undefined ? 0 : timestamp - progressed.lastAcceptedTimestampMs;
  if (deltaMs > TUNING_MEASUREMENT_MAX_CONTIGUOUS_GAP_MS) {
    return withGuidance({ ...progressed, lastAcceptedTimestampMs: timestamp }, 'sampling-gap');
  }

  const next: TuningMeasurementState = {
    ...progressed,
    guidance: 'collecting',
    lastObservedGear: frame.Gear,
    gearSettleUntilMs: undefined,
    engineMaxRpm: redlineRpm,
    maxObservedNormalizedSlip: normalizedSlip === undefined ? progressed.maxObservedNormalizedSlip
      : Math.max(progressed.maxObservedNormalizedSlip ?? 0, normalizedSlip),
    acceptedMs: progressed.acceptedMs + Math.max(0, deltaMs),
    lowestRpm: progressed.lowestRpm === undefined ? rpm : Math.min(progressed.lowestRpm, rpm),
    highestRpm: progressed.highestRpm === undefined ? rpm : Math.max(progressed.highestRpm, rpm),
    bins: addBin(progressed.bins, rpm, redlineRpm, powerWatts, torqueNewtons),
    observedPeakPower: !progressed.observedPeakPower || powerWatts > progressed.observedPeakPower.value ? { value: powerWatts, rpm } : progressed.observedPeakPower,
    observedPeakTorque: !progressed.observedPeakTorque || torqueNewtons > progressed.observedPeakTorque.value ? { value: torqueNewtons, rpm } : progressed.observedPeakTorque,
    lastAcceptedTimestampMs: timestamp,
  };
  return withGuidance(next, readGuidance(next, nowMs));
}
