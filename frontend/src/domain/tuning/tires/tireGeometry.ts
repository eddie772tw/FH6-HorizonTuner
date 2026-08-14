/**
 * Tire Geometry and Radial Vertical Stiffness Prior Foundation (Phase 4B).
 *
 * Provides pure mathematical functions to compute tire dimensional metrics:
 * - Sidewall height (mm, m)
 * - Rim diameter (mm, m)
 * - Overall tire diameter (mm, m)
 * - Static rolling radius (mm, m)
 * - Rolling circumference (m)
 * from standard metric tire designations (section width in mm, aspect ratio %, rim diameter in inches).
 *
 * Also provides an empirical, geometry-based radial vertical stiffness prior (N/m).
 *
 * NOTE: All vertical stiffness values are heuristic engineering calibration priors.
 * They are NOT calibrated to Forza Horizon 6 in-game physics ground truth and must
 * not be presented as live game physics constants.
 */

export interface TireGeometryInput {
  /** Nominal section width in millimeters (e.g. 245) */
  widthMm?: number;
  /** Aspect ratio as percentage (e.g. 40 for 40%) or decimal fraction (e.g. 0.40) */
  aspectRatio?: number;
  /** Rim diameter in inches (e.g. 18) */
  rimDiameterIn?: number;
}

export interface TireGeometryOutput {
  /** Section width in millimeters */
  widthMm: number;
  /** Aspect ratio percentage (e.g. 40) */
  aspectRatio: number;
  /** Rim diameter in inches */
  rimDiameterIn: number;
  /** Single sidewall height in millimeters */
  sidewallHeightMm: number;
  /** Single sidewall height in meters */
  sidewallHeightM: number;
  /** Rim diameter in millimeters */
  rimDiameterMm: number;
  /** Rim diameter in meters */
  rimDiameterM: number;
  /** Overall outer tire diameter in millimeters */
  overallDiameterMm: number;
  /** Overall outer tire diameter in meters */
  overallDiameterM: number;
  /** Outer tire radius in millimeters */
  tireRadiusMm: number;
  /** Outer tire radius in meters */
  tireRadiusM: number;
  /** Free rolling circumference in meters */
  rollingCircumferenceM: number;
  /** Warning messages from fallbacks or bounds clamping */
  warnings: string[];
}

export interface TireVerticalStiffnessPriorOptions {
  /** Nominal cold/hot inflation pressure in PSI (default: 30.0 PSI) */
  pressurePsi?: number;
  /** Base reference radial stiffness in N/m for 245/40R18 @ 30 PSI (default: 250,000 N/m) */
  baseStiffnessNPerM?: number;
}

export interface TireVerticalStiffnessPriorOutput {
  /** Heuristic vertical stiffness in N/m */
  verticalStiffnessNPerM: number;
  /** Heuristic vertical stiffness in N/mm (divide by 9.80665 again for kgf/mm) */
  verticalStiffnessNPerMm: number;
  /** Source identifier */
  source: 'geometric-heuristic-prior/v1';
  /** Flag denoting this is a purely geometric heuristic estimate */
  isHeuristic: true;
  /** Detailed physical rationale / explanation */
  notes: string;
  /** Clamping or parameter warnings */
  warnings: string[];
}

const DEFAULT_WIDTH_MM = 245;
const DEFAULT_ASPECT_RATIO = 40;
const DEFAULT_RIM_DIAMETER_IN = 18;
const MM_PER_INCH = 25.4;

const clamp = (val: number, min: number, max: number): number => Math.min(max, Math.max(min, val));
const round = (val: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(val * factor) / factor;
};

/**
 * Normalizes aspect ratio input. If user passes decimal fraction <= 1.0 (e.g. 0.45), converts to 45%.
 */
function normalizeAspectRatio(rawAspect: number | undefined): { aspect: number; warned: boolean } {
  if (!Number.isFinite(rawAspect) || (rawAspect as number) <= 0) {
    return { aspect: DEFAULT_ASPECT_RATIO, warned: true };
  }
  const val = rawAspect as number;
  if (val > 0 && val <= 1.0) {
    return { aspect: val * 100, warned: false };
  }
  return { aspect: val, warned: false };
}

/**
 * Pure calculation of metric tire geometry from section width (mm), aspect ratio (%), and rim (in).
 */
export function calculateTireGeometry(input?: TireGeometryInput): TireGeometryOutput {
  const warnings: string[] = [];

  // 1. Width validation & clamping
  let widthMm = input?.widthMm;
  if (!Number.isFinite(widthMm) || (widthMm as number) <= 0) {
    widthMm = DEFAULT_WIDTH_MM;
    warnings.push(`Invalid tire width '${input?.widthMm}'; fallback to default ${DEFAULT_WIDTH_MM} mm.`);
  } else if ((widthMm as number) < 100 || (widthMm as number) > 450) {
    const clamped = clamp(widthMm as number, 100, 450);
    warnings.push(`Tire width ${widthMm} mm clamped to realistic range [100, 450] mm (${clamped} mm).`);
    widthMm = clamped;
  }

  // 2. Aspect ratio validation & clamping
  const { aspect: normalizedAspect, warned: aspectWarned } = normalizeAspectRatio(input?.aspectRatio);
  let aspectRatio = normalizedAspect;
  if (aspectWarned) {
    warnings.push(`Invalid aspect ratio '${input?.aspectRatio}'; fallback to default ${DEFAULT_ASPECT_RATIO}%.`);
  } else if (aspectRatio < 15 || aspectRatio > 95) {
    const clamped = clamp(aspectRatio, 15, 95);
    warnings.push(`Aspect ratio ${aspectRatio}% clamped to realistic range [15, 95]% (${clamped}%).`);
    aspectRatio = clamped;
  }

  // 3. Rim diameter validation & clamping
  let rimDiameterIn = input?.rimDiameterIn;
  if (!Number.isFinite(rimDiameterIn) || (rimDiameterIn as number) <= 0) {
    rimDiameterIn = DEFAULT_RIM_DIAMETER_IN;
    warnings.push(`Invalid rim diameter '${input?.rimDiameterIn}'; fallback to default ${DEFAULT_RIM_DIAMETER_IN} in.`);
  } else if ((rimDiameterIn as number) < 10 || (rimDiameterIn as number) > 30) {
    const clamped = clamp(rimDiameterIn as number, 10, 30);
    warnings.push(`Rim diameter ${rimDiameterIn} in clamped to realistic range [10, 30] in (${clamped} in).`);
    rimDiameterIn = clamped;
  }

  // Geometric formulas
  const sidewallHeightMm = widthMm * (aspectRatio / 100);
  const sidewallHeightM = sidewallHeightMm / 1000;
  const rimDiameterMm = rimDiameterIn * MM_PER_INCH;
  const rimDiameterM = rimDiameterMm / 1000;
  const overallDiameterMm = rimDiameterMm + 2 * sidewallHeightMm;
  const overallDiameterM = overallDiameterMm / 1000;
  const tireRadiusMm = overallDiameterMm / 2;
  const tireRadiusM = overallDiameterM / 2;
  const rollingCircumferenceM = overallDiameterM * Math.PI;

  return {
    widthMm: round(widthMm, 1),
    aspectRatio: round(aspectRatio, 1),
    rimDiameterIn: round(rimDiameterIn, 1),
    sidewallHeightMm: round(sidewallHeightMm, 2),
    sidewallHeightM: round(sidewallHeightM, 5),
    rimDiameterMm: round(rimDiameterMm, 2),
    rimDiameterM: round(rimDiameterM, 5),
    overallDiameterMm: round(overallDiameterMm, 2),
    overallDiameterM: round(overallDiameterM, 5),
    tireRadiusMm: round(tireRadiusMm, 2),
    tireRadiusM: round(tireRadiusM, 5),
    rollingCircumferenceM: round(rollingCircumferenceM, 4),
    warnings
  };
}

/**
 * Calculates a geometry-based vertical stiffness prior (radial spring rate in N/m).
 *
 * Physical rationale:
 * - Radial tire stiffness increases with section width (larger contact patch & air volume foundation).
 * - Radial tire stiffness decreases with taller sidewall heights (increased radial compliance).
 * - Radial tire stiffness increases with inflation pressure.
 *
 * Baseline: 245/40R18 @ 30 PSI nominal ~ 250,000 N/m (250 N/mm).
 */
export function calculateTireVerticalStiffnessPrior(
  geometry: TireGeometryInput | TireGeometryOutput,
  options?: TireVerticalStiffnessPriorOptions
): TireVerticalStiffnessPriorOutput {
  const warnings: string[] = [];

  const geo = 'overallDiameterM' in geometry ? (geometry as TireGeometryOutput) : calculateTireGeometry(geometry);
  if (geo.warnings.length > 0) {
    warnings.push(...geo.warnings);
  }

  const baseStiffness = Number.isFinite(options?.baseStiffnessNPerM) && (options?.baseStiffnessNPerM as number) > 0
    ? (options?.baseStiffnessNPerM as number)
    : 250000;

  let pressurePsi = options?.pressurePsi;
  if (!Number.isFinite(pressurePsi) || (pressurePsi as number) <= 0) {
    pressurePsi = 30.0;
  } else if ((pressurePsi as number) < 15 || (pressurePsi as number) > 60) {
    const clamped = clamp(pressurePsi as number, 15, 60);
    warnings.push(`Tire pressure ${pressurePsi} PSI clamped to [15, 60] PSI (${clamped} PSI).`);
    pressurePsi = clamped;
  }

  // Geometric scaling:
  // (width / 245)^0.5 * (98 / sidewallHeight)^0.6 * (pressure / 30)^0.7
  const widthRatio = geo.widthMm / 245;
  const sidewallRatio = 98 / Math.max(10, geo.sidewallHeightMm);
  const pressureRatio = pressurePsi / 30;

  const rawStiffnessNPerM = baseStiffness * (widthRatio ** 0.5) * (sidewallRatio ** 0.6) * (pressureRatio ** 0.7);
  const clampedStiffnessNPerM = clamp(rawStiffnessNPerM, 80000, 600000);

  if (clampedStiffnessNPerM !== rawStiffnessNPerM) {
    warnings.push(`Estimated tire vertical stiffness clamped to physical boundary [80k, 600k] N/m.`);
  }

  return {
    verticalStiffnessNPerM: round(clampedStiffnessNPerM, 1),
    verticalStiffnessNPerMm: round(clampedStiffnessNPerM / 1000, 3),
    source: 'geometric-heuristic-prior/v1',
    isHeuristic: true,
    notes: 'Uncalibrated geometric prior for engineering and tuning advisory; not derived from Forza Horizon 6 live telemetry.',
    warnings
  };
}
