import type { DevRaceGoal, DevSurface } from '../../utils/tuningMath_dev';

export interface TirePrior {
  muLongitudinal: number;
  muLateral: number;
  temperatureMultiplier?: number;
  pressureMultiplier?: number;
  loadSensitivity?: number;
  peakSlipRatio?: number;
  peakSlipAngleDeg?: number;
}

export const DEV_TIRE_PRIORS: Record<string, TirePrior> = {
  Stock: { muLongitudinal: 0.85, muLateral: 0.85 },
  Street: { muLongitudinal: 0.95, muLateral: 0.95 },
  Sport: { muLongitudinal: 1.05, muLateral: 1.05 },
  'Semi-Slick': { muLongitudinal: 1.15, muLateral: 1.15 },
  Slick: { muLongitudinal: 1.15, muLateral: 1.15 },
  Rally: { muLongitudinal: 1.05, muLateral: 1.02 },
  'Off-Road': { muLongitudinal: 1.02, muLateral: 1.00 },
  Snow: { muLongitudinal: 1.05, muLateral: 1.00 },
  Drag: { muLongitudinal: 1.40, muLateral: 0.70 },
  Drift: { muLongitudinal: 1.05, muLateral: 0.82 },
  Default: { muLongitudinal: 1.00, muLateral: 1.00 }
};

export const DEV_SURFACE_MULTIPLIERS: Record<DevSurface, TirePrior> = {
  tarmac: { muLongitudinal: 1.00, muLateral: 1.00 },
  gravel: { muLongitudinal: 0.78, muLateral: 0.82 },
  snow: { muLongitudinal: 0.62, muLateral: 0.66 },
  dragStrip: { muLongitudinal: 1.08, muLateral: 0.92 }
};

export const DEV_CALIBRATION_METADATA = {
  version: 'calibration-prior/v1',
  source: 'default' as const,
  gameBuild: 'unknown' as const,
  status: 'unverified' as const
};

export interface DevChassisProfile {
  frontArb: number;
  rearArb: number;
}

export const DEV_CHASSIS_PROFILES: Record<DevRaceGoal, DevChassisProfile> = {
  Road: { frontArb: 0.62, rearArb: 0.78 },
  Rally: { frontArb: 0.42, rearArb: 0.50 },
  Drag: { frontArb: 0.12, rearArb: 0.95 },
  Drift: { frontArb: 0.30, rearArb: 0.90 }
};

export interface DevAlignmentProfile {
  hot: number;
  frontCamber: number;
  rearCamber: number;
  frontToe: number;
  rearToe: number;
  caster: number;
}

export const DEV_ALIGNMENT_PROFILES: Record<DevRaceGoal, DevAlignmentProfile> = {
  Road: { hot: 30.0, frontCamber: -1.5, rearCamber: -0.8, frontToe: 0.00, rearToe: 0.05, caster: 6.5 },
  Rally: { hot: 27.5, frontCamber: -1.3, rearCamber: -0.8, frontToe: 0.02, rearToe: 0.08, caster: 5.5 },
  Drag: { hot: 23.5, frontCamber: 0.0, rearCamber: -0.1, frontToe: 0.00, rearToe: 0.00, caster: 5.0 },
  Drift: { hot: 24.0, frontCamber: -3.5, rearCamber: -0.8, frontToe: -0.10, rearToe: 0.15, caster: 7.0 }
};
