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
  formulaVersion: 'tuningMath/measured-workflow-v1' | 'ev/measured-workflow-v1' | 'rust/ice-measured-workflow-v1' | 'rust/ice-measured-workflow-v2' | 'rust/ev-measured-workflow-v1';
  inputSnapshot: Record<string, unknown>;
  fields: Record<string, { value: number; unit: string }>;
}

export type DevRaceGoal = 'Road' | 'Rally' | 'Drag' | 'Drift';

export type DevSurface = 'tarmac' | 'gravel' | 'snow' | 'dragStrip';

export interface TuningCapabilityContract {
  schemaVersion: 'tuning-capabilities/v1';
  game: 'forza-horizon-6';
  gameBuild: string | ContractUnknown;
  source: TuneControlSource;
  upgrades: UpgradeUnlockSpec[];
  controls: TuneControlSpec[];
}

export type ContractUnknown = 'unknown';

export type TuneControlSource = 'in_game_capture' | 'community' | 'default' | 'unknown';

export interface TuneControlSpec {
  section: string;
  field: string;
  unlocked: boolean;
  min: TuneControlNumber;
  max: TuneControlNumber;
  step: TuneControlStep;
  precision: number | ContractUnknown;
  unit: string;
  source: TuneControlSource;
  gameBuild?: string;
  installedPart?: string;
}

export type TuneControlStep = number | 'snap' | ContractUnknown;

export type TuneControlNumber = number | ContractUnknown;

export interface UpgradeUnlockSpec {
  installedPart: string;
  capabilities: Record<string, boolean>;
  controls: TuneControlSpec[];
}

export interface DevTuningInput {
  raceGoal: DevRaceGoal;
  surface: DevSurface;
  car: DevCarInput;
  targetTopSpeedKmh: number;
  targetRideFrequencyFrontHz: number;
  targetRideFrequencyRearHz: number;
  dampingRatioFront: number;
  dampingRatioRear: number;
}

export interface DevCarInput {
  isElectric?: boolean;
  weight: number;
  weight_distribution: number;
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  maxHp: number;
  maxHpRpm: number;
  maxTorqueRpm: number;
  tireType?: string;
  frontTireWidth?: number;
  frontTireAspect?: number;
  frontTireRim?: number;
  rearTireWidth?: number;
  rearTireAspect?: number;
  rearTireRim?: number;
  adjustability?: {
    gears?: number;
    suspension?: string;
    arb?: string;
    gearbox?: string;
    diff?: string;
  };
  spring_front_min?: number;
  spring_front_max?: number;
  spring_rear_min?: number;
  spring_rear_max?: number;
  height_front_min?: number;
  height_front_max?: number;
  height_rear_min?: number;
  height_rear_max?: number;
  arb_front_min?: number;
  arb_front_max?: number;
  arb_rear_min?: number;
  arb_rear_max?: number;
}

export interface DevTuningOutput {
  schemaVersion: 'tuning-dev/v1';
  inputSummary: { raceGoal: DevRaceGoal; surface: DevSurface; drivetrain: DevCarInput['drivetrain'] };
  tire: DevTireOutput;
  chassis: DevChassisOutput;
  alignment: DevAlignmentOutput;
  gearing: DevGearingOutput;
  differential: DevDifferentialOutput;
  warnings: string[];
}

export interface DevTireOutput {
  compound: string;
  surface: DevSurface;
  muLongitudinal: number;
  muLateral: number;
  temperatureMultiplier: number;
  pressureMultiplier: number;
  loadSensitivity: number;
  peakSlipRatio: number;
  peakSlipAngleDeg: number;
  source: 'calibration-prior';
}

export interface DevChassisOutput {
  springs: DevChassisSpringsOutput;
  damping: DevDampingOutput;
  arb: { front: number; rear: number };
}

export interface DevChassisSpringsOutput {
  modelType: 'direct_wheel_load_approx';
  assumedMotionRatio: 1.0;
  frontKgfMm: number;
  rearKgfMm: number;
  frontRideHeightCm: number;
  rearRideHeightCm: number;
}

export interface DevDampingOutput {
  // Flat backwards-compatible fields
  frontCriticalNsM: number;
  rearCriticalNsM: number;
  frontSliderValue: number;
  rearSliderValue: number;
  bumpToReboundRatio: number;

  // Separated layers
  physical: DevDampingPhysical;
  priors: DevDampingPriors;
  sliderMapping: DevDampingSliderMapping;
}

export interface DevDampingPhysical {
  frontCriticalNsM: number;
  rearCriticalNsM: number;
  frontReboundDampingNsM: number;
  rearReboundDampingNsM: number;
  frontBumpDampingNsM: number;
  rearBumpDampingNsM: number;
}

export interface DevDampingPriors {
  frontDampingRatio: number;
  rearDampingRatio: number;
  bumpToReboundRatio: number;
  source: 'calibration-prior/v1';
}

export interface DevDampingSliderMapping {
  frontSliderValue: number;
  rearSliderValue: number;
  mappingSource: 'advisory_heuristic_v1';
}

export interface DevAlignmentOutput {
  pressureColdFrontPsi: number;
  pressureColdRearPsi: number;
  targetHotPressurePsi: number;
  camberFrontDeg: number;
  camberRearDeg: number;
  toeFrontDeg: number;
  toeRearDeg: number;
  casterDeg: number;
}

export interface DevGearingOutput {
  unsupported?: boolean;
  unsupportedReason?: string;
  finalDrive: number;
  gears: number[];
  tireCircumferenceM: number;
  topSpeedAtPeakHpKmh: number;
}

export interface DevDifferentialOutput {
  frontAccelPercent: number;
  frontDecelPercent: number;
  rearAccelPercent: number;
  rearDecelPercent: number;
  centerToRearPercent: number;
}

export interface AppliedTuningSetup {
  // 胎壓 (Stored as PSI)
  tirePressureFront: number;
  tirePressureRear: number;

  // 定位角度 (Degrees)
  camberFront: number;
  camberRear: number;
  toeFront: number;
  toeRear: number;
  caster: number;

  // 防傾桿 ARB (1.0 - 65.0)
  arbFront: number;
  arbRear: number;

  // 彈簧與車高
  springsFront: number;
  springsRear: number;
  rideHeightFront: number;
  rideHeightRear: number;

  // 阻尼 (1.0 - 20.0)
  reboundFront: number;
  reboundRear: number;
  bumpFront: number;
  bumpRear: number;

  // 差速器 (0 - 100%)
  diffAccelFront?: number;
  diffDecelFront?: number;
  diffAccelRear: number;
  diffDecelRear: number;
  diffCenterRear?: number;

  // 齒輪比
  finalDrive?: number;
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
  dragFinishSpeedKmh?: number;
  dragFinishSpeedProvenance?: 'telemetry' | 'manual';
  aeroBalance?: number;
  aeroEfficiency?: number;
  mechBalance?: number;
  aero_downforce_front?: number;
  aero_downforce_rear?: number;
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
  spring_front_min?: number; // kgf/mm
  spring_front_max?: number;
  spring_rear_min?: number;
  spring_rear_max?: number;
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
