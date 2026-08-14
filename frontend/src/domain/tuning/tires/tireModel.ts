import type { DevSurface, DevTireOutput } from '../../../utils/tuningMath_dev';
import { DEV_SURFACE_MULTIPLIERS, DEV_TIRE_PRIORS } from '../constants';

export interface FrictionEllipseInput {
  muLongitudinal: number;
  muLateral: number;
  normalForceN: number;
  longitudinalDemandN: number;
  lateralDemandN: number;
}

export interface FrictionEllipseOutput {
  maxLongitudinalForceN: number;
  maxLateralForceN: number;
  utilization: number;
  feasible: boolean;
}

const round = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function getDevTirePrior(tireType: string | undefined, surface: DevSurface): DevTireOutput {
  const compound = tireType && DEV_TIRE_PRIORS[tireType] ? tireType : 'Default';
  const base = DEV_TIRE_PRIORS[compound];
  const surfaceFactor = DEV_SURFACE_MULTIPLIERS[surface];
  return {
    compound,
    surface,
    muLongitudinal: round(base.muLongitudinal * surfaceFactor.muLongitudinal),
    muLateral: round(base.muLateral * surfaceFactor.muLateral),
    temperatureMultiplier: base.temperatureMultiplier ?? 1.0,
    pressureMultiplier: base.pressureMultiplier ?? 1.0,
    loadSensitivity: base.loadSensitivity ?? 0.70,
    peakSlipRatio: base.peakSlipRatio ?? (compound === 'Drag' ? 0.08 : compound === 'Drift' ? 0.12 : 0.10),
    peakSlipAngleDeg: base.peakSlipAngleDeg ?? (compound === 'Drift' ? 8.0 : 6.5),
    source: 'calibration-prior'
  };
}

const calculateTerm = (demand: number, capacity: number): number => {
  const absDemand = Math.abs(demand);
  if (absDemand === 0) return 0;
  if (capacity <= 0) return Infinity;
  return absDemand / capacity;
};

export function calculateFrictionEllipse(input: FrictionEllipseInput): FrictionEllipseOutput {
  const normalForceN = Math.max(0, Number.isFinite(input.normalForceN) ? input.normalForceN : 0);
  const muLongitudinal = Math.max(0, Number.isFinite(input.muLongitudinal) ? input.muLongitudinal : 0);
  const muLateral = Math.max(0, Number.isFinite(input.muLateral) ? input.muLateral : 0);
  const maxLongitudinalForceN = muLongitudinal * normalForceN;
  const maxLateralForceN = muLateral * normalForceN;
  const longitudinalDemandN = Number.isFinite(input.longitudinalDemandN) ? input.longitudinalDemandN : 0;
  const lateralDemandN = Number.isFinite(input.lateralDemandN) ? input.lateralDemandN : 0;

  const longitudinalTerm = calculateTerm(longitudinalDemandN, maxLongitudinalForceN);
  const lateralTerm = calculateTerm(lateralDemandN, maxLateralForceN);

  let utilization = 0;
  if (!Number.isFinite(longitudinalTerm) || !Number.isFinite(lateralTerm)) {
    utilization = Infinity;
  } else {
    utilization = Math.sqrt(longitudinalTerm ** 2 + lateralTerm ** 2);
  }

  return {
    maxLongitudinalForceN,
    maxLateralForceN,
    utilization,
    feasible: Number.isFinite(utilization) && utilization <= 1.0
  };
}
