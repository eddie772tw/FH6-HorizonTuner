export interface GearingLimits {
  minFd: number;
  maxFd: number;
  minGear: number;
  maxGear: number;
}

export const DEFAULT_GEARING_LIMITS: GearingLimits = {
  minFd: 2.20,
  maxFd: 6.00,
  minGear: 0.48,
  maxGear: 6.00
};

export interface RatioBalanceBounds {
  minScale: number;
  maxScale: number;
  minFd: number;
  maxFd: number;
}

/**
 * Calculates permissible ratio balance scale bounds based on Forza transmission constraints.
 */
export function calculateRatioBalanceBounds(
  baseFd: number,
  baseGears: number[],
  limits: GearingLimits = DEFAULT_GEARING_LIMITS
): RatioBalanceBounds {
  if (!baseFd || baseFd <= 0 || !baseGears.length) {
    return { minScale: 1.0, maxScale: 1.0, minFd: baseFd || 3.4, maxFd: baseFd || 3.4 };
  }

  const validGears = baseGears.filter(g => g > 0);
  if (!validGears.length) {
    return { minScale: 1.0, maxScale: 1.0, minFd: baseFd, maxFd: baseFd };
  }

  const maxBaseGear = Math.max(...validGears);
  const minBaseGear = Math.min(...validGears);

  // Scale k = targetFd / baseFd.
  // Lower bound: FD >= minFd and gear1 <= maxGear
  const minBoundScale = Math.max(
    0.5,
    limits.minFd / baseFd,
    maxBaseGear > 0 ? maxBaseGear / limits.maxGear : 0.5
  );

  // Upper bound: FD <= maxFd and topGear >= minGear
  const maxBoundScale = Math.min(
    2.0,
    limits.maxFd / baseFd,
    minBaseGear > 0 ? minBaseGear / limits.minGear : 2.0
  );

  const safeMinScale = Math.min(1.0, Number(minBoundScale.toFixed(2)));
  const safeMaxScale = Math.max(1.0, Number(maxBoundScale.toFixed(2)));

  const minFd = Number((baseFd * safeMinScale).toFixed(2));
  const maxFd = Number((baseFd * safeMaxScale).toFixed(2));

  return {
    minScale: safeMinScale,
    maxScale: safeMaxScale,
    minFd,
    maxFd
  };
}

/**
 * Adjusts Final Drive and individual gear ratios inversely to maintain equivalent overall reduction ratios.
 */
export function applyRatioBalance(
  baseFd: number,
  baseGears: number[],
  scale: number
): { finalDrive: number; gears: number[] } {
  if (!baseFd || baseFd <= 0 || !baseGears.length) {
    return { finalDrive: baseFd, gears: baseGears };
  }

  const finalDrive = Number((baseFd * scale).toFixed(2));
  if (finalDrive <= 0) {
    return { finalDrive: baseFd, gears: baseGears };
  }

  const gears = baseGears.map(baseGear => {
    const targetReduction = baseFd * baseGear;
    const derivedGear = targetReduction / finalDrive;
    return Number(derivedGear.toFixed(2));
  });

  return { finalDrive, gears };
}
