/**
 * VFD Gauge Math Utility Functions
 * Pure functions for RPM redline, yellowline (warning) thresholds, upshift alert gating, and cell color mapping.
 */

export interface VFDPalette {
  primary: string;
  amber: string;
  hot: string;
}

/**
 * Calculate VFD RPM redline and yellowline (warning) thresholds.
 * Redline calculation matches Advanced HUD (payload.redlineRpm || maxRpm * 0.92).
 * Yellowline threshold is pushed back by 1000 RPM from the start of redline zone.
 */
export function calculateVFDRpmZones(maxRpm: number, payloadRedline?: number): { redlineRpm: number; warnRpm: number } {
  const validMax = Math.max(1000, maxRpm || 8000);
  const redlineRpm = payloadRedline && payloadRedline > 0 ? payloadRedline : validMax * 0.92;
  const warnRpm = Math.max(0, redlineRpm - 1000);
  return { redlineRpm, warnRpm };
}

/**
 * Determine if upshift alert (flashing RPM bar and SHIFT text) is active.
 * Upshift alert ONLY triggers when current RPM is in redline zone AND throttle input > 50% (0.5).
 */
export function isVFDUpshiftAlertActive(rpm: number, redlineRpm: number, throttle: number): boolean {
  return rpm >= redlineRpm && throttle > 0.5;
}

/**
 * Calculate normalized range (0.0 to 1.0) for dynamic telemetry gauges (POW, TOR, BST).
 * Dynamically adjusts max bound according to current value, session peak, and default max floor.
 */
export function calculateVFDNormalizedDynamicValue(
  currentVal: number,
  sessionMax?: number,
  defaultMaxFloor: number = 100
): number {
  const validVal = Math.max(0, currentVal || 0);
  const validPeak = Math.max(defaultMaxFloor, sessionMax || 0, validVal);
  return Math.min(1.0, Math.max(0.0, validVal / validPeak));
}

/**
 * Determine the zone state for a specific RPM bar cell.
 */
export function getVFDRpmCellState(
  cellIndex: number,
  totalCells: number,
  maxRpm: number,
  redlineRpm: number,
  warnRpm: number
): 'normal' | 'warn' | 'redline' {
  if (totalCells <= 0 || maxRpm <= 0) return 'normal';
  const cellRpm = (cellIndex / totalCells) * maxRpm;
  if (cellRpm >= redlineRpm) {
    return 'redline';
  }
  if (cellRpm >= warnRpm) {
    return 'warn';
  }
  return 'normal';
}

/**
 * Determine the color for RPM scale label numbers (0 to 10).
 */
export function getVFDRpmLabelColor(
  n: number,
  maxRpm: number,
  redlineRpm: number,
  warnRpm: number,
  palette: VFDPalette
): string {
  const labelRpm = (n / 10) * maxRpm;
  if (labelRpm >= redlineRpm) {
    return palette.hot;
  }
  if (labelRpm >= warnRpm) {
    return palette.amber;
  }
  return palette.primary;
}
