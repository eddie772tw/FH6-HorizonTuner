export type AeroAdjustability = 'Fixed' | 'Front Only' | 'Rear Only' | 'Adjustable';
export type AeroAxle = 'front' | 'rear';

/**
 * Legacy profiles did not record per-axle aero capability. Preserve their
 * existing two-axis workflow until an in-game capture records otherwise.
 */
export function normalizeAeroAdjustability(value: unknown): AeroAdjustability {
  return value === 'Fixed' || value === 'Front Only' || value === 'Rear Only' || value === 'Adjustable'
    ? value
    : 'Adjustable';
}

export function isAeroAxleAdjustable(value: unknown, axle: AeroAxle): boolean {
  const adjustability = normalizeAeroAdjustability(value);
  return adjustability === 'Adjustable'
    || (adjustability === 'Front Only' && axle === 'front')
    || (adjustability === 'Rear Only' && axle === 'rear');
}
