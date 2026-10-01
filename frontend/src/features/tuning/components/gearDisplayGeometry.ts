/** Kinematic axis conversion for charts only; never recommends a setting. */
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
