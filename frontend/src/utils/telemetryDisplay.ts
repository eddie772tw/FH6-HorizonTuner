/**
 * Forza's dashboard packet encodes gears as 0 = reverse, 1 = neutral,
 * and 2+ = first gear onward.
 */
export function formatTelemetryGear(rawGear?: number): string {
  if (!Number.isFinite(rawGear)) return 'N';

  const gear = Math.trunc(rawGear ?? 1);
  if (gear === 0) return 'R';
  if (gear === 11) return 'N';
  return gear > 0 ? String(gear) : 'N';
}

export function formatRacePosition(rawPosition?: number): string {
  if (!Number.isFinite(rawPosition) || (rawPosition ?? 0) <= 0) return '--';
  return `P${Math.trunc(rawPosition ?? 0)}`;
}
