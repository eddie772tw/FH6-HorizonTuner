/** Pure functions for calculating post-race vehicle health and handling debrief metrics. */

export interface TireThermalSummary {
  fl_avg: number | null;
  fr_avg: number | null;
  rl_avg: number | null;
  rr_avg: number | null;
  status: "Optimal" | "Overheating" | "Cold" | "no_data";
}

export interface SuspensionDebriefSummary {
  peak_travel_pct: number | null;
  bottom_out_count: number | null;
  status: "Optimal" | "Occasional Bottoming" | "Severe Bottoming" | "no_data";
}

export interface HandlingBalanceSummary {
  understeer_pct: number | null;
  oversteer_pct: number | null;
  tendency: "Understeer Biased" | "Oversteer Biased" | "Neutral / Balanced" | "no_data";
}

export interface SessionDebriefData {
  total_samples: number;
  valid_laps: number | null;
  tire_thermals: TireThermalSummary;
  suspension: SuspensionDebriefSummary;
  handling_balance: HandlingBalanceSummary;
}

export interface RawTelemetryPoint {
  time?: number | null;
  LapNumber?: number | null;
  CurrentLap?: number | null;
  LastLap?: number | null;
  SpeedMetersPerSecond?: number | null;
  AccelerationX?: number | null; // Lat acceleration (m/s²)
  AccelerationZ?: number | null; // Longitudinal acceleration (m/s²)
  SuspTravel?: (number | null)[]; // [FL, FR, RL, RR] (0.0 - 1.0)
  TireSlipAngle?: (number | null)[]; // [FL, FR, RL, RR] (normalized slip)
  TireTemp?: (number | null)[]; // [FL, FR, RL, RR] (°F)
}

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Computes post-race session debrief statistics from a collection of raw telemetry data points.
 */
export function calculateFrontendDebrief(points: RawTelemetryPoint[]): SessionDebriefData {
  const len = points.length;
  if (len === 0) {
    return {
      total_samples: 0,
      valid_laps: 0,
      tire_thermals: { fl_avg: null, fr_avg: null, rl_avg: null, rr_avg: null, status: "no_data" },
      suspension: { peak_travel_pct: null, bottom_out_count: null, status: "no_data" },
      handling_balance: { understeer_pct: null, oversteer_pct: null, tendency: "no_data" },
    };
  }

  const tireTemps: number[][] = [[], [], [], []];
  const suspensionValues: number[] = [];
  let bottomOuts = 0;

  let corneringTotal = 0;
  let understeerCount = 0;
  let oversteerCount = 0;

  const lapStartsSeen = new Set<number>();
  const completedLaps = new Set<number>();
  let previousLap: number | null = null;
  let previousLastLap: number | null = null;
  let pendingLap: number | null = null;

  for (let i = 0; i < len; i++) {
    const p = points[i];
    if (isFiniteNumber(p.LapNumber) && p.LapNumber >= 0) {
      const lapNumber = Math.trunc(p.LapNumber);
      if (isFiniteNumber(p.CurrentLap) && p.CurrentLap >= 0 && p.CurrentLap <= 0.5) {
        lapStartsSeen.add(lapNumber);
      }
    }
    if (isFiniteNumber(p.LapNumber) && p.LapNumber >= 0) {
      const lapNumber = Math.trunc(p.LapNumber);
      if (previousLap !== null && lapNumber > previousLap) {
        pendingLap = lapNumber === previousLap + 1 ? previousLap : null;
      }
      if (
        pendingLap !== null &&
        isFiniteNumber(p.LastLap) &&
        p.LastLap > 0 &&
        p.LastLap !== previousLastLap
      ) {
        completedLaps.add(pendingLap);
        pendingLap = null;
      }
      if (isFiniteNumber(p.LastLap)) previousLastLap = p.LastLap;
      previousLap = lapNumber;
    }

    // 1. Thermals (canonical unit is °F, convert to °C)
    // [PERF] Manual unrolling to avoid Array.from intermediate objects and closure overhead in high-frequency path
    const temps = p.TireTemp;
    if (temps) {
      for (let j = 0; j < 4; j++) {
        const temp = temps[j];
        if (isFiniteNumber(temp)) {
          tireTemps[j].push(((temp - 32) * 5) / 9);
        }
      }
    }

    // 2. Suspension
    const susp = p.SuspTravel;
    if (susp) {
      for (let j = 0; j < 4; j++) {
        const value = susp[j];
        if (isFiniteNumber(value)) {
          suspensionValues.push(value);
          if (value >= 0.95) bottomOuts++;
        }
      }
    }

    // 3. Handling Balance (Cornering if LatG >= 0.3G and Speed >= 10 m/s)
    const latG = p.AccelerationX;
    const speed = p.SpeedMetersPerSecond;
    if (isFiniteNumber(latG) && isFiniteNumber(speed) && Math.abs(latG) >= 2.94 && speed >= 10.0) {
      // [PERF] Manual unrolling to eliminate chaining array methods (.slice, .filter, .map, .reduce)
      // which allocate heavy intermediate arrays and generate GC pressure in large telemetry parsing blocks
      const angles = p.TireSlipAngle;
      if (angles) {
        const fl = angles[0];
        const fr = angles[1];
        const rl = angles[2];
        const rr = angles[3];

        let frontSum = 0;
        let frontCount = 0;
        if (isFiniteNumber(fl)) { frontSum += Math.abs(fl); frontCount++; }
        if (isFiniteNumber(fr)) { frontSum += Math.abs(fr); frontCount++; }

        let rearSum = 0;
        let rearCount = 0;
        if (isFiniteNumber(rl)) { rearSum += Math.abs(rl); rearCount++; }
        if (isFiniteNumber(rr)) { rearSum += Math.abs(rr); rearCount++; }

        if (frontCount > 0 && rearCount > 0) {
          const frontSlip = frontSum / frontCount;
          const rearSlip = rearSum / rearCount;

          corneringTotal++;
          if (frontSlip > rearSlip * 1.15) {
            understeerCount++;
          } else if (rearSlip > frontSlip * 1.15) {
            oversteerCount++;
          }
        }
      }
    }
  }

  const averages = tireTemps.map((values) =>
    values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null,
  );
  const [flAvg, frAvg, rlAvg, rrAvg] = averages;

  const knownTemps = averages.filter(isFiniteNumber);
  let thermalStatus: TireThermalSummary["status"] = "no_data";
  if (knownTemps.length > 0) {
    const maxTemp = knownTemps.reduce((max, value) => Math.max(max, value), -Infinity);
    thermalStatus = maxTemp > 105.0 ? "Overheating" : maxTemp < 65.0 ? "Cold" : "Optimal";
  }

  let suspStatus: SuspensionDebriefSummary["status"] = "no_data";
  if (suspensionValues.length > 0) {
    suspStatus = bottomOuts > 10 ? "Severe Bottoming" : bottomOuts > 0 ? "Occasional Bottoming" : "Optimal";
  }

  let understeerPct: number | null = null;
  let oversteerPct: number | null = null;
  let tendency: HandlingBalanceSummary["tendency"] = "no_data";

  if (corneringTotal > 0) {
    understeerPct = Math.round((understeerCount / corneringTotal) * 1000) / 10;
    oversteerPct = Math.round((oversteerCount / corneringTotal) * 1000) / 10;
    if (understeerPct >= 58.0) tendency = "Understeer Biased";
    else if (oversteerPct >= 58.0) tendency = "Oversteer Biased";
    else tendency = "Neutral / Balanced";
  }

  const lapsSet = new Set([...lapStartsSeen].filter((lap) => completedLaps.has(lap)));
  let peakSuspension = 0;
  for (const value of suspensionValues) {
    if (value > peakSuspension) peakSuspension = value;
  }
  return {
    total_samples: len,
    valid_laps: lapsSet.size,
    tire_thermals: {
      fl_avg: flAvg,
      fr_avg: frAvg,
      rl_avg: rlAvg,
      rr_avg: rrAvg,
      status: thermalStatus,
    },
    suspension: {
      peak_travel_pct: suspensionValues.length > 0 ? Math.round(peakSuspension * 1000) / 10 : null,
      bottom_out_count: suspensionValues.length > 0 ? bottomOuts : null,
      status: suspStatus,
    },
    handling_balance: {
      understeer_pct: understeerPct,
      oversteer_pct: oversteerPct,
      tendency,
    },
  };
}
