/** Local fallback for session-observations/v2; parity checked against Python. */
export interface SessionDebriefData {
  methodVersion: 'session-observations/v2';
  total_samples: number; valid_laps: number; observed_laps: number; observed_seconds: number;
  tire_thermals: {
    fl_avg: number | null; fr_avg: number | null; rl_avg: number | null; rr_avg: number | null;
    status: 'Observed' | 'Partial data' | 'no_data';
  };
  suspension: {
    peak_travel_pct: number | null;
    /** Historical API key: continuous near-compression wheel events, not proven bottoming. */
    bottom_out_count: number | null;
    status: 'Observed' | 'no_data';
  };
  handling_balance: {
    /** Historical API keys: relative normalized slip exposure, not a handling diagnosis. */
    understeer_pct: number | null; oversteer_pct: number | null; observed_seconds: number;
    tendency: 'Observed normalized slip' | 'no_data';
  };
}

export interface RawTelemetryPoint {
  time?: number | null; TimestampMS?: number | null; IsRaceOn?: number | null;
  LapNumber?: number | null; CurrentLap?: number | null; LastLap?: number | null;
  SpeedMetersPerSecond?: number | null; AccelerationX?: number | null; AccelerationZ?: number | null;
  NormalizedSuspensionTravel?: (number | null)[]; SuspTravel?: (number | null)[];
  TireSlipAngle?: (number | null)[]; // normalized
  TireTemp?: (number | null)[]; // application raw Fahrenheit contract
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const time = (point: RawTelemetryPoint) => finite(point.TimestampMS) ? point.TimestampMS / 1000 : point.time;
const driving = (point: RawTelemetryPoint) => point.IsRaceOn !== 0 && finite(point.SpeedMetersPerSecond) && point.SpeedMetersPerSecond > 2;

export function calculateFrontendDebrief(points: RawTelemetryPoint[]): SessionDebriefData {
  const temperatureSums = [0, 0, 0, 0], temperatureSeconds = [0, 0, 0, 0];
  const active = [false, false, false, false];
  let observed = 0, nearCompression = 0, travelObserved = false, peak: number | null = null;
  let corner = 0, front = 0, rear = 0;
  const laps = new Set<number>(), starts = new Set<number>(), ends = new Set<number>();
  let previousLap: number | null = null, pendingLap: number | null = null, previousLast: number | null = null;
  let lapTracking = true;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], next = points[i + 1];
    const t0 = time(p), t1 = next && time(next);
    const dt = finite(t0) && finite(t1) ? t1 - t0 : 0;
    const weight = dt > 0 && dt <= 0.5 && driving(p) && next && driving(next) ? dt : 0;
    observed += weight;
    if (lapTracking && finite(p.LapNumber) && Number.isInteger(p.LapNumber) && p.LapNumber >= 0) {
      if (previousLap !== null && p.LapNumber < previousLap) lapTracking = false;
      if (lapTracking) {
        if (previousLap !== null && p.LapNumber > previousLap) pendingLap = p.LapNumber === previousLap + 1 ? previousLap : null;
        if (pendingLap !== null && finite(p.LastLap) && p.LastLap > 0 && p.LastLap !== previousLast) {
          ends.add(pendingLap); pendingLap = null;
        }
        if (finite(p.LastLap)) previousLast = p.LastLap;
        previousLap = p.LapNumber;
        if (p.IsRaceOn !== 0) {
          laps.add(p.LapNumber);
          if (finite(p.CurrentLap) && p.CurrentLap >= 0 && p.CurrentLap <= 0.5) starts.add(p.LapNumber);
        }
      }
    }
    for (let w = 0; w < 4; w++) {
      const temp = p.TireTemp?.[w], travel = (p.NormalizedSuspensionTravel ?? p.SuspTravel)?.[w];
      if (weight > 0 && finite(temp)) {
        temperatureSums[w] += (temp - 32) * 5 / 9 * weight;
        temperatureSeconds[w] += weight;
      }
      if (weight <= 0 || !finite(travel)) { active[w] = false; continue; }
      travelObserved = true;
      peak = peak === null ? travel : Math.max(peak, travel);
      const compressed = travel >= 0.95;
      if (compressed && !active[w]) nearCompression++;
      active[w] = compressed;
    }
    const angles = p.TireSlipAngle;
    if (weight > 0 && finite(p.AccelerationX) && Math.abs(p.AccelerationX) >= 2.94 &&
        finite(p.SpeedMetersPerSecond) && p.SpeedMetersPerSecond >= 10 &&
        angles?.length === 4 && angles.every(finite)) {
      corner += weight;
      const f = (Math.abs(angles[0]) + Math.abs(angles[1])) / 2;
      const r = (Math.abs(angles[2]) + Math.abs(angles[3])) / 2;
      if (f > r * 1.15) front += weight;
      else if (r > f * 1.15) rear += weight;
    }
  }
  const temperatures = temperatureSeconds.map((seconds, w) => seconds > 0 ? temperatureSums[w] / seconds : null);
  return {
    methodVersion: 'session-observations/v2', total_samples: points.length,
    valid_laps: [...laps].filter(lap => starts.has(lap) && ends.has(lap)).length,
    observed_laps: laps.size, observed_seconds: observed,
    tire_thermals: { fl_avg: temperatures[0], fr_avg: temperatures[1], rl_avg: temperatures[2], rr_avg: temperatures[3],
      status: temperatures.every(finite) ? 'Observed' : temperatures.some(finite) ? 'Partial data' : 'no_data' },
    suspension: { peak_travel_pct: peak === null ? null : peak * 100,
      bottom_out_count: travelObserved ? nearCompression : null, status: travelObserved ? 'Observed' : 'no_data' },
    handling_balance: { understeer_pct: corner > 0 ? front / corner * 100 : null,
      oversteer_pct: corner > 0 ? rear / corner * 100 : null, observed_seconds: corner,
      tendency: corner > 0 ? 'Observed normalized slip' : 'no_data' },
  };
}
