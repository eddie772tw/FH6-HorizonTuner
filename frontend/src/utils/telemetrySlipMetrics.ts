export type TelemetryDrivetrain = 'FWD' | 'RWD' | 'AWD';

export interface NormalizedSlipMetrics {
  hasCompleteNormalizedSlipRatio: boolean;
  hasCompleteNormalizedSlipAngle: boolean;
  avgNormalizedSlipRatioF: number;
  avgNormalizedSlipRatioR: number;
  maxAbsNormalizedSlipRatioF: number;
  maxAbsNormalizedSlipRatioR: number;
  maxNormalizedSlipAngleF: number;
  maxNormalizedSlipAngleR: number;
  normalizedSlipAngleFL: number;
  normalizedSlipAngleFR: number;
  normalizedSlipAngleRL: number;
  normalizedSlipAngleRR: number;
  normalizedSlipRatioFL: number;
  normalizedSlipRatioFR: number;
  normalizedSlipRatioRL: number;
  normalizedSlipRatioRR: number;
}

const finite = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

const four = (values: unknown): [number, number, number, number] => {
  const source = Array.isArray(values) ? values : [];
  return [finite(source[0]), finite(source[1]), finite(source[2]), finite(source[3])];
};

const hasFourFinite = (values: unknown): boolean => Array.isArray(values)
  && values.length >= 4
  && values.slice(0, 4).every((value) => typeof value === 'number' && Number.isFinite(value));

/**
 * Preserve FH6 Data Out tire-slip values as normalized coefficients. They are
 * deliberately not converted to degrees or physical percentages here.
 */
export function summarizeNormalizedSlip(
  tireSlipRatio: unknown,
  tireSlipAngle: unknown,
): NormalizedSlipMetrics {
  const [ratioFL, ratioFR, ratioRL, ratioRR] = four(tireSlipRatio);
  const [angleFL, angleFR, angleRL, angleRR] = four(tireSlipAngle);
  return {
    hasCompleteNormalizedSlipRatio: hasFourFinite(tireSlipRatio),
    hasCompleteNormalizedSlipAngle: hasFourFinite(tireSlipAngle),
    avgNormalizedSlipRatioF: (ratioFL + ratioFR) / 2,
    avgNormalizedSlipRatioR: (ratioRL + ratioRR) / 2,
    maxAbsNormalizedSlipRatioF: Math.max(Math.abs(ratioFL), Math.abs(ratioFR)),
    maxAbsNormalizedSlipRatioR: Math.max(Math.abs(ratioRL), Math.abs(ratioRR)),
    maxNormalizedSlipAngleF: Math.max(Math.abs(angleFL), Math.abs(angleFR)),
    maxNormalizedSlipAngleR: Math.max(Math.abs(angleRL), Math.abs(angleRR)),
    normalizedSlipAngleFL: angleFL,
    normalizedSlipAngleFR: angleFR,
    normalizedSlipAngleRL: angleRL,
    normalizedSlipAngleRR: angleRR,
    normalizedSlipRatioFL: ratioFL,
    normalizedSlipRatioFR: ratioFR,
    normalizedSlipRatioRL: ratioRL,
    normalizedSlipRatioRR: ratioRR,
  };
}

export function drivenAxles(drivetrain: TelemetryDrivetrain): Array<'front' | 'rear'> {
  return drivetrain === 'FWD' ? ['front'] : drivetrain === 'RWD' ? ['rear'] : ['front', 'rear'];
}
