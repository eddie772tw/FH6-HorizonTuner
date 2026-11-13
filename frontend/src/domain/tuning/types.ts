/** Wire contracts and UI data shapes only. Rust owns all tuning decisions. */
import type { EvGearingResult } from './ev/types';
import type { TuningCaptureFile } from './telemetryCapture';

export interface TuningMeasurementState {
  /** Absent/older versions denote archived analysis; calculation replays at the current version. */
  analysisVersion?: 'engine-loaded-sweep/v4' | 'engine-loaded-sweep/v2' | 'engine-loaded-sweep/v3';
  loadedSinceMs?: number;
  carId: string;
  status: TuningMeasurementStatus;
  guidance: TuningMeasurementGuidance;
  identity?: TuningMeasurementIdentity;
  engineMaxRpm?: number;
  effectiveRedline?: number;
  powerDropoffDetected?: boolean;
  cutoffDetected?: boolean;
  plateauCandidateRpm?: number;
  plateauDurationMs?: number;
  plateauHadOutputCut?: boolean;
  cutoffCycles?: CutoffCycleEvidence;
  /** Immediately preceding qualified positive-output frame, cleared on cuts and interruptions. */
  lastLoadedPositiveRpm?: number;
  lastMorphologyTimestampMs?: number;
  /** Fixed 64-band evidence supports rebucketing without inventing samples. */
  rpmEvidenceBins?: TuningMeasurementBin[];
  powerbandStartRpm?: number;
  powerbandEndRpm?: number;
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
  | 'bins-insufficient'
  | 'vehicle-not-moving'
  | 'load-settling';

export interface TuningMeasurementIdentity {
  ordinal: number;
  carClass: number;
  performanceIndex: number;
}

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

export interface CutoffCycleEvidence {
  upperRpm: number;
  startedMs: number;
  lastCycleMs: number;
  cycles: number;
  phase: 'cut' | 'recovery' | 'armed';
  cutSamples: number;
  recoverySamples: number;
}

export type Season = 'Summer' | 'Autumn' | 'Spring' | 'Winter';

export interface ChassisTuningResult {
  arb: {
    front: number;
    rear: number;
  };
  springs: {
    front: number; // kgf/mm
    rear: number;  // kgf/mm
    heightF: number; // cm
    heightR: number; // cm
  };
  damping: {
    reboundF: number;
    reboundR: number;
    bumpF: number;
    bumpR: number;
  };
  diff: {
    accelF: number;
    decelF: number;
    accelR: number;
    decelR: number;
    centerRear: number; // % to rear
  };
}

/** Rust-owned qualification and bounded targets; UI never recomputes these. */
export interface ChassisDiagnostics {
  modelVersion: string;
  available: boolean;
  reasons: string[];
  aero: null | { source: 'omitted' | 'provided' | 'derived-front' | 'derived-rear' | 'unavailable'; front: number | null; rear: number | null; reason: string | null };
  axles: Array<{ axle: 'front' | 'rear'; baseTarget: number; baseline: number; reference: number; target: number | null; baseLimited: boolean; aeroLimited: boolean; reboundTarget: number; reboundLimited: boolean; bumpLimited: boolean }>;
}

export interface StaticTireAlignResult {
  pcF: number; // PSI
  pcR: number; // PSI
  targetPhot: number; // PSI
  seasonBias: number; // PSI
  camber: {
    front: number;
    rear: number;
  };
  toe: {
    front: string;
    rear: string;
  };
  caster: number;
  hwF: number; // mm
  hwR: number; // mm
}

export type WorkflowGearingResult = GearingResult | EvGearingResult;

export interface GearingResult {
  finalDrive: number;
  gears: number[];
  unsupported?: boolean;
  unsupportedReason?: string;
}

export interface WorkflowRecommendation {
  formulaVersion: 'rust/ice-measured-workflow-v4' | 'rust/ev-measured-workflow-v1' | 'rust/ev-measured-workflow-v2' | 'rust/ev-measured-workflow-v3';
  inputSnapshot: Record<string, unknown>;
  fields: Record<string, { value: number; unit: string }>;
}

export interface EngineCalculationSummary {
  analysisVersion: 'engine-loaded-sweep/v4';
  observationId: string;
  status: 'ready' | 'collecting' | 'unavailable';
  reason: TuningMeasurementGuidance | 'capture-unavailable';
  engineMaxRpm?: number;
  effectiveRedline?: number;
  acceptedMs: number;
  peakPower?: TuningMeasurementPeak;
  peakTorque?: TuningMeasurementPeak;
}

export interface TireEvidenceResult {
  status: 'observed' | 'unavailable';
  acceptedSampleCount: number;
  observedLongitudinalAccelerationMps2: number | null;
  maxObservedNormalizedSlip: number | null;
  observedTireTemperature: number[] | null;
  unavailableReasons: string[];
}

export interface EvidenceProvenance {
  schemaVersion: 'tuning-evidence-provenance/v1';
  evidenceId: string | null; source: string; analysisVersion: string;
  carId: string; powertrain: string; identity: Record<string, unknown>;
  observationId: string | null; observationRecordedAt: number | null;
  dependencyKey: string | null; capturedAt: null; sessionId: null;
  setupVersion: null; upgradeVersion: null; lapWindow: null; timeWindow: null;
}

export interface BaselinePreview {
  schemaVersion: 'tuning-baseline-preview/v1'; modelVersion: string;
  goal: string; stiffness: 'neutral'; balance: 'neutral'; missingInputs: string[];
  fields: { key: string; unit: string; current: number | null; recommended: number | null;
    delta: number | null; status: 'available' | 'locked' | 'unavailable'; reason: string | null }[];
  affectedFields: string[]; canApply: boolean;
}

export interface EngineObservation {
  schema: 'engine-observation/v1'; id: string; carId: string; capturedAt: number;
  dependencyKey: string; source: 'measured'; data: TuningMeasurementState;
  capture?: TuningCaptureFile;
}

export type RallyProfile = 'mixed-surface' | 'cross-country';

export interface TuningMeasurementReadiness {
  ready: boolean;
  status: TuningMeasurementStatus;
  guidance: TuningMeasurementGuidance;
  acceptedMs: number;
  binCount: number;
  lowRpmCoverage: boolean;
  highRpmCoverage: boolean;
  effectiveRedline?: number;
  powerDropoffDetected?: boolean;
  cutoffDetected?: boolean;
  powerbandStartRpm?: number;
  powerbandEndRpm?: number;
}

export interface TuningCarParams {
  transmission?: import('./transmission').TransmissionSelection;
  isElectric?: boolean;
  weight: number; // in kg
  weight_distribution: number; // front weight percentage (0-100)
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  /** Optional Road centre differential setting, percent of torque sent rearward. */
  roadAwdRearPercent?: number;
  induction?: 'NA' | 'Supercharger' | 'Turbo' | 'TwinTurbo';
  maxHp: number;
  maxTorque: number;
  maxHpRpm: number;
  maxTorqueRpm: number;
  /** Optional measured Drag finish speed, never inferred from softMaxSpeed. */
  dragFinishSpeedKmh?: number | null;
  dragFinishSpeedProvenance?: 'telemetry' | 'manual' | null;
  driftWorkingTarget?: import('../../features/tuning/aegoTypes').DriftWorkingTarget;
  rallyObservedBounds?: import('../../features/tuning/ratioBalanceTypes').RatioBalanceRequest['bounds'];
  driftObservedBounds?: import('../../features/tuning/ratioBalanceTypes').RatioBalanceRequest['bounds'];
  dragObservedBounds?: import('../../features/tuning/ratioBalanceTypes').RatioBalanceRequest['bounds'];
  aeroInputVersion?: 'optional/v1';
  aeroBalance?: number | null;
  aeroEfficiency?: number;
  mechBalance?: number;
  aero_downforce_front?: number | null;
  aero_downforce_rear?: number | null;
  frontTireWidth?: number;
  frontTireAspect?: number;
  frontTireRim?: number;
  rearTireWidth?: number;
  rearTireAspect?: number;
  rearTireRim?: number;
  tireType?: string;
  /** Optional persisted split consumed only by the Rally goal. */
  rallyProfile?: RallyProfile;
  adjustability?: {
    gearbox?: 'Fixed' | 'FinalDrive' | 'Full';
    gears?: number;
    suspension?: string;
    arb?: string;
    aero?: string;
    brakes?: string;
    diff?: string;
  };
  // Suspension & Ride Height Limits for Safety Clamping
  spring_front_min?: number | null; // kgf/mm
  spring_front_max?: number | null;
  spring_rear_min?: number | null;
  spring_rear_max?: number | null;
  height_front_min?: number; // cm
  height_front_max?: number;
  height_rear_min?: number;
  height_rear_max?: number;
}

export interface MeasuredEngineInputs {
  engineMaxRpm: number;
  peakPowerRpm: number;
  peakTorqueRpm: number;
  /** Qualified moving-sweep torque; absent preserves older callers. */
  peakTorqueNm?: number;
}
