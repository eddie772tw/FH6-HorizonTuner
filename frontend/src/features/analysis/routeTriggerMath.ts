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

export function filterTrimmedPoints(
  points: AnalysisDataPoint[],
  validStartTime: number,
  validEndTime: number,
): AnalysisDataPoint[] {
  if (points.length === 0) return [];
  if (!Number.isFinite(validStartTime) || !Number.isFinite(validEndTime)) return points;
  return points.filter((p) => {
    const t = p.time;
    if (t === null || t === undefined || !Number.isFinite(t)) return true;
    return t >= validStartTime && t <= validEndTime;
  });
}

export function calculateLapsFromPoints(
  points: AnalysisDataPoint[],
): LapSummary[] {
  if (!points || points.length === 0) return [];

  const lapMap = new Map<number, AnalysisDataPoint[]>();
  for (const p of points) {
    const lapNum = typeof p.LapNumber === "number" && Number.isFinite(p.LapNumber)
      ? Math.max(1, Math.round(p.LapNumber))
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

  for (let i = 0; i < sortedLaps.length; i++) {
    const lapNum = sortedLaps[i];
    const group = lapMap.get(lapNum) ?? [];
    if (group.length === 0) continue;

    const validTimes = group
      .map((p) => p.time)
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
    const validSpeeds = group
      .map((p) => p.SpeedMetersPerSecond)
      .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
    const validDistances = group
      .map((p) => p.lap_distance)
      .filter((d): d is number => typeof d === "number" && Number.isFinite(d));

    const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
    const maxTime = validTimes.length > 0 ? Math.max(...validTimes) : 0;
    const observedSpan = maxTime - minTime;

    const maxSpeedKmh =
      validSpeeds.length > 0
        ? Math.round(Math.max(...validSpeeds) * 3.6 * 10) / 10
        : null;
    const avgSpeedKmh =
      validSpeeds.length > 0
        ? Math.round(
            (validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length) *
              3.6 *
              10
          ) / 10
        : null;

    const startDistance =
      validDistances.length > 0 ? Math.min(...validDistances) : null;
    const endDistance =
      validDistances.length > 0 ? Math.max(...validDistances) : null;

    // A lap is complete only if there is genuine evidence of closing:
    // in telemetry / MoTeC, lap N finishes when the vehicle transitions into lap N+1.
    const nextLapNum = sortedLaps[i + 1];
    const nextGroup = nextLapNum !== undefined ? lapMap.get(nextLapNum) : undefined;
    const hasNextLap = nextGroup !== undefined && nextGroup.length > 0;

    // In Forza telemetry, the official finished time of lap N appears in LastLap of lap N+1
    const nextLapLastLap = hasNextLap
      ? nextGroup
          ?.map((p) => p.LastLap)
          .find((l): l is number => typeof l === "number" && Number.isFinite(l) && l > 0)
      : undefined;

    const isComplete = hasNextLap && observedSpan > 1.0;

    let lapTime: number | null = null;
    let lapTimeSource = "motec-span";

    if (isComplete) {
      if (typeof nextLapLastLap === "number" && nextLapLastLap > 0) {
        lapTime = Math.round(nextLapLastLap * 1000) / 1000;
        lapTimeSource = "game-lastlap";
      } else {
        lapTime = Math.round(observedSpan * 1000) / 1000;
        lapTimeSource = "motec-span";
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
      observed_span: Math.round(observedSpan * 1000) / 1000,
    });
  }

  return result;
}
