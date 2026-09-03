/** Pure functions for calculating post-race vehicle health and handling debrief metrics. */

export interface TireThermalSummary {
  fl_avg: number;
  fr_avg: number;
  rl_avg: number;
  rr_avg: number;
  status: "Optimal" | "Overheating" | "Cold" | "no_data";
}

export interface SuspensionDebriefSummary {
  peak_travel_pct: number;
  bottom_out_count: number;
  status: "Optimal" | "Occasional Bottoming" | "Severe Bottoming" | "no_data";
}

export interface HandlingBalanceSummary {
  understeer_pct: number;
  oversteer_pct: number;
  tendency: "Understeer Biased" | "Oversteer Biased" | "Neutral / Balanced";
}

export interface SessionDebriefData {
  total_samples: number;
  valid_laps: number;
  tire_thermals: TireThermalSummary;
  suspension: SuspensionDebriefSummary;
  handling_balance: HandlingBalanceSummary;
}

export interface RawTelemetryPoint {
  time?: number;
  LapNumber?: number;
  SpeedMetersPerSecond?: number;
  AccelerationX?: number; // Lat G
  AccelerationZ?: number; // Lon G
  SuspTravel?: number[]; // [FL, FR, RL, RR] (0.0 - 1.0)
  TireSlipAngle?: number[]; // [FL, FR, RL, RR] (rad)
  TireTemp?: number[]; // [FL, FR, RL, RR] (°F or °C)
}

/**
 * Computes post-race session debrief statistics from a collection of raw telemetry data points.
 */
export function calculateFrontendDebrief(points: RawTelemetryPoint[]): SessionDebriefData {
  const len = points.length;
  if (len === 0) {
    return {
      total_samples: 0,
      valid_laps: 0,
      tire_thermals: { fl_avg: 0, fr_avg: 0, rl_avg: 0, rr_avg: 0, status: "no_data" },
      suspension: { peak_travel_pct: 0, bottom_out_count: 0, status: "no_data" },
      handling_balance: { understeer_pct: 50, oversteer_pct: 50, tendency: "Neutral / Balanced" },
    };
  }

  let sumFl = 0, sumFr = 0, sumRl = 0, sumRr = 0;
  let maxSusp = 0;
  let bottomOuts = 0;

  let corneringTotal = 0;
  let understeerCount = 0;
  let oversteerCount = 0;

  const lapsSet = new Set<number>();

  for (let i = 0; i < len; i++) {
    const p = points[i];
    if (p.LapNumber && p.LapNumber > 0) {
      lapsSet.add(p.LapNumber);
    }

    // 1. Thermals (canonical unit is °F, convert to °C)
    const temps = p.TireTemp || [180, 180, 180, 180];
    const flC = ((temps[0] - 32) * 5) / 9;
    const frC = ((temps[1] - 32) * 5) / 9;
    const rlC = ((temps[2] - 32) * 5) / 9;
    const rrC = ((temps[3] - 32) * 5) / 9;

    sumFl += flC;
    sumFr += frC;
    sumRl += rlC;
    sumRr += rrC;

    // 2. Suspension
    const susp = p.SuspTravel || [0, 0, 0, 0];
    for (let s = 0; s < 4; s++) {
      const val = susp[s];
      if (val > maxSusp) maxSusp = val;
      if (val >= 0.95) bottomOuts++;
    }

    // 3. Handling Balance (Cornering if LatG >= 0.3G and Speed >= 10 m/s)
    const latG = Math.abs(p.AccelerationX || 0);
    const speed = p.SpeedMetersPerSecond || 0;
    if (latG >= 2.94 && speed >= 10.0) {
      const angles = p.TireSlipAngle || [0, 0, 0, 0];
      const frontSlip = (Math.abs(angles[0]) + Math.abs(angles[1])) / 2.0;
      const rearSlip = (Math.abs(angles[2]) + Math.abs(angles[3])) / 2.0;

      corneringTotal++;
      if (frontSlip > rearSlip * 1.15) {
        understeerCount++;
      } else if (rearSlip > frontSlip * 1.15) {
        oversteerCount++;
      }
    }
  }

  const flAvg = Math.round((sumFl / len) * 10) / 10;
  const frAvg = Math.round((sumFr / len) * 10) / 10;
  const rlAvg = Math.round((sumRl / len) * 10) / 10;
  const rrAvg = Math.round((sumRr / len) * 10) / 10;

  const maxTemp = Math.max(flAvg, frAvg, rlAvg, rrAvg);
  let thermalStatus: TireThermalSummary["status"] = "Optimal";
  if (maxTemp > 105.0) thermalStatus = "Overheating";
  else if (maxTemp < 65.0) thermalStatus = "Cold";

  let suspStatus: SuspensionDebriefSummary["status"] = "Optimal";
  if (bottomOuts > 10) suspStatus = "Severe Bottoming";
  else if (bottomOuts > 0) suspStatus = "Occasional Bottoming";

  let understeerPct = 50.0;
  let oversteerPct = 50.0;
  let tendency: HandlingBalanceSummary["tendency"] = "Neutral / Balanced";

  if (corneringTotal > 0) {
    understeerPct = Math.round((understeerCount / corneringTotal) * 1000) / 10;
    oversteerPct = Math.round((oversteerCount / corneringTotal) * 1000) / 10;
    if (understeerPct >= 58.0) tendency = "Understeer Biased";
    else if (oversteerPct >= 58.0) tendency = "Oversteer Biased";
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
      peak_travel_pct: Math.round(maxSusp * 1000) / 10,
      bottom_out_count: bottomOuts,
      status: suspStatus,
    },
    handling_balance: {
      understeer_pct: understeerPct,
      oversteer_pct: oversteerPct,
      tendency,
    },
  };
}