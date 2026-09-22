/**
 * Vehicle Physics & Tuning Calculation Engine (Frontend SSOT Implementation)
 *
 * Conforms to:
 * - docs/contracts/tuning_responsibilities.md (Tuning & Gearing Responsibilities Contract)
 * - tests/fixtures/tuning_golden_fixtures.json (18 Golden Fixture Scenarios)
 * - .agents/AGENTS.md Core Invariant #2 (Vehicle physics twin SSOT with backend-rust/src/tuning/)
 *
 * Interface representing vehicle parameters used for tuning calculation.
 */
export interface TuningCarParams {
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

export type Drivetrain = 'RWD' | 'AWD' | 'FWD';
export type RaceType = 'Road' | 'Rally' | 'Drag' | 'Drift';
export type RallyProfile = 'mixed-surface' | 'cross-country';

/** Normalize the Rally boundary without changing other disciplines or saved input. */
function rallyCalculationInputs(params: TuningCarParams): TuningCarParams {
  const positive = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! > 0 ? value! : fallback;
  const result = { ...params,
    weight: positive(params.weight, 1400),
    weight_distribution: Number.isFinite(params.weight_distribution) ? Math.max(1, Math.min(99, params.weight_distribution)) : 50,
    maxHp: positive(params.maxHp, 300), maxTorque: positive(params.maxTorque, 0),
    maxHpRpm: positive(params.maxHpRpm, 0), maxTorqueRpm: positive(params.maxTorqueRpm, 0),
    aero_downforce_front: positive(params.aero_downforce_front, 0), aero_downforce_rear: positive(params.aero_downforce_rear, 0) };
  for (const axle of ['front', 'rear'] as const) {
    const springMin = positive(params[`spring_${axle}_min`], 10);
    result[`spring_${axle}_min`] = springMin;
    result[`spring_${axle}_max`] = Math.max(springMin, positive(params[`spring_${axle}_max`], 120));
    const heightMin = positive(params[`height_${axle}_min`], 10);
    result[`height_${axle}_min`] = heightMin;
    result[`height_${axle}_max`] = Math.max(heightMin, positive(params[`height_${axle}_max`], 25));
  }
  return result;
}

export interface GearingResult {
  finalDrive: number;
  gears: number[];
  unsupported?: boolean;
  unsupportedReason?: string;
}

export interface MeasuredEngineInputs {
  engineMaxRpm: number;
  peakPowerRpm: number;
  peakTorqueRpm: number;
}

/** One confirmed game step; this is an experiment, not an inferred optimum. */
export function roadExplorationStep(setting: { value: number; minimum: number; maximum: number; step: number }, direction: -1 | 1): number | null {
  const { value, minimum, maximum, step } = setting;
  if ((direction !== -1 && direction !== 1) || ![value, minimum, maximum, step].every(Number.isFinite) || minimum >= maximum || step <= 0 || value < minimum || value > maximum) return null;
  const grid = (value - minimum) / step;
  if (Math.abs(grid - Math.round(grid)) > 1e-5) return null;
  const candidate = Number((minimum + (Math.round(grid) + direction) * step).toFixed(8));
  return candidate >= minimum && candidate <= maximum ? candidate : null;
}

/** Measured workflow adapter. Existing public formulas retain their contract. */
export function calculateMeasuredGearing(goal: string, gears: number, params: TuningCarParams | null,
  engine: MeasuredEngineInputs | null): GearingResult | null {
  if (!params || !engine || !Number.isInteger(gears) || gears < 4 || gears > 10 || !Number.isFinite(params.maxHp) || params.maxHp <= 0 ||
    ![engine.engineMaxRpm, engine.peakPowerRpm, engine.peakTorqueRpm].every(value => Number.isFinite(value) && value > 0) ||
    engine.peakPowerRpm > engine.engineMaxRpm || engine.peakTorqueRpm > engine.engineMaxRpm) return null;
  const result = calculateAEGOGearing(goal, gears, { ...params, maxHpRpm: engine.peakPowerRpm,
    maxTorqueRpm: engine.peakTorqueRpm }, engine.engineMaxRpm);
  return result.unsupported ? null : result;
}

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

/**
 * Calculates top vehicle speed for a specific gear at a given engine RPM.
 * 
 * @param rpm Engine speed in RPM
 * @param gearRatio Gear ratio
 * @param finalDrive Final drive ratio
 * @param tireRadiusM Effective tire radius in meters (default 0.32m)
 * @returns Speed in meters per second (m/s)
 */
export function calcGearSpeed(
  rpm: number,
  gearRatio: number,
  finalDrive: number,
  tireRadiusM = 0.32
): number {
  if (gearRatio <= 0 || finalDrive <= 0) return 0;
  return (rpm * 2 * Math.PI * tireRadiusM) / (gearRatio * finalDrive * 60);
}

/**
 * Calculates required engine RPM for a target speed in a specific gear.
 * 
 * @param speedMs Speed in meters per second (m/s)
 * @param gearRatio Gear ratio
 * @param finalDrive Final drive ratio
 * @param tireRadiusM Effective tire radius in meters (default 0.32m)
 * @returns Engine RPM
 */
export function calcGearRpm(
  speedMs: number,
  gearRatio: number,
  finalDrive: number,
  tireRadiusM = 0.32
): number {
  if (tireRadiusM <= 0) return 0;
  return (speedMs * gearRatio * finalDrive * 60) / (2 * Math.PI * tireRadiusM);
}

export interface GearingSecondaryCorrection {
  simulatedTopSpeed?: number; // Simulated/Theoretical top speed from initial gearing (km/h)
  softMaxSpeed?: number;      // Transmission preview soft max speed limit cap (km/h)
  /** Finish speed measured on the Drag strip, with explicit provenance. */
  dragFinishSpeedKmh?: number;
  dragFinishSpeedProvenance?: 'telemetry' | 'manual';
}

const AEGO_FINAL_DRIVE_MIN = 2.0;
const AEGO_FINAL_DRIVE_MAX = 6.1;

/** Report an unattainable explicit Drag endpoint after final slider rounding. */
function dragFinishAvailability(goal: string, targetKmh: number | undefined, rpm: number,
  gears: number[], finalDrive: number, radiusM: number): Pick<GearingResult, 'unsupported' | 'unsupportedReason'> {
  if (goal !== 'Drag' || targetKmh === undefined || gears.length === 0) return {};
  const terminalKmh = calcGearSpeed(rpm, gears[gears.length - 1], finalDrive, radiusM) * 3.6;
  if (!Number.isFinite(terminalKmh) || Math.abs(terminalKmh - targetKmh) > Math.max(1, targetKmh * 0.02)) {
    return { unsupported: true, unsupportedReason: 'Requested Drag finish speed cannot be reached within gearbox limits.' };
  }
  return {};
}

/**
 * Returns the golden target top gear ratio anchor for a given gear count.
 * Aligns baseline gearing toward lower/moderate final drives and higher individual gear ratios.
 */
export function getTargetTopGearRatio(numGears: number): number {
  if (numGears <= 3) return 1.00;
  if (numGears === 4) return 0.88;
  if (numGears === 5) return 0.78;
  if (numGears === 6) return 0.72;
  if (numGears === 7) return 0.67;
  if (numGears === 8) return 0.63;
  if (numGears === 9) return 0.60;
  return 0.58;
}

/** Road only: absent/invalid overrides preserve the existing rear-biased baseline. */
export function getRoadAwdRearPercent(params: TuningCarParams | null): number {
  const front = Number.isFinite(params?.weight_distribution)
    ? Math.max(1, Math.min(99, params!.weight_distribution)) : 50;
  return Number.isFinite(params?.roadAwdRearPercent)
    ? Math.max(0, Math.min(100, params!.roadAwdRearPercent!))
    : Math.min(85, Math.max(60, 100 - front + 20));
}

/**
 * Initial Road launch envelope, not an identified tyre coefficient or measured limit.
 * F = m*a; longitudinal load transfer reduces front axle load by m*a*h/L.
 * With nominal mu=1, h/L=0.20 and driveline efficiency=0.90, bound wheel torque
 * by the first axle to saturate. These explicit engineering priors are deliberately
 * independent of hidden tyre-compound labels; see road-meta-iteration-20260913.md.
 */
function roadLaunchTotalRatio(params: TuningCarParams, torqueNm: number, radiusM: number): number {
  const front = Number.isFinite(params.weight_distribution)
    ? Math.max(1, Math.min(99, params.weight_distribution)) / 100 : 0.5;
  const rearShare = params.drivetrain === 'FWD' ? 0 : getRoadAwdRearPercent(params) / 100;
  const frontLimitG = rearShare < 1 ? front / (1 - rearShare + 0.20) : Infinity;
  const rearLimitG = rearShare > 0.20 ? (1 - front) / (rearShare - 0.20) : Infinity;
  const accelerationG = Math.min(1, frontLimitG, rearLimitG);
  const mass = Number.isFinite(params.weight) && params.weight > 0 ? params.weight : 1400;
  return mass * 9.81 * accelerationG * radiusM / (torqueNm * 0.90);
}

/** Sanitize only Road inputs; copied values never mutate saved profiles. */
function normalizeRoadInputs(params: TuningCarParams): TuningCarParams {
  const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
  const positive = (value: number | undefined, fallback: number) => {
    const result = finite(value, fallback);
    return result > 0 ? result : fallback;
  };
  const range = (minimum: number | undefined, maximum: number | undefined, low: number, high: number) => {
    const min = positive(minimum, low);
    return [min, Math.max(min, positive(maximum, high))];
  };
  const [spring_front_min, spring_front_max] = range(params.spring_front_min, params.spring_front_max, 10, 120);
  const [spring_rear_min, spring_rear_max] = range(params.spring_rear_min, params.spring_rear_max, 10, 120);
  const [height_front_min, height_front_max] = range(params.height_front_min, params.height_front_max, 10, 25);
  const [height_rear_min, height_rear_max] = range(params.height_rear_min, params.height_rear_max, 10, 25);
  return { ...params, weight: positive(params.weight, 1400),
    weight_distribution: Math.max(1, Math.min(99, finite(params.weight_distribution, 50))),
    maxHp: positive(params.maxHp, 300), maxTorque: positive(params.maxTorque, 0),
    maxHpRpm: positive(params.maxHpRpm, 0), maxTorqueRpm: positive(params.maxTorqueRpm, 0),
    aeroEfficiency: Math.max(0, Math.min(1, finite(params.aeroEfficiency, 0.5))),
    aero_downforce_front: Math.max(0, finite(params.aero_downforce_front, 0)),
    aero_downforce_rear: Math.max(0, finite(params.aero_downforce_rear, 0)),
    frontTireWidth: positive(params.frontTireWidth, 245), frontTireAspect: positive(params.frontTireAspect, 40),
    frontTireRim: positive(params.frontTireRim, 18), rearTireWidth: positive(params.rearTireWidth, 245),
    rearTireAspect: positive(params.rearTireAspect, 40), rearTireRim: positive(params.rearTireRim, 18),
    spring_front_min, spring_front_max, spring_rear_min, spring_rear_max,
    height_front_min, height_front_max, height_rear_min, height_rear_max };
}

/**
 * AEGO (Adaptive Envelope & Gearing Optimization) Algorithm
 * Generates custom, physically-sound gearing setup for different race goals.
 * Supports secondary correction based on in-game simulated top speed & soft cap.
 */
export function calculateAEGOGearing(
  raceGoal: string,
  numGears: number,
  carParams: TuningCarParams | null,
  maxRpm: number,
  secondaryCorrection?: GearingSecondaryCorrection
): GearingResult {
  if (raceGoal === 'Road') {
    if (carParams) carParams = normalizeRoadInputs(carParams);
    if (!Number.isFinite(maxRpm) || maxRpm <= 0) maxRpm = 7500;
    if (!Number.isInteger(numGears) || numGears < 1 || numGears > 10) numGears = 6;
  }
  // 1. Fallback & Default Parameters Setup
  if (raceGoal === 'Rally') {
    if (carParams) carParams = rallyCalculationInputs(carParams);
    if (!Number.isInteger(numGears) || numGears < 1 || numGears > 10) numGears = 6;
    if (!Number.isFinite(maxRpm) || maxRpm <= 0) maxRpm = 7500;
  }
  const weight = (carParams && carParams.weight > 0) ? carParams.weight : 1400; // kg
  const drivetrain: Drivetrain = (carParams && carParams.drivetrain) ? carParams.drivetrain : 'RWD';
  const maxHp = (carParams && carParams.maxHp > 0) ? carParams.maxHp : 300; // HP
  
  if (raceGoal === 'Drag' && (!Number.isInteger(numGears) || numGears < 4 || numGears > 10 || !Number.isFinite(maxRpm) || maxRpm <= 0 || !carParams ||
    ![carParams.weight, carParams.maxHp, carParams.maxTorque, carParams.maxHpRpm, carParams.maxTorqueRpm].every(Number.isFinite) ||
    carParams.weight <= 0 || carParams.maxHp <= 0 || carParams.maxTorque < 0 || carParams.maxHpRpm <= 0 || carParams.maxTorqueRpm <= 0)) {
    return { finalDrive: 3.5, gears: [], unsupported: true, unsupportedReason: 'Drag gearing requires finite vehicle, RPM, torque, and 4-10 gear inputs.' };
  }
  // Estimate maxTorque if not present
  let maxTorque = (carParams && carParams.maxTorque > 0) ? carParams.maxTorque : 0; // N-m
  const rpmHp = (carParams && carParams.maxHpRpm > 0) ? carParams.maxHpRpm : maxRpm * 0.85;
  const rpmT = (carParams && carParams.maxTorqueRpm > 0) ? carParams.maxTorqueRpm : maxRpm * 0.6;

  if (maxTorque === 0) {
    maxTorque = (maxHp * 7021.5) / rpmT; // Approximation in Nm
  }

  // Legacy profiles can leave higher gears inactive; each revised profile
  // explicitly expands this count without changing another discipline.
  let activeGearCount = (raceGoal === 'Drift' || raceGoal === 'Drag') ? Math.min(4, numGears) : numGears;

  // Advanced variables
  const aeroEfficiency = carParams?.aeroEfficiency ?? 0.5;
  const engineType = carParams?.induction ?? 'NA';

  // Determine active tire size based on drivetrain
  const wTire = (drivetrain === 'FWD' ? carParams?.frontTireWidth : carParams?.rearTireWidth) ?? 245;
  const ar = (drivetrain === 'FWD' ? carParams?.frontTireAspect : carParams?.rearTireAspect) ?? 40;
  const sRim = (drivetrain === 'FWD' ? carParams?.frontTireRim : carParams?.rearTireRim) ?? 18;

  const finishSpeedCandidate = secondaryCorrection?.dragFinishSpeedKmh ?? carParams?.dragFinishSpeedKmh;
  const finishSpeedProvenance = secondaryCorrection?.dragFinishSpeedProvenance ?? carParams?.dragFinishSpeedProvenance;
  const dragFinishSpeedKmh = finishSpeedCandidate && finishSpeedProvenance &&
    (finishSpeedProvenance === 'telemetry' || finishSpeedProvenance === 'manual') &&
    Number.isFinite(finishSpeedCandidate) && finishSpeedCandidate > 0
    ? finishSpeedCandidate
    : undefined;

  // Tire Circumference (m)
  const C = ((((wTire * ar) / 100) * 2 + sRim * 25.4) * Math.PI) / 1000;

  const fDrive = drivetrain === 'AWD' ? 1.0 : (drivetrain === 'RWD' ? 0.6 : 0.4);
  let fd = 0;
  let gears: number[] = [];

  if (raceGoal === 'Drift') {
    // Drift Profile.  FH6 guidance recommends a race 6-speed and tuning the
    // final drive/active gear by observed limiter and power-band behaviour.
    // Use the published 4-speed ladder only as a shape prior, then adapt its
    // intermediate ratios to the measured torque-to-power RPM relationship.
    const driftWeight = Number.isFinite(weight) && weight > 0 ? weight : 1400;
    const driftTorque = Number.isFinite(maxTorque) && maxTorque > 0 ? maxTorque : 400;
    const driftRpmHp = Number.isFinite(rpmHp) && rpmHp > 0 ? rpmHp : maxRpm > 0 && Number.isFinite(maxRpm) ? maxRpm * 0.85 : 6000;
    const driftRpmT = Number.isFinite(rpmT) && rpmT > 0 ? rpmT : driftRpmHp * 0.6;
    const baseDriftGearRatios = [2.89, 1.99, 1.34, 1.0];
    const rpmBand = driftRpmT / driftRpmHp;
    const bandExponent = Math.max(0.75, Math.min(1.25, 0.82 / Math.max(0.55, Math.min(0.95, rpmBand))));
    const calcGears = Math.max(4, Math.min(10, Number.isInteger(numGears) ? numGears : 6));
    gears = new Array(calcGears).fill(0);
    for (let i = 0; i < calcGears; i++) {
      const position = (i / (calcGears - 1)) * 3;
      const lower = Math.min(2, Math.floor(position));
      const fraction = position - lower;
      const logRatio = Math.log(baseDriftGearRatios[lower]) * (1 - fraction) + Math.log(baseDriftGearRatios[lower + 1]) * fraction;
      gears[i] = Math.pow(Math.exp(logRatio), bandExponent);
    }

    // Drift gearing does not infer hidden compound grip. Use observable
    // drivetrain/size/RPM inputs; final-drive A/B on measured speed is the
    // correction path for the actual tyre compound.
    const circumference = Number.isFinite(C) && C > 0 ? C : 2.0;
    const rawDriftFd = (driftWeight * fDrive * 2 * circumference) / (driftTorque * gears[0]) * 3.5;
    fd = Number.isFinite(rawDriftFd) ? Math.max(2.2, Math.min(6.1, rawDriftFd)) : 3.5;
    activeGearCount = calcGears;

  } else if (raceGoal === 'Rally' || raceGoal === 'DangerSign') {
    // Rally Profile
    // Cross-country trades peak speed for lower-gear drive on loose surfaces.
    const vTheo = 28 * Math.pow(maxHp, 1 / 3) * (raceGoal === 'Rally' && carParams?.rallyProfile === 'cross-country' ? 0.90 : 1.0);
    const r = Math.max(0.75, Math.min(0.85, 0.82 - 0.05 * ((maxTorque / maxHp) - 1.1)));

    gears = new Array(numGears).fill(0);
    gears[0] = 2.7;
    for (let i = 1; i < numGears; i++) {
      gears[i] = gears[i - 1] * r;
    }

    const gTop = gears[numGears - 1];
    fd = (rpmHp * C * 60) / (gTop * vTheo * 1000);
    fd = Math.max(2.0, Math.min(6.5, fd));

  } else if (raceGoal === 'Drag') {
    // Drag profile: optimise the requested transmission over the strip length.
    // A four-speed setup is a common community baseline, but it is not a game
    // constraint: the active gear count is the gearbox count supplied by the
    // user. `softMaxSpeed` is a UI preview bound and must not become a
    // vehicle-speed estimate.
    const hpPerKg = weight > 0 ? maxHp / weight : 0.5;
    const priorTopSpeedKmh = 410.0 * Math.pow(hpPerKg, 0.30) * (1 + 0.12 * aeroEfficiency);
    // `simulatedTopSpeed` retains its existing simulated/theoretical meaning.
    // A finish speed can influence Drag gearing only when provenance is explicit.
    const vDragTop = dragFinishSpeedKmh && dragFinishSpeedKmh > 0
      ? dragFinishSpeedKmh
      : priorTopSpeedKmh;

    const calcGears = numGears;
    activeGearCount = calcGears;
    gears = new Array(numGears).fill(0);

    const idxTop = calcGears - 1;
    // Keep a usable top gear anchor while deriving final drive from the
    // measured/prior terminal speed.  The anchor is not a fixed "fourth gear"
    // value and therefore works for 4-, 5-, 6- and 7-speed drag transmissions.
    const topAnchor = numGears >= 7 ? 0.82 : numGears >= 5 ? 0.90 : 1.0;
    gears[idxTop] = topAnchor;

    const targetTotalRatio = (rpmHp * C * 60) / (vDragTop * 1000);
    const rawFd = targetTotalRatio / topAnchor;
    fd = Math.max(2.0, Math.min(6.1, rawFd));

    if (calcGears > 1) {
      const v1Target = drivetrain === 'AWD' ? 110.0 : (drivetrain === 'FWD' ? 100.0 : 125.0);
      const rawG1 = (rpmHp * C * 60) / (v1Target * fd * 1000);
      gears[0] = Math.max(2.2, Math.min(5.0, rawG1));

      // Recompute the active top gear after final-drive clamping. If the
      // requested terminal speed is outside the game's FD/ratio envelope,
      // the monotonic guard below is an explicit feasible fallback.
      gears[idxTop] = targetTotalRatio / fd;
      if (!Number.isFinite(gears[idxTop]) || gears[idxTop] <= 0) {
        return { finalDrive: fd, gears: [], unsupported: true, unsupportedReason: 'Requested Drag finish speed is outside the available ratio range.' };
      }
      gears[idxTop] = Math.min(gears[idxTop], gears[0] * Math.pow(0.92, idxTop));

      const rDrag = Math.pow(gears[idxTop] / gears[0], 1 / idxTop);
      for (let i = 1; i < idxTop; i++) {
        gears[i] = gears[i - 1] * rDrag;
      }
    }

  } else {
    // Road / Circuit (Default) - Closed-loop Geometric Step Ratio Smooth Correction Model
    const kTrack = 0.95;
    const vTarget = Math.pow(maxHp, 1 / 3) * 37.0 * (1 + 0.12 * aeroEfficiency);
    const vCircuit = vTarget * kTrack;
    const targetTopGear = getTargetTopGearRatio(numGears);

    // Final Drive calculation anchored to peak HP RPM and target top gear
    const topTotalRatio = (rpmHp * C * 60) / (vCircuit * 1000);
    const rawFd = topTotalRatio / targetTopGear;
    fd = Math.max(AEGO_FINAL_DRIVE_MIN, Math.min(AEGO_FINAL_DRIVE_MAX, rawFd));

    // Calculate actual top gear based on clamped final drive
    const gTop = topTotalRatio / fd;

    // 1st Gear target speed with drivetrain launch modifier kDrive
    const vBase = 90.0;
    const kDrive = drivetrain === 'AWD' ? 0.85 : (drivetrain === 'FWD' ? 1.05 : 1.15);
    const v1 = vBase * kDrive;

    let g1 = (rpmHp * C * 60) / (v1 * fd * 1000);
    if (carParams && (drivetrain === 'FWD' ||
      (drivetrain === 'AWD' && Number.isFinite(carParams.roadAwdRearPercent)))) {
      // Lengthen launch gearing when available driven-axle load cannot support
      // the old fixed-speed first gear. The remaining ratio/powerband guards apply.
      const launchTotal = roadLaunchTotalRatio(carParams, maxTorque, C / (2 * Math.PI));
      if (Number.isFinite(launchTotal) && launchTotal > 0) g1 = Math.min(g1, launchTotal / fd);
    }

    gears = new Array(numGears).fill(0);
    gears[0] = Math.max(1.0, Math.min(6.0, g1), gTop + 0.01 * (numGears - 1));
    gears[numGears - 1] = gTop;

    if (numGears > 1) {
      const numSteps = numGears - 1;
      const rMean = Math.pow(gTop / gears[0], 1 / numSteps);
      const rSpread = Math.min(0.12, Math.max(0.04, (1.0 - rMean) * 0.6));

      const rRaw: number[] = [];
      let prodRaw = 1.0;
      for (let i = 1; i <= numSteps; i++) {
        const offsetFraction = numSteps > 1 ? (i - 1) / (numSteps - 1) - 0.5 : 0;
        const rVal = Math.max(0.55, Math.min(0.92, rMean + rSpread * offsetFraction));
        rRaw.push(rVal);
        prodRaw *= rVal;
      }

      const s = Math.pow(gTop / (gears[0] * prodRaw), 1 / numSteps);
      for (let i = 1; i < numGears; i++) {
        const rAdj = rRaw[i - 1] * s;
        gears[i] = gears[i - 1] * rAdj;
      }
      gears[numGears - 1] = gTop;
    }
  }

  // Secondary Correction Mechanism (FD-First Macro Scaling with Top-Gear Usability Protection)
  if (secondaryCorrection && (secondaryCorrection.simulatedTopSpeed || secondaryCorrection.softMaxSpeed || secondaryCorrection.dragFinishSpeedKmh || dragFinishSpeedKmh)) {
    const { simulatedTopSpeed, softMaxSpeed } = secondaryCorrection;
    const tireRadiusM = C / (2 * Math.PI);
    const topGearIdx = activeGearCount - 1;
    
    // Baseline top speed for highest active gear at Peak HP RPM
    const baselineTopSpeedMs = calcGearSpeed(rpmHp, gears[topGearIdx], fd, tireRadiusM);
    const baselineTopSpeedKmh = baselineTopSpeedMs * 3.6;

    let targetTopSpeedAtPeakHpKmh = baselineTopSpeedKmh;

    // 1. Soft Max Speed Cap Constraint at Redline RPM (converted to Peak HP target)
    if (raceGoal !== 'Drag' && softMaxSpeed && softMaxSpeed > 0 && maxRpm > 0) {
      const maxSpeedAtPeakHpFromSoftCap = softMaxSpeed * (rpmHp / maxRpm);
      targetTopSpeedAtPeakHpKmh = Math.min(targetTopSpeedAtPeakHpKmh, maxSpeedAtPeakHpFromSoftCap);
    }

    // 2. Simulated Top Speed Correction at Peak HP RPM
    if (simulatedTopSpeed && simulatedTopSpeed > 0) {
      const maxSpeedAtPeakHpFromSimulated = (maxRpm && maxRpm > 0)
        ? simulatedTopSpeed * (rpmHp / maxRpm) 
        : simulatedTopSpeed;
      targetTopSpeedAtPeakHpKmh = Math.min(targetTopSpeedAtPeakHpKmh, maxSpeedAtPeakHpFromSimulated);
    }

    if (raceGoal === 'Drag' && dragFinishSpeedKmh && dragFinishSpeedKmh > 0) {
      targetTopSpeedAtPeakHpKmh = dragFinishSpeedKmh;
    }

    // 3. FD-First Macro Scaling + Micro Fine-Tuning
    if (targetTopSpeedAtPeakHpKmh > 0 && Math.abs(targetTopSpeedAtPeakHpKmh - baselineTopSpeedKmh) > 0.1) {
      const targetTopTotalRatio = (rpmHp * C * 60) / (targetTopSpeedAtPeakHpKmh * 1000);
      const baseTopGear = gears[topGearIdx];

      // Primary: scale Final Drive to absorb target top speed changes while preserving gear ratios
      const targetFd = targetTopTotalRatio / baseTopGear;

      if (targetFd >= AEGO_FINAL_DRIVE_MIN && targetFd <= AEGO_FINAL_DRIVE_MAX) {
        // FD fully absorbs the change, keep all individual gears untouched (preserving powerband drops)
        fd = targetFd;
      } else {
        // Clamp FD to game limits [2.0, 6.1] and adjust top gear
        fd = Math.max(AEGO_FINAL_DRIVE_MIN, Math.min(AEGO_FINAL_DRIVE_MAX, targetFd));
        let newGtop = targetTopTotalRatio / fd;

        // Top Gear Usability Guard
        if (topGearIdx > 0 && gears[topGearIdx - 1] > 0) {
          const prevGear = gears[topGearIdx - 1];
          const maxAllowedTopGear = prevGear * 0.90; // Prevent over-compression
          const minAllowedTopGear = prevGear * 0.70; // Prevent cliff drops

          if (newGtop > maxAllowedTopGear) {
            newGtop = maxAllowedTopGear;
          } else if (newGtop < minAllowedTopGear) {
            newGtop = minAllowedTopGear;
          }

          gears[topGearIdx] = newGtop;

          // Re-distribute intermediate gears gently only if top gear had to move
          const numSteps = topGearIdx;
          const rBand = rpmHp > 0 ? rpmT / rpmHp : 0.65;
          const rRedlineHp = (maxRpm && maxRpm > 0) ? rpmHp / maxRpm : 0.85;
          const isTurbo = engineType === 'Turbo' || engineType === 'TwinTurbo';
          const rMin = isTurbo ? Math.max(0.68, rRedlineHp * Math.max(0.80, rBand)) : Math.max(0.62, rRedlineHp * Math.max(0.75, rBand));
          const rMax = Math.min(0.92, rRedlineHp);

          const rRaw: number[] = [];
          let prodRaw = 1.0;
          for (let i = 1; i <= numSteps; i++) {
            const fraction = numSteps > 1 ? (i - 1) / (numSteps - 1) : 0;
            const rVal = rMin + (rMax - rMin) * fraction;
            rRaw.push(rVal);
            prodRaw *= rVal;
          }

          const s = Math.pow(newGtop / (gears[0] * prodRaw), 1 / numSteps);
          for (let i = 1; i < topGearIdx; i++) {
            const rAdj = rRaw[i - 1] * s;
            gears[i] = gears[i - 1] * rAdj;
          }
        } else {
          gears[topGearIdx] = newGtop;
        }

        for (let i = activeGearCount; i < numGears; i++) gears[i] = gears[topGearIdx];
      }
    }
  }

  // Ensure Fallback Values
  if (isNaN(fd) || fd === Infinity || fd === -Infinity || fd === 0) fd = 3.50;
  for (let i = 0; i < gears.length; i++) {
     if (isNaN(gears[i]) || gears[i] === Infinity || gears[i] === -Infinity || gears[i] === 0) gears[i] = 1.0;
  }

  fd = Math.min(AEGO_FINAL_DRIVE_MAX, Math.max(AEGO_FINAL_DRIVE_MIN, fd));

  const roundedFD = Math.round(fd * 100) / 100;
  const roundedGears = gears.map((ratio) => {
    return Math.round(ratio * 100) / 100;
  });

  // Force monotonic decrease and powerband shift RPM bound
  const monotonicLimit = activeGearCount;
  const maxStepRatioRounded = (maxRpm && maxRpm > 0 && raceGoal !== 'Drift' && raceGoal !== 'Drag')
    ? (rpmHp + 50) / maxRpm
    : 0.92;

  const roadLaunchLimited = raceGoal === 'Road' && (drivetrain === 'FWD' ||
    (drivetrain === 'AWD' && Number.isFinite(carParams?.roadAwdRearPercent)));
  const effectiveStepRatio = roadLaunchLimited ? 1 : maxStepRatioRounded;
  for (let i = 1; i < monotonicLimit; i++) {
     const maxAllowedRatio = Math.min(
       Math.round((roundedGears[i - 1] - 0.01) * 100) / 100,
       Math.floor(roundedGears[i - 1] * effectiveStepRatio * 100) / 100
     );
     if (roundedGears[i] > maxAllowedRatio) {
        roundedGears[i] = Math.max(0.40, maxAllowedRatio);
     }
  }

  // Preserve inactive gears only for a legacy profile that still requests them.
  for (let i = activeGearCount; i < roundedGears.length; i++) roundedGears[i] = roundedGears[activeGearCount - 1];

  return {
    finalDrive: roundedFD,
    gears: roundedGears,
    ...dragFinishAvailability(raceGoal, dragFinishSpeedKmh, rpmHp, roundedGears, roundedFD, C / (2 * Math.PI)),
  };
}

/**
 * Resolves aerodynamic downforce for front and rear axles (in kgf).
 * If values are <= 0, triggers automatic derivation based on weight distribution
 * and drivetrain modifier.
 */
export function resolveAeroDownforce(params: TuningCarParams): { front: number; rear: number } {
  const weightKg = params.weight > 0 ? params.weight : 1400;
  const wf = params.weight_distribution > 0 ? params.weight_distribution : 50;
  const wr = 100 - wf;
  const drivetrain = params.drivetrain || 'RWD';

  const fVal = params.aero_downforce_front ?? 0;
  const rVal = params.aero_downforce_rear ?? 0;

  // Drivetrain aero modifier from reference document:
  // RWD: 0.82 (more rear downforce)
  // FWD / AWD: 1.05 (more front downforce)
  const drivetrainModifier = drivetrain === 'RWD' ? 0.82 : 1.05;

  // 1. Both explicit values > 0
  if (fVal > 0 && rVal > 0) {
    return { front: Math.round(fVal * 10) / 10, rear: Math.round(rVal * 10) / 10 };
  }

  const ratio = (wf / wr) * drivetrainModifier;

  // 2. Only front > 0, rear <= 0 -> Derive rear
  if (fVal > 0 && rVal <= 0) {
    const derivedRear = fVal / ratio;
    return { front: Math.round(fVal * 10) / 10, rear: Math.round(derivedRear * 10) / 10 };
  }

  // 3. Only rear > 0, front <= 0 -> Derive front
  if (rVal > 0 && fVal <= 0) {
    const derivedFront = rVal * ratio;
    return { front: Math.round(derivedFront * 10) / 10, rear: Math.round(rVal * 10) / 10 };
  }

  // 4. Both <= 0 -> Derive both from estimated total target downforce
  // Target total downforce = 20% of vehicle weight in lbs (converted to kgf)
  const weightLbs = weightKg * 2.20462;
  const totalTargetLbs = weightLbs * 0.20;
  const totalTargetKgf = totalTargetLbs / 2.20462;

  // Solve system: front / rear = ratio & front + rear = totalTargetKgf
  const derivedRear = totalTargetKgf / (1 + ratio);
  const derivedFront = totalTargetKgf - derivedRear;

  return {
    front: Math.round(derivedFront * 10) / 10,
    rear: Math.round(derivedRear * 10) / 10
  };
}

/**
 * Calculates complete Step3 Chassis Tuning (ARBs, Springs, Ride Height, Damping, Differential).
 * Enforces safety clamping against user-defined slider limits.
 */
export function calculateChassisTuning(
  raceGoal: string,
  carParams: TuningCarParams | null
): ChassisTuningResult {
  if (raceGoal === 'Road' && carParams) carParams = normalizeRoadInputs(carParams);
  // Safe Fallback defaults
  if (raceGoal === 'Rally' && carParams) carParams = rallyCalculationInputs(carParams);
  const weight = carParams && carParams.weight > 0 ? carParams.weight : 1400;
  const wf = carParams && carParams.weight_distribution > 0 ? carParams.weight_distribution : 50;
  const wr = 100 - wf;
  const drivetrain: Drivetrain = carParams?.drivetrain || 'RWD';

  const kMinF = carParams?.spring_front_min ?? 10.0;
  const kMaxF = carParams?.spring_front_max ?? 120.0;
  const kMinR = carParams?.spring_rear_min ?? 10.0;
  const kMaxR = carParams?.spring_rear_max ?? 120.0;

  const hMinF = carParams?.height_front_min ?? 10.0;
  const hMaxF = carParams?.height_front_max ?? 25.0;
  const hMinR = carParams?.height_rear_min ?? 10.0;
  const hMaxR = carParams?.height_rear_max ?? 25.0;

  // Aero resolution
  const aero = carParams ? resolveAeroDownforce(carParams) : { front: 50, rear: 50 };

  let arbF = 1.0;
  let arbR = 1.0;
  let springF = 10.0;
  let springR = 10.0;
  let heightF = 10.0;
  let heightR = 10.0;
  let rebF = 1.0;
  let rebR = 1.0;
  let bumpF = 1.0;
  let bumpR = 1.0;

  let accelF = 0;
  let decelF = 0;
  let accelR = 0;
  let decelR = 0;
  let centerRear = 50;

  const click = 0.5; // Ride height click increment in cm

  if (raceGoal === 'Drift') {
    // 1. Anti-Roll Bars: FH6 RWD guide recommends a soft, close pair rather
    // than an extreme 10/50 split. These are starting points on the game
    // slider, with the front kept slightly softer for counter-steering grip.
    arbF = 1.0 + 64.0 / 3.0;
    arbR = arbF * 1.2;

    // 2. Softened Drift Springs
    springF = weight * (wf / 100) * 0.035;
    springR = weight * (wr / 100) * 0.035;

    // 3. Ride Height
    heightF = hMinF + 1 * click;
    heightR = hMinR + 2 * click;

    // 4. Match the spring's relative slider position, then start bump at 60%.
    const boundedF = Math.min(kMaxF, Math.max(kMinF, springF));
    const boundedR = Math.min(kMaxR, Math.max(kMinR, springR));
    const springFractionF = (boundedF - kMinF) / Math.max(kMaxF - kMinF, 1e-6);
    const springFractionR = (boundedR - kMinR) / Math.max(kMaxR - kMinR, 1e-6);
    rebF = 1 + 19 * springFractionF;
    rebR = 1 + 19 * springFractionR;
    bumpF = rebF * 0.60;
    bumpR = rebR * 0.60;

    // 5. Differential
    if (drivetrain === 'AWD') {
      accelF = 85;
      decelF = 5;
      accelR = 60;
      decelR = 15;
      // FH6 guide's AWD starting range is 70–80% rear bias. Use midpoint.
      centerRear = 75;
    } else if (drivetrain === 'FWD') {
      // FWD cannot use the RWD power-oversteer baseline.  Keep the drift
      // profile usable for handbrake/weight-transfer experiments, but route
      // the locking torque to the driven front axle only.
      accelF = 85;
      decelF = 5;
    } else {
      // FH6 RWD guide gives 75–95% accel and 0–40% decel ranges.
      accelR = 90;
      decelR = 15;
    }

  } else if (raceGoal === 'Rally' || raceGoal === 'DangerSign') {
    // 1. Anti-Roll Bars (Softened 35%)
    const baseArbF = 64.0 * (wf / 100) + 1.0;
    const baseArbR = 64.0 * (wr / 100) + 1.0;
    const isCrossCountry = raceGoal === 'Rally' && carParams?.rallyProfile === 'cross-country';
    arbF = baseArbF * (isCrossCountry ? 0.38 : raceGoal === 'Rally' ? 0.32 : 0.35);
    arbR = baseArbR * (isCrossCountry ? 0.46 : raceGoal === 'Rally' ? 0.32 : 0.35);

    // 2. Springs (Softened 65% of base)
    const baseSpringF = (kMaxF - kMinF) * (wf / 100) + kMinF;
    const baseSpringR = (kMaxR - kMinR) * (wr / 100) + kMinR;
    const springScale = isCrossCountry ? 0.85 : 0.65;
    springF = baseSpringF * springScale;
    springR = baseSpringR * springScale;

    // Dirt benefits from travel; Cross Country trades a little CG for landing support.
    heightF = hMinF + (isCrossCountry || raceGoal === 'DangerSign' ? 1.0 : 0.85) * (hMaxF - hMinF);
    heightR = hMinR + (isCrossCountry || raceGoal === 'DangerSign' ? 1.0 : 0.85) * (hMaxR - hMinR);

    // 4. Damping (40% Bump Ratio for Landing Absorptions)
    const reboundScale = isCrossCountry ? 1.10 : 1.0;
    rebF = (14.0 * (wf / 100) + 1.0) * reboundScale;
    rebR = (14.0 * (wr / 100) + 1.0) * reboundScale;
    const bumpRatio = isCrossCountry ? 0.50 : 0.40;
    bumpF = rebF * bumpRatio;
    bumpR = rebR * bumpRatio;

    // 5. Differential
    if (drivetrain === 'AWD') {
      const lockBoost = raceGoal === 'Rally' && carParams?.rallyProfile === 'cross-country' ? 10 : 0;
      accelF = 40 + lockBoost;
      decelF = 10 + lockBoost;
      accelR = 80 + lockBoost;
      decelR = 25 + lockBoost;
      centerRear = isCrossCountry ? 55 : 65;
    } else if (drivetrain === 'FWD') {
      accelF = 60 + (raceGoal === 'Rally' && carParams?.rallyProfile === 'cross-country' ? 10 : 0);
      decelF = 15 + (raceGoal === 'Rally' && carParams?.rallyProfile === 'cross-country' ? 5 : 0);
    } else {
      accelR = 75 + (raceGoal === 'Rally' && carParams?.rallyProfile === 'cross-country' ? 10 : 0);
      decelR = 25 + (raceGoal === 'Rally' && carParams?.rallyProfile === 'cross-country' ? 5 : 0);
    }

  } else if (raceGoal === 'Drag') {
    // Forza Guide's FH6 drag baseline uses stiff bars, soft springs, maximum
    // ride height, and opposite-corner launch damping.  Drivetrain-specific
    // diff targets reflect which axle can accept power after load transfer.
    if (drivetrain === 'FWD') {
      // FWD loses front normal load under acceleration. Keep the front low,
      // use a softer driven axle spring, and resist front extension/rear squat.
      arbF = 55.0;
      arbR = 65.0;
      springF = kMinF + 0.15 * (kMaxF - kMinF);
      springR = kMinR + 0.25 * (kMaxR - kMinR);
      heightF = hMinF;
      heightR = hMaxR;
      rebF = 8.0;
      bumpF = 12.0;
      rebR = 8.0;
      bumpR = 10.0;
      accelF = 85;
      decelF = 0;
    } else if (drivetrain === 'RWD') {
      arbF = 65.0;
      arbR = 65.0;
      springF = kMinF + 0.20 * (kMaxF - kMinF);
      springR = kMinR + 0.20 * (kMaxR - kMinR);
      heightF = hMaxF;
      heightR = hMaxR;
      rebF = 3.0;
      bumpF = 12.0;
      rebR = 12.0;
      bumpR = 4.0;
      accelR = 85;
      decelR = 0;
    } else {
      arbF = 65.0;
      arbR = 65.0;
      springF = kMinF + 0.20 * (kMaxF - kMinF);
      springR = kMinR + 0.20 * (kMaxR - kMinR);
      heightF = hMaxF;
      heightR = hMaxR;
      rebF = 3.0;
      bumpF = 12.0;
      rebR = 12.0;
      bumpR = 4.0;
      accelF = 85;
      decelF = 0;
      accelR = 65;
      decelR = 10;
      centerRear = 75;
    }

  } else {
    // Road / Circuit (Default)
    const roadFront = Number.isFinite(wf) ? Math.max(1, Math.min(99, wf)) / 100 : 0.5;
    const roadRear = 1 - roadFront;
    // 1. Anti-Roll Bars
    if (drivetrain === 'AWD') {
      // 1/65 Meta Strategy for AWD
      arbF = Math.min(5.0, 1.0 + (wf / 100) * 4.0);
      arbR = Math.max(50.0, 65.0 - (100 - wr) * 0.3);
    } else if (drivetrain === 'FWD') {
      // Keep the driven/steered front axle compliant; a bounded rear roll bias
      // helps rotation without copying the AWD 1/65 extreme (engineering prior).
      arbF = 1 + 32 * roadFront;
      arbR = 1 + 64 * Math.min(0.80, roadRear + 0.25);
    } else {
      arbF = 64.0 * (wf / 100) + 1.0;
      arbR = 64.0 * (wr / 100) + 1.0;
    }

    // 2. Springs with Aero Compensation
    const baseSpringF = (kMaxF - kMinF) * (wf / 100) + kMinF;
    const baseSpringR = (kMaxR - kMinR) * (wr / 100) + kMinR;
    const deltaKf = (aero.front / 10) * 0.5;
    const deltaKr = (aero.rear / 25) * 0.5;
    springF = baseSpringF + deltaKf;
    springR = baseSpringR + deltaKr;
    if (drivetrain === 'FWD') {
      // Shift 10 percentage points of each slider span toward front compliance
      // and rear support. Slider fraction is not physical roll stiffness.
      springF = kMinF + (kMaxF - kMinF) * Math.max(0.10, roadFront - 0.10) + deltaKf;
      springR = kMinR + (kMaxR - kMinR) * Math.min(0.90, roadRear + 0.10) + deltaKr;
    }

    // 3. Ride Height (+3 clicks above min)
    heightF = hMinF + 3 * click;
    heightR = hMinR + 3 * click;

    // 4. Damping (60% Golden Bump Ratio)
    rebF = 19.0 * (wf / 100) + 1.0;
    rebR = 19.0 * (wr / 100) + 1.0;
    bumpF = rebF * 0.60;
    bumpR = rebR * 0.60;
    if (drivetrain === 'FWD') {
      // c_critical is proportional to sqrt(k*m). This is a relative slider
      // correction only; game damper sliders are not SI damping coefficients.
      rebF = (19 * roadFront + 1) * Math.sqrt(springF / Math.max(1, baseSpringF + deltaKf));
      rebR = (19 * roadRear + 1) * Math.sqrt(springR / Math.max(1, baseSpringR + deltaKr));
      bumpF = rebF * 0.60;
      bumpR = rebR * 0.60;
    }

    // 5. Differential
    if (drivetrain === 'FWD') {
      // ForzaTune's FH6 starting range is 20-30 acceleration, 0-10 deceleration.
      // Prefer its controllable midpoint over conflicting high-lock meta claims.
      accelF = 25;
      decelF = 5;
    } else if (drivetrain === 'RWD') {
      accelR = Math.min(65, Math.max(40, 40 + (wr - 50) * 0.5));
      decelR = 20;
    } else {
      accelF = 15;
      decelF = 0;
      accelR = 75;
      decelR = 15;
      centerRear = getRoadAwdRearPercent(carParams);
    }
  }

  // Safety Clamping & Precision Rounding
  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
  const r1 = (n: number) => Math.round(n * 10) / 10;

  return {
    arb: {
      front: r1(clamp(arbF, 1.0, 65.0)),
      rear: r1(clamp(arbR, 1.0, 65.0))
    },
    springs: {
      front: r1(clamp(springF, kMinF, kMaxF)),
      rear: r1(clamp(springR, kMinR, kMaxR)),
      heightF: r1(clamp(heightF, hMinF, hMaxF)),
      heightR: r1(clamp(heightR, hMinR, hMaxR))
    },
    damping: {
      reboundF: r1(clamp(rebF, 1.0, 20.0)),
      reboundR: r1(clamp(rebR, 1.0, 20.0)),
      bumpF: r1(clamp(bumpF, 1.0, 20.0)),
      bumpR: r1(clamp(bumpR, 1.0, 20.0))
    },
    diff: {
      accelF: r1(clamp(accelF, 0, 100)),
      decelF: r1(clamp(decelF, 0, 100)),
      accelR: r1(clamp(accelR, 0, 100)),
      decelR: r1(clamp(decelR, 0, 100)),
      centerRear: r1(clamp(centerRear, raceGoal === 'Road' && drivetrain === 'AWD' ? 0 : 10,
        raceGoal === 'Road' && drivetrain === 'AWD' ? 100 : 90))
    }
  };
}

export type Season = 'Summer' | 'Autumn' | 'Spring' | 'Winter';

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

/**
 * Calculates static cold tire pressures, target hot pressure, and alignment geometry (Camber/Toe/Caster).
 * 
 * @param discipline Race discipline ('Road' | 'Drift' | 'Rally' | 'Drag')
 * @param season Season ('Summer' | 'Autumn' | 'Spring' | 'Winter')
 * @param params Vehicle parameters
 */
export function calculateStaticTireAlignment(
  discipline: string,
  season: Season = 'Summer',
  params: TuningCarParams | null
): StaticTireAlignResult {
  const M = params && params.weight > 0 ? params.weight : 1350;
  const Wf = (params && params.weight_distribution > 0 ? params.weight_distribution : 54) / 100.0;
  const Wr = 1.0 - Wf;
  const drivetrain = params?.drivetrain || 'AWD';

  // Tire specs from carParams
  const fw = params?.frontTireWidth || 245;
  const fa = params?.frontTireAspect || 40;
  const rw = params?.rearTireWidth || 275;
  const ra = params?.rearTireAspect || 35;

  const hwF = Math.round(fw * (fa / 100.0) * 10) / 10;
  const hwR = Math.round(rw * (ra / 100.0) * 10) / 10;

  // Season bias
  const deltaPSeason = (season === 'Spring' || season === 'Winter') ? 0.5 : -0.5;

  // Drive bias
  let driveBiasF = 0.0;
  let driveBiasR = 0.0;
  if (drivetrain === 'FWD') {
    driveBiasF = 1.5;
    driveBiasR = -0.5;
  } else if (drivetrain === 'RWD') {
    driveBiasF = 0.5;
    driveBiasR = 0.0;
  } else {
    driveBiasF = 0.2;
    driveBiasR = 0.0;
  }

  let targetPhot = 32.5;
  let pcF = 0;
  let pcR = 0;
  let camberF = 0;
  let camberR = 0;
  let toeF = '+0.1°';
  let toeR = '-0.1°';
  let caster = 6.0;

  const normalizedDisc = discipline.toLowerCase();

  if (normalizedDisc === 'drift') {
    targetPhot = 21.0;
    pcF = 32.0 + 2.0 * ((M * Wf) / 1000) + deltaPSeason;
    pcR = 19.5 + 1.0 * ((M * Wr) / 1000) + deltaPSeason;

    camberF = -4.8;
    camberR = -0.5;
    toeF = '+1.2°';
    toeR = '-0.3°';
    caster = 7.0;
  } else if (normalizedDisc === 'rally' || normalizedDisc === 'dangersign') {
    targetPhot = normalizedDisc === 'rally' && params?.rallyProfile === 'cross-country' ? 28.5 : 27.5;
    pcF = 22.0 + 2.0 * ((M * Wf) / 1000) + 0.02 * hwF + deltaPSeason;
    pcR = 21.5 + 2.0 * ((M * Wr) / 1000) + 0.02 * hwR + deltaPSeason;

    camberF = normalizedDisc === 'rally' && params?.rallyProfile === 'cross-country' ? -0.8 : -1.3;
    camberR = normalizedDisc === 'rally' && params?.rallyProfile === 'cross-country' ? -0.5 : -0.8;
    toeF = normalizedDisc === 'rally' && params?.rallyProfile === 'cross-country' ? '0.0°' : '+0.2°';
    toeR = '0.0°';
    caster = 6.0;
  } else if (normalizedDisc === 'drag') {
    targetPhot = 23.5;
    // RWD/AWD guidance starts high front and low driven-rear pressure. FWD
    // reverses that allocation to protect its driven front axle. These are
    // engineering priors; telemetry owns compound and temperature fit.
    if (drivetrain === 'FWD') {
      pcF = 15.0 + 1.5 * ((M * Wf) / 1000) + deltaPSeason;
      pcR = 38.0 + deltaPSeason;
    } else {
      pcF = 38.0 + deltaPSeason;
      pcR = 15.0 + 1.5 * ((M * Wr) / 1000) + deltaPSeason;
    }

    camberF = 0.0;
    camberR = -0.1;
    toeF = '0.0°';
    toeR = '0.0°';
    caster = 7.0;
  } else {
    // Default Road / Circuit
    targetPhot = 32.5;
    pcF = 28.5 + 2.5 * ((M * Wf) / 1000 - 0.7) - 0.005 * (fw - 245) + driveBiasF + deltaPSeason;
    pcR = 28.0 + 2.5 * ((M * Wr) / 1000 - 0.7) - 0.005 * (rw - 245) + driveBiasR + deltaPSeason;

    camberF = -Number((1.5 + 0.8 * Wf + 0.2 * 1.0).toFixed(1));
    camberR = -Number((0.8 + 0.6 * Wr + 0.2 * 1.0).toFixed(1));
    toeF = '+0.1°';
    toeR = '-0.1°';
    caster = Number((5.0 + 2.0 * Wf).toFixed(1));
  }

  const r1 = (n: number) => Math.round(n * 10) / 10;

  return {
    pcF: r1(pcF),
    pcR: r1(pcR),
    targetPhot: r1(targetPhot),
    seasonBias: r1(deltaPSeason),
    camber: {
      front: r1(camberF),
      rear: r1(camberR)
    },
    toe: {
      front: toeF,
      rear: toeR
    },
    caster: r1(caster),
    hwF,
    hwR
  };
}


