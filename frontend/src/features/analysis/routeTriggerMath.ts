import type { AnalysisDataPoint, LapSummary } from "../../context/TelemetryRecorderContext";

export interface CustomRoute {
  route_id: string;
  name: string;
  mode: "circuit" | "time_trial" | "roaming";
  start_x: number;
  start_y: number;
  start_z: number;
  start_radius: number;
  end_x?: number | null;
  end_y?: number | null;
  end_z?: number | null;
  end_radius?: number | null;
  metadata?: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
}

export function selectedRouteForMode(
  routes: readonly CustomRoute[],
  routeId: string | null,
  mode: CustomRoute["mode"],
): CustomRoute | undefined {
  return routes.find((route) => route.route_id === routeId && route.mode === mode);
}

export function calculateDistance3D(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dz = z1 - z2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function isInsideSphere(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): boolean {
  if (radius <= 0) return false;
  return calculateDistance3D(x, y, z, cx, cy, cz) <= radius;
}

export function isOutsideHysteresis(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  factor = 1.2,
): boolean {
  if (radius <= 0) return true;
  return calculateDistance3D(x, y, z, cx, cy, cz) > radius * factor;
}

export function segmentIntersectsSphere(
  p0: [number, number, number],
  p1: [number, number, number],
  center: [number, number, number],
  radius: number,
): boolean {
  if (radius <= 0) return false;
  if (
    isInsideSphere(p0[0], p0[1], p0[2], center[0], center[1], center[2], radius) ||
    isInsideSphere(p1[0], p1[1], p1[2], center[0], center[1], center[2], radius)
  ) {
    return true;
  }
  const vx = p1[0] - p0[0];
  const vy = p1[1] - p0[1];
  const vz = p1[2] - p0[2];
  const wx = center[0] - p0[0];
  const wy = center[1] - p0[1];
  const wz = center[2] - p0[2];
  const c1 = wx * vx + wy * vy + wz * vz;
  const c2 = vx * vx + vy * vy + vz * vz;
  if (c2 <= Number.EPSILON) return false;
  const t = Math.max(0, Math.min(1, c1 / c2));
  const closestX = p0[0] + t * vx;
  const closestY = p0[1] + t * vy;
  const closestZ = p0[2] + t * vz;
  return isInsideSphere(closestX, closestY, closestZ, center[0], center[1], center[2], radius);
}

export function validateRoute(
  route: Partial<CustomRoute>,
): { valid: boolean; error?: string } {
  if (!route.name || route.name.trim().length === 0) {
    return { valid: false, error: "Route name is required" };
  }
  const mode = route.mode;
  if (mode !== "circuit" && mode !== "time_trial" && mode !== "roaming") {
    return { valid: false, error: "Invalid route mode" };
  }
  if (
    typeof route.start_x !== "number" ||
    !Number.isFinite(route.start_x) ||
    typeof route.start_y !== "number" ||
    !Number.isFinite(route.start_y) ||
    typeof route.start_z !== "number" ||
    !Number.isFinite(route.start_z)
  ) {
    return { valid: false, error: "Start coordinates (X, Y, Z) are required and must be finite numbers" };
  }
  const startRadius = route.start_radius ?? 15.0;
  if (startRadius < 5.0 || startRadius > 50.0) {
    return { valid: false, error: "Start radius must be between 5.0m and 50.0m" };
  }

  if (mode === "roaming") {
    if (
      typeof route.end_x !== "number" ||
      !Number.isFinite(route.end_x) ||
      typeof route.end_y !== "number" ||
      !Number.isFinite(route.end_y) ||
      typeof route.end_z !== "number" ||
      !Number.isFinite(route.end_z)
    ) {
      return { valid: false, error: "End coordinates (X, Y, Z) are required for roaming mode" };
    }
    const endRadius = route.end_radius ?? 15.0;
    if (endRadius < 5.0 || endRadius > 50.0) {
      return { valid: false, error: "End radius must be between 5.0m and 50.0m" };
    }
  }

  return { valid: true };
}

export interface ValidLapWindow { start_time: number; end_time: number }

export function filterTrimmedPoints(
  points: AnalysisDataPoint[],
  validStartTime: number,
  validEndTime: number,
  trimmedSampleCount?: number,
  validLapWindows?: readonly ValidLapWindow[],
): AnalysisDataPoint[] {
  if (trimmedSampleCount === 0) return [];
  if (points.length === 0) return [];
  if (!Number.isFinite(validStartTime) || !Number.isFinite(validEndTime)) return points;
  return points.filter((p) => {
    const t = p.time;
    if (t === null || t === undefined || !Number.isFinite(t)) return false;
    return t >= validStartTime && t <= validEndTime
      && (!validLapWindows || validLapWindows.some((w) => t >= w.start_time && t <= w.end_time));
  });
}

export function calculateLapsFromPoints(
  points: AnalysisDataPoint[],
): LapSummary[] {
  if (!points || points.length === 0) return [];

  const lapMap = new Map<number, AnalysisDataPoint[]>();
  for (const p of points) {
    const lapNum = typeof p.LapNumber === "number" && Number.isFinite(p.LapNumber)
      ? Math.max(0, Math.round(p.LapNumber))
      : 1;
    let group = lapMap.get(lapNum);
    if (!group) {
      group = [];
      lapMap.set(lapNum, group);
    }
    group.push(p);
  }

  const sortedLaps = Array.from(lapMap.keys()).sort((a, b) => a - b);
  const result: LapSummary[] = [];
  const ordered = points.every((point, index) => index === 0 || (
    typeof point.time === "number" && Number.isFinite(point.time)
    && typeof points[index - 1].time === "number"
    && point.time > points[index - 1].time!
    && (point.LapNumber ?? 1) >= (points[index - 1].LapNumber ?? 1)
  ));

  for (let i = 0; i < sortedLaps.length; i++) {
    const lapNum = sortedLaps[i];
    const group = lapMap.get(lapNum) ?? [];
    if (group.length === 0) continue;

    // Aggregate a loaded session in one pass per lap, avoiding intermediate arrays.
    let minTime = Infinity;
    let maxTime = -Infinity;
    let maxSpeedRaw = -Infinity;
    let sumSpeedRaw = 0;
    let validSpeedsCount = 0;
    let startDistance: number | null = Infinity;
    let endDistance: number | null = -Infinity;
    let hasValidTime = false;
    let hasValidDistance = false;

    for (let j = 0; j < group.length; j++) {
      const p = group[j];
      const t = p.time;
      if (typeof t === "number" && Number.isFinite(t)) {
        if (t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
        hasValidTime = true;
      }

      const s = p.SpeedMetersPerSecond;
      if (typeof s === "number" && Number.isFinite(s)) {
        if (s > maxSpeedRaw) maxSpeedRaw = s;
        sumSpeedRaw += s;
        validSpeedsCount++;
      }

      const d = p.lap_distance;
      if (typeof d === "number" && Number.isFinite(d)) {
        if (d < startDistance) startDistance = d;
        if (d > endDistance) endDistance = d;
        hasValidDistance = true;
      }
    }

    if (!hasValidTime) {
      minTime = 0;
      maxTime = 0;
    }
    if (!hasValidDistance) {
      startDistance = null;
      endDistance = null;
    }

    const observedSpan = maxTime - minTime;

    const maxSpeedKmh = validSpeedsCount > 0
      ? Math.round(maxSpeedRaw * 3.6 * 10) / 10
      : null;
    const avgSpeedKmh = validSpeedsCount > 0
      ? Math.round((sumSpeedRaw / validSpeedsCount) * 3.6 * 10) / 10
      : null;

    // A lap is complete only if there is genuine evidence of closing:
    // in telemetry / MoTeC, lap N finishes when the vehicle transitions into lap N+1.
    const nextLapNum = sortedLaps[i + 1];
    const nextGroup = nextLapNum !== undefined ? lapMap.get(nextLapNum) : undefined;
    const nextStart = nextGroup?.[0]?.time;
    const hasNextLap = nextLapNum === lapNum + 1 && typeof nextStart === "number"
      && Number.isFinite(nextStart) && nextStart > maxTime && nextStart - maxTime <= 3;
    const first = group[0];
    const previousGroup = lapMap.get(lapNum - 1);
    const previousEnd = previousGroup?.[previousGroup.length - 1]?.time;
    const observedTransition = typeof previousEnd === "number" && typeof first.time === "number"
      && first.time > previousEnd && first.time - previousEnd <= 3
      && !(typeof first.CurrentLap === "number" && Number.isFinite(first.CurrentLap));
    const hasStart = (typeof first.CurrentLap === "number" && first.CurrentLap >= 0 && first.CurrentLap <= 0.5)
      || (typeof first.lap_distance === "number" && first.lap_distance >= 0 && first.lap_distance <= 15)
      || observedTransition;

    // In Forza telemetry, the official finished time of lap N appears in LastLap of lap N+1
    let nextLapLastLap: number | undefined;
    if (hasNextLap && nextGroup) {
      for (let j = 0; j < nextGroup.length; j++) {
        const l = nextGroup[j].LastLap;
        if (typeof l === "number" && Number.isFinite(l) && l > 0) {
          nextLapLastLap = l;
          break;
        }
      }
    }

    const isComplete = ordered && hasStart && hasNextLap;

    let lapTime: number | null = null;
    let lapTimeSource = "unavailable";

    if (isComplete) {
      if (typeof nextLapLastLap === "number" && nextLapLastLap > 0) {
        lapTime = Math.round(nextLapLastLap * 1000) / 1000;
        lapTimeSource = "game-lastlap";
      } else {
        lapTime = Math.round((nextStart! - minTime) * 1000) / 1000;
        lapTimeSource = "motec-estimate";
      }
    }

    result.push({
      lap_number: lapNum,
      lap_time: lapTime,
      start_distance: startDistance,
      end_distance: endDistance,
      max_speed_kmh: maxSpeedKmh,
      avg_speed_kmh: avgSpeedKmh,
      complete: isComplete,
      lap_time_source: lapTimeSource,
      is_estimated: lapTimeSource === "motec-estimate",
      observed_span: Math.round(observedSpan * 1000) / 1000,
    });
  }

  return result;
}
