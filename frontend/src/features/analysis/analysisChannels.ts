import type { AnalysisDataPoint } from '../../context/TelemetryRecorderContext';
import type { TrackPoint } from './TrackMapCanvas';

export const finiteChannel = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const scaledChannel = (value: unknown, scale = 1): number | null => finiteChannel(value) ? value * scale : null;

/** Missing positions or channels split paths instead of becoming a zero observation. */
export function trackPoints(points: AnalysisDataPoint[], metric: string): TrackPoint[] {
  const result: TrackPoint[] = [];
  let previousIndex = -2, maximum = 0.1;
  points.forEach((p, index) => {
    let value = p.SpeedMetersPerSecond;
    if (metric === 'throttle') value = scaledChannel(p.AccelInput, 1 / 255);
    else if (metric === 'brake') value = scaledChannel(p.BrakeInput, 1 / 255);
    else if (metric === 'grip') value = p.TireSlipRatio?.length === 4 && p.TireSlipRatio.every(finiteChannel)
      ? Math.max(...p.TireSlipRatio.map(Math.abs)) : null;
    else if (metric === 'suspension') value = p.SuspTravel?.[0] ?? null;
    if (!finiteChannel(p.PositionX) || !finiteChannel(p.PositionZ) || !finiteChannel(value)) return;
    const previous = points[index - 1];
    const gap = previous && finiteChannel(p.time) && finiteChannel(previous.time) ? p.time - previous.time : null;
    result.push({ x: p.PositionX, z: p.PositionZ, val: value, raw: p,
      breakBefore: index !== previousIndex + 1 || gap === null || gap <= 0 || gap > .5 });
    previousIndex = index;
    maximum = Math.max(maximum, value);
  });
  return result.map(p => ({ ...p, val: p.val / maximum }));
}

/** SVG path is explicitly sample progress; disconnected observations are not interpolated. */
export function samplePath(values: (number | null)[], maximum: number): string {
  let connected = false;
  return values.map((value, index) => {
    if (!finiteChannel(value)) { connected = false; return ''; }
    const command = connected ? 'L' : 'M'; connected = true;
    return command + (index / Math.max(1, values.length - 1) * 1000) + ',' + (100 - value / maximum * 100);
  }).join(' ');
}
