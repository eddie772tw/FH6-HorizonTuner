/**
 * FH6 Car Class and Performance Index (PI) utility functions.
 * 
 * In Forza Horizon 6, the PI ranges have been overhauled with the introduction
 * of R-class (Track Prototypes / Factory Race Cars) and shifted brackets:
 * - D:  100 - 400
 * - C:  401 - 500
 * - B:  501 - 600
 * - A:  601 - 700
 * - S1: 701 - 800
 * - S2: 801 - 900
 * - R:  901 - 998
 * - X:  999
 * 
 * UDP CarClass Enum (0-indexed):
 * 0 = D, 1 = C, 2 = B, 3 = A, 4 = S1, 5 = S2, 6 = R, 7 = X
 */

export const CAR_CLASSES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X'] as const;
export type CarClassName = typeof CAR_CLASSES[number];

export interface PiClassRange {
  min: number;
  max: number;
  name: CarClassName;
}

export const FH6_PI_CLASS_RANGES: readonly PiClassRange[] = [
  { min: 100, max: 400, name: 'D' },
  { min: 401, max: 500, name: 'C' },
  { min: 501, max: 600, name: 'B' },
  { min: 601, max: 700, name: 'A' },
  { min: 701, max: 800, name: 'S1' },
  { min: 801, max: 900, name: 'S2' },
  { min: 901, max: 998, name: 'R' },
  { min: 999, max: Infinity, name: 'X' },
] as const;

/**
 * Derives the FH6 vehicle class from its Performance Index (PI).
 * 
 * @param pi The numerical Performance Index (e.g. 350, 750, 850, 950, 999).
 * @returns The class string ('D' ~ 'X') or empty string if PI is <= 0 / undefined.
 */
export function getCarClassFromPi(pi?: number | null): string {
  if (pi === undefined || pi === null || !Number.isFinite(pi) || pi <= 0) {
    return '';
  }

  if (pi <= 400) return 'D';
  if (pi <= 500) return 'C';
  if (pi <= 600) return 'B';
  if (pi <= 700) return 'A';
  if (pi <= 800) return 'S1';
  if (pi <= 900) return 'S2';
  if (pi <= 998) return 'R';
  return 'X';
}

/**
 * Converts a Forza UDP telemetry CarClass integer enum (0~7) to its class string.
 * 
 * @param cls The 0-indexed integer enum from telemetry packet (0=D, 1=C, ..., 6=R, 7=X).
 * @returns The class string ('D' ~ 'X'), or `Class ${cls}` if unrecognized, or empty string if undefined.
 */
export function getCarClassString(cls?: number | null): string {
  if (cls === undefined || cls === null || !Number.isFinite(cls)) {
    return '';
  }
  const intCls = Math.floor(cls);
  if (intCls >= 0 && intCls < CAR_CLASSES.length) {
    return CAR_CLASSES[intCls];
  }
  return `Class ${intCls}`;
}

/**
 * Smart resolution of vehicle class.
 * Prioritizes PI-based classification when PI > 0 (for 100% FH6 accuracy across S2/R/X),
 * falling back to the UDP CarClass enum when PI is unavailable.
 * 
 * @param carClass The CarClass enum value from telemetry.
 * @param pi The CarPerformanceIndex value from telemetry.
 * @returns The resolved class string.
 */
export function resolveCarClass(carClass?: number | null, pi?: number | null): string {
  if (pi !== undefined && pi !== null && Number.isFinite(pi) && pi > 0) {
    return getCarClassFromPi(pi);
  }
  return getCarClassString(carClass);
}

/**
 * Formats a user-friendly badge string for UI display.
 * e.g.:
 * - (4, 750) -> "S1 750"
 * - (5, 850) -> "S2 850"
 * - (6, 950) -> "R 950"
 * - (7, 999) -> "X 999"
 * - (4, 0)   -> "S1"
 * - (undefined, 750) -> "S1 750"
 * 
 * @param carClass The CarClass enum value from telemetry.
 * @param pi The CarPerformanceIndex value from telemetry.
 * @returns The formatted badge text, or empty string if no valid class info.
 */
export function getCarClassBadgeText(carClass?: number | null, pi?: number | null): string {
  const cls = resolveCarClass(carClass, pi);
  if (!cls) return '';

  const validPi = (pi !== undefined && pi !== null && Number.isFinite(pi) && pi > 0) ? Math.floor(pi) : null;
  if (validPi !== null) {
    return `${cls} ${validPi}`;
  }
  return cls;
}
