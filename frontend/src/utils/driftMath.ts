/**
 * Drift Dynamics Engine & Telemetry Evaluation Utilities (Pure Functions)
 * Single Source of Truth for Drift Dynamics Calculations.
 *
 * Compliance:
 * 1. Zero React component dependencies or global side-effects.
 * 2. Quality levels are represented as integers (1 ~ 5).
 * 3. Risk levels are represented as integers (1 ~ 4).
 * 4. Operation events use readable placeholder string constants.
 */

// ── Operation Event Placeholders ─────────────────────────────────────────────
export const DRIFT_EVENT_HANDBRAKE = 'EVENT_HANDBRAKE' as const;
export const DRIFT_EVENT_CLUTCH = 'EVENT_CLUTCH' as const;
export const DRIFT_EVENT_BRAKE = 'EVENT_BRAKE' as const;
export const DRIFT_EVENT_THROTTLE = 'EVENT_THROTTLE' as const;
export const DRIFT_EVENT_COUNTER = 'EVENT_COUNTER' as const;

export type DriftOperationEvent =
  | typeof DRIFT_EVENT_HANDBRAKE
  | typeof DRIFT_EVENT_CLUTCH
  | typeof DRIFT_EVENT_BRAKE
  | typeof DRIFT_EVENT_THROTTLE
  | typeof DRIFT_EVENT_COUNTER;

// ── Flow Quality Integer Scale (1 ~ 5) ───────────────────────────────────────
export const DRIFT_FLOW_BUILD = 1 as const;
export const DRIFT_FLOW_NORMAL = 2 as const;
export const DRIFT_FLOW_CHASE = 3 as const;
export const DRIFT_FLOW_SMOOTH = 4 as const;
export const DRIFT_FLOW_LOCKED = 5 as const;

export type DriftFlowQuality =
  | typeof DRIFT_FLOW_BUILD
  | typeof DRIFT_FLOW_NORMAL
  | typeof DRIFT_FLOW_CHASE
  | typeof DRIFT_FLOW_SMOOTH
  | typeof DRIFT_FLOW_LOCKED;

// ── Spin Risk Level Integer Scale (1 ~ 4) ────────────────────────────────────
export const SPIN_RISK_SAFE = 1 as const;
export const SPIN_RISK_EDGE = 2 as const;
export const SPIN_RISK_RISK = 3 as const;
export const SPIN_RISK_MAX = 4 as const;

export type SpinRiskLevel =
  | typeof SPIN_RISK_SAFE
  | typeof SPIN_RISK_EDGE
  | typeof SPIN_RISK_RISK
  | typeof SPIN_RISK_MAX;

// ── Math Helpers ─────────────────────────────────────────────────────────────
export function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0.0, 1.0);
}

/**
 * Calculate vehicle drift angle in degrees from planar velocity vectors.
 *
 * @param vx Velocity along X-axis (m/s)
 * @param vz Velocity along Z-axis (m/s)
 * @returns Drift angle in degrees [-90.0, 90.0]
 */
export function calculateDriftAngle(vx: number, vz: number): number {
  const speedPlane = Math.hypot(vx, vz);
  if (speedPlane <= 0.5) {
    return 0.0;
  }
  const angleRad = Math.atan2(vx, vz);
  const angleDeg = (angleRad * 180.0) / Math.PI;
  if (!Number.isFinite(angleDeg)) {
    return 0.0;
  }
  return clamp(angleDeg, -90.0, 90.0);
}

/**
 * Calculate effective counter-steer percentage based on drift angle & steering direction.
 * In this telemetry convention, counter-steer occurs when displayAngle and steerPct
 * have the same sign (pointing to the same direction during drift).
 *
 * @param displayAngle Current displayed drift angle in degrees
 * @param steerPct Current steering input (-100.0 to 100.0)
 * @returns Counter-steer percentage (0.0 to 100.0)
 */
export function calculateCounterSteer(displayAngle: number, steerPct: number): number {
  const absAngle = Math.abs(displayAngle);
  const countering = absAngle >= 8.0 && displayAngle * steerPct > 0.0;

  if (!countering) {
    return 0.0;
  }

  const angleFactor = clamp((absAngle - 8.0) / 42.0, 0.0, 1.0);
  const targetCounter = Math.abs(steerPct) * (0.45 + 0.55 * angleFactor);
  return clamp(targetCounter, 0.0, 100.0);
}

export interface EvaluateFlowInput {
  absAngle: number;
  prevAngleAbs: number;
  rearSlip: number;
  prevRearSlip: number;
  steerPct: number;
  prevSteerPct: number;
  accelPct: number;
  prevAccelPct: number;
  speedKmh: number;
  holdSeconds: number;
  currentFlowPct: number;
  dt?: number;
}

export interface EvaluateFlowResult {
  flowPct: number;
  quality: DriftFlowQuality;
  stabilityScore: number;
}

/**
 * Evaluate continuous Drift Flow Score (0 ~ 100) and integer Quality rating (1 ~ 5).
 * Rewards angle stability, slip stability, steady throttle, and counter-steer.
 */
export function evaluateDriftFlow(input: EvaluateFlowInput): EvaluateFlowResult {
  const {
    absAngle,
    prevAngleAbs,
    rearSlip,
    prevRearSlip,
    steerPct,
    prevSteerPct,
    accelPct,
    prevAccelPct,
    speedKmh,
    holdSeconds,
    currentFlowPct,
  } = input;

  const countering = absAngle >= 8.0 && input.absAngle > 0.0; // General drift state check
  const counterPct = calculateCounterSteer(absAngle, steerPct);

  const angleDelta = Math.abs(absAngle - prevAngleAbs);
  const slipDelta = Math.abs(rearSlip - prevRearSlip);
  const steerDelta = Math.abs(steerPct - prevSteerPct);
  const accelDelta = Math.abs(accelPct - prevAccelPct);

  const angleScore = clamp(((absAngle - 8.0) / 42.0) * 36.0, 0.0, 36.0);
  const slipScore = clamp(((rearSlip - 0.25) / 1.45) * 20.0, 0.0, 20.0);
  const throttleScore = clamp(((accelPct - 10.0) / 55.0) * 14.0, 0.0, 14.0);
  const counterScore = countering ? clamp((counterPct / 100.0) * 12.0, 0.0, 12.0) : 0.0;

  const holdingDrift = speedKmh > 14 && absAngle >= 12 && rearSlip >= 0.25;

  let stabilityScore = 0.0;
  if (holdingDrift) {
    stabilityScore += clamp((1.0 - angleDelta / 7.5) * 9.0, 0.0, 9.0);
    stabilityScore += clamp((1.0 - slipDelta / 0.42) * 7.0, 0.0, 7.0);
    stabilityScore += clamp((1.0 - accelDelta / 26.0) * 5.0, 0.0, 5.0);
  }
  const calmBonus = clamp(((holdSeconds - 1.0) / 5.0) * 8.0, 0.0, 8.0);

  let chaosPenalty = 0.0;
  chaosPenalty += clamp(((angleDelta - 8.0) / 16.0) * 10.0, 0.0, 10.0);
  chaosPenalty += clamp(((slipDelta - 0.45) / 0.85) * 10.0, 0.0, 10.0);
  chaosPenalty += clamp(((steerDelta - 22.0) / 55.0) * 7.0, 0.0, 7.0);
  if (speedKmh < 10) {
    chaosPenalty += 18.0;
  }

  let targetFlow =
    angleScore + slipScore + throttleScore + counterScore + stabilityScore + calmBonus - chaosPenalty;
  targetFlow = clamp(targetFlow, 0.0, 100.0);

  const flowPct = clamp(lerp(currentFlowPct, targetFlow, 0.22), 0.0, 100.0);

  let quality: DriftFlowQuality = DRIFT_FLOW_BUILD;
  if (flowPct >= 82 && stabilityScore >= 11.5) {
    quality = DRIFT_FLOW_LOCKED; // 5
  } else if (flowPct >= 66) {
    quality = DRIFT_FLOW_SMOOTH; // 4
  } else if (holdingDrift && chaosPenalty >= 14) {
    quality = DRIFT_FLOW_CHASE; // 3
  } else if (holdingDrift) {
    quality = DRIFT_FLOW_NORMAL; // 2
  } else {
    quality = DRIFT_FLOW_BUILD; // 1
  }

  return { flowPct, quality, stabilityScore };
}

export interface EvaluateRiskInput {
  absAngle: number;
  angleDelta: number;
  rearSlip: number;
  slipDelta: number;
  counterPct: number;
  accelPct: number;
  speedKmh: number;
  flowQuality: DriftFlowQuality;
  countering: boolean;
  currentSpinRisk: number;
}

export interface EvaluateRiskResult {
  spinRisk: number;
  level: SpinRiskLevel;
}

/**
 * Evaluate Limit Edge & Spin Risk Meter (0 ~ 100) and integer Risk Level (1 ~ 4).
 */
export function evaluateSpinRisk(input: EvaluateRiskInput): EvaluateRiskResult {
  const {
    absAngle,
    angleDelta,
    rearSlip,
    slipDelta,
    counterPct,
    accelPct,
    speedKmh,
    flowQuality,
    countering,
    currentSpinRisk,
  } = input;

  const counterNeed = clamp(((absAngle - 18.0) / 42.0) * 100.0, 0.0, 100.0);
  const counterDeficit = Math.max(0.0, counterNeed - counterPct);

  let risk = 0.0;
  risk += clamp(((absAngle - 14.0) / 44.0) * 50.0, 0.0, 50.0);
  risk += clamp(((rearSlip - 0.45) / 1.35) * 20.0, 0.0, 20.0);
  risk += clamp(((angleDelta - 3.5) / 14.0) * 12.0, 0.0, 12.0);
  risk += clamp(((slipDelta - 0.18) / 0.75) * 10.0, 0.0, 10.0);
  risk += clamp(((counterDeficit - 8.0) / 70.0) * 10.0, 0.0, 10.0);

  if (accelPct >= 62 && rearSlip >= 0.72 && absAngle >= 22) {
    risk += clamp(((accelPct - 62.0) / 38.0) * 8.0, 0.0, 8.0);
  }
  if (speedKmh < 18 && absAngle >= 30) {
    risk += clamp(((30.0 - speedKmh) / 20.0) * 8.0, 0.0, 8.0);
  }
  if (
    (flowQuality === DRIFT_FLOW_SMOOTH || flowQuality === DRIFT_FLOW_LOCKED) &&
    countering
  ) {
    risk -= clamp((currentSpinRisk - 58.0) / 34.0 * 8.0, 0.0, 8.0);
  }
  if (speedKmh < 8 && absAngle < 16) {
    risk *= 0.35;
  }

  const targetRisk = clamp(risk, 0.0, 100.0);
  const spinRisk = clamp(lerp(currentSpinRisk, targetRisk, 0.30), 0.0, 100.0);

  let level: SpinRiskLevel = SPIN_RISK_SAFE;
  if (spinRisk >= 84) {
    level = SPIN_RISK_MAX; // 4
  } else if (spinRisk >= 58) {
    level = SPIN_RISK_RISK; // 3
  } else if (spinRisk >= 28) {
    level = SPIN_RISK_EDGE; // 2
  } else {
    level = SPIN_RISK_SAFE; // 1
  }

  return { spinRisk, level };
}

export interface EvaluateSpinSaveInput {
  spinRisk: number;
  absAngle: number;
  speedKmh: number;
  rearSlip: number;
  armed: boolean;
  peakRisk: number;
  peakAngle: number;
  recoverFrames: number;
  cooldown: number;
}

export interface EvaluateSpinSaveResult {
  armed: boolean;
  triggered: boolean;
  peakRisk: number;
  peakAngle: number;
  recoverFrames: number;
  cooldown: number;
}

/**
 * State machine for Spin Save detection. Arms when spin risk is dangerously high,
 * then triggers when driver successfully recovers vehicle stability.
 */
export function evaluateSpinSave(input: EvaluateSpinSaveInput): EvaluateSpinSaveResult {
  let { armed, peakRisk, peakAngle, recoverFrames, cooldown } = input;
  const { spinRisk, absAngle, speedKmh, rearSlip } = input;

  let triggered = false;

  if (cooldown > 0) {
    cooldown -= 1;
  }

  const spinSaveDanger =
    spinRisk >= 76 && absAngle >= 24 && speedKmh > 12 && rearSlip >= 0.55;

  if (spinSaveDanger) {
    armed = true;
    peakRisk = Math.max(peakRisk, spinRisk);
    peakAngle = Math.max(peakAngle, absAngle);
    recoverFrames = 0;
  }

  if (armed) {
    peakRisk = Math.max(peakRisk, spinRisk);
    peakAngle = Math.max(peakAngle, absAngle);

    const recoveredFromLimit =
      peakRisk >= 78 &&
      spinRisk <= 42 &&
      absAngle >= 8 &&
      absAngle <= 36 &&
      speedKmh > 12 &&
      rearSlip >= 0.25;

    if (recoveredFromLimit) {
      recoverFrames += 1;
    } else {
      recoverFrames = 0;
    }

    if (recoverFrames >= 3 && cooldown <= 0) {
      triggered = true;
      cooldown = 150; // Cooldown frames (~2.5s)
      armed = false;
      peakRisk = 0.0;
      peakAngle = 0.0;
      recoverFrames = 0;
    }
  }

  if (speedKmh < 8 || absAngle < 5) {
    armed = false;
    peakRisk = 0.0;
    peakAngle = 0.0;
    recoverFrames = 0;
  }

  return { armed, triggered, peakRisk, peakAngle, recoverFrames, cooldown };
}

export interface DetectPopupsInput {
  handbrakePct: number;
  prevHandbrakePct: number;
  clutchPct: number;
  prevClutchPct: number;
  brakePct: number;
  prevBrakePct: number;
  accelPct: number;
  prevAccelPct: number;
  steerPct: number;
  prevSteerPct: number;
  counterPct: number;
  speedKmh: number;
  absAngle: number;
}

/**
 * Detect instantaneous driver operation events for reactive popups & input flashes.
 * Returns an array of readable placeholder string constants.
 */
export function detectOperationPopups(input: DetectPopupsInput): DriftOperationEvent[] {
  const {
    handbrakePct,
    prevHandbrakePct,
    clutchPct,
    prevClutchPct,
    brakePct,
    prevBrakePct,
    accelPct,
    prevAccelPct,
    prevSteerPct,
    counterPct,
    speedKmh,
    absAngle,
  } = input;

  const events: DriftOperationEvent[] = [];

  const handbrakeHit = handbrakePct >= 38 && prevHandbrakePct < 18 && speedKmh > 8;
  const clutchKick = clutchPct >= 58 && prevClutchPct < 22 && accelPct >= 18 && speedKmh > 8;
  const footBrake = brakePct >= 48 && prevBrakePct < 20 && handbrakePct < 18 && speedKmh > 10;
  const throttlePunch = accelPct >= 68 && prevAccelPct < 28 && speedKmh > 8 && absAngle >= 12;
  const counterSnap = counterPct >= 58 && Math.abs(prevSteerPct) < 34 && absAngle >= 24 && speedKmh > 12;

  if (handbrakeHit) events.push(DRIFT_EVENT_HANDBRAKE);
  if (clutchKick) events.push(DRIFT_EVENT_CLUTCH);
  if (footBrake) events.push(DRIFT_EVENT_BRAKE);
  if (throttlePunch) events.push(DRIFT_EVENT_THROTTLE);
  if (counterSnap) events.push(DRIFT_EVENT_COUNTER);

  return events;
}
