export type SuspensionTravelMode = 'relative' | 'absolute';

export function getSuspensionDisplayValue(
  normalizedTravel: number,
  travelMeters: number,
  mode: SuspensionTravelMode
): number {
  if (mode === 'absolute') {
    return Number.isFinite(travelMeters) ? travelMeters * 1000 : 0;
  }
  return Number.isFinite(normalizedTravel) ? normalizedTravel : 0;
}
