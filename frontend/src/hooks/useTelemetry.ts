import { useState, useEffect } from "react";

export interface TelemetryData {
  IsRaceOn: number;
  TimestampMS: number;
  CarOrdinal?: number;
  CarClass?: number;
  CarPerformanceIndex?: number;
  EngineMaxRpm: number;
  EngineIdleRpm: number;
  CurrentEngineRpm: number;
  AccelerationX: number;
  AccelerationY: number;
  AccelerationZ: number;
  VelocityX: number;
  VelocityY: number;
  VelocityZ: number;
  Yaw: number;
  NormalizedSuspensionTravel: number[];
  TireSlipRatio: number[];
  TireSlipAngle: number[];
  PositionX?: number;
  PositionY?: number;
  PositionZ?: number;
  SpeedMetersPerSecond?: number;
  PowerWatts?: number;
  TorqueNewtons?: number;
  TireTemp?: number[];
  Boost?: number;
  Fuel?: number;
  BestLap?: number;
  LastLap?: number;
  CurrentLap?: number;
  AccelInput?: number;
  BrakeInput?: number;
  ClutchInput?: number;
  HandBrakeInput?: number;
  Gear?: number;
  SteerInput?: number;
  Pitch?: number;
  Roll?: number;
  SurfaceRumble?: number[];
  TireCombinedSlip?: number[];
  Cylinders?: number;
  DistanceTraveled?: number;
  CurrentRaceTime?: number;
  LapNumber?: number;
  RacePosition?: number;
}

let sharedWs: WebSocket | null = null;
let latestData: TelemetryData | null = null;
let connectionState = false;
let subscribers = 0;
let reconnectTimeout: ReturnType<typeof setTimeout>;

// 60Hz Event Emitter for high-performance Canvas rendering (Bypasses React)
export const telemetryEmitter = new EventTarget();



// Standby Idle Telemetry broadcast removed to ensure HUD only updates on live UDP telemetry data.

export function useTelemetry(url: string = "ws://127.0.0.1:8001/ws/telemetry") {
  const [data, setData] = useState<TelemetryData | null>(latestData);
  const [isConnected, setIsConnected] = useState(connectionState);

  useEffect(() => {
    subscribers++;

    const connect = () => {
      if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
        return;
      }

      let finalUrl = url;
      if (url.includes("8001")) {
        const port = (window as any).BACKEND_PORT || 8001;
        finalUrl = url.replace("8001", port.toString());
      }

      sharedWs = new WebSocket(finalUrl);

      sharedWs.onopen = () => {
        connectionState = true;
        console.log("Telemetry WebSocket connected.");
      };

const hudBroadcastChannel = typeof window !== 'undefined' ? new BroadcastChannel('horizon_tuner_hud_channel') : null;

function formatHudTelemetry(raw: TelemetryData) {
  const isMetric = true;
  const speedKmh = (raw.SpeedMetersPerSecond || 0) * 3.6;
  const speedMph = (raw.SpeedMetersPerSecond || 0) * 2.23694;
  const hp = ((raw.PowerWatts || 0) / 745.7);
  const ftlbs = ((raw.TorqueNewtons || 0) * 0.737562);
  const kw = (raw.PowerWatts || 0) / 1000;
  const nm = raw.TorqueNewtons || 0;
  const boostPsi = (raw.Boost || 0) * 0.145038;
  const boostBar = (raw.Boost || 0) * 0.01;

  const maxRpm = raw.EngineMaxRpm || 7000;
  const idleRpm = raw.EngineIdleRpm || 1000;
  const redlineRpm = Math.round(maxRpm * 0.93);
  const isRaceOn = raw.IsRaceOn ?? 1;

  const brakeRatio = (raw.BrakeInput || 0) / 255;
  const slipFL = raw.TireSlipRatio?.[0] || 0;
  const slipFR = raw.TireSlipRatio?.[1] || 0;
  const slipRL = raw.TireSlipRatio?.[2] || 0;
  const slipRR = raw.TireSlipRatio?.[3] || 0;

  const lockup = {
    fl: brakeRatio > 0.1 && slipFL < -0.1,
    fr: brakeRatio > 0.1 && slipFR < -0.1,
    rl: brakeRatio > 0.1 && slipRL < -0.1,
    rr: brakeRatio > 0.1 && slipRR < -0.1,
  };

  const sessionMaxima = {
    power: hp,
    torque: ftlbs,
    boost: boostPsi,
  };

  return {
    isRaceOn,
    is_race_on: isRaceOn,
    timestamp_ms: raw.TimestampMS || 0,
    carOrdinal: raw.CarOrdinal || 1,
    car_ordinal: raw.CarOrdinal || 1,
    carClass: raw.CarClass || 0,
    car_class: raw.CarClass || 0,
    carPi: raw.CarPerformanceIndex || 0,
    car_pi: raw.CarPerformanceIndex || 0,
    maxRpm,
    max_rpm: maxRpm,
    idleRpm,
    idle_rpm: idleRpm,
    redlineRpm,
    rpm: raw.CurrentEngineRpm || 0,
    accel_x: raw.AccelerationX || 0,
    accel_y: raw.AccelerationY || 0,
    accel_z: raw.AccelerationZ || 0,
    vel_x: raw.VelocityX || 0,
    vel_y: raw.VelocityY || 0,
    vel_z: raw.VelocityZ || 0,
    speed: isMetric ? speedKmh : speedMph,
    speed_kmh: speedKmh,
    speed_mph: speedMph,
    power: isMetric ? kw : hp,
    power_hp: hp,
    power_kw: kw,
    torque: isMetric ? nm : ftlbs,
    torque_nm: nm,
    torque_ftlbs: ftlbs,
    boost: isMetric ? boostBar : boostPsi,
    boost_psi: boostPsi,
    boost_bar: boostBar,
    gear: raw.Gear || 0,
    throttle: (raw.AccelInput || 0) / 255,
    brake: brakeRatio,
    clutch: (raw.ClutchInput || 0) / 255,
    hand_brake: raw.HandBrakeInput || 0,
    steer: raw.SteerInput || 0,
    slip_fl: slipFL,
    slip_fr: slipFR,
    slip_rl: slipRL,
    slip_rr: slipRR,
    TireTemp: raw.TireTemp || [0, 0, 0, 0],
    temp_fl: raw.TireTemp?.[0] ?? 0,
    temp_fr: raw.TireTemp?.[1] ?? 0,
    temp_rl: raw.TireTemp?.[2] ?? 0,
    temp_rr: raw.TireTemp?.[3] ?? 0,
    susp_fl: raw.NormalizedSuspensionTravel?.[0] || 0,
    susp_fr: raw.NormalizedSuspensionTravel?.[1] || 0,
    susp_rl: raw.NormalizedSuspensionTravel?.[2] || 0,
    susp_rr: raw.NormalizedSuspensionTravel?.[3] || 0,
    num_cylinders: raw.Cylinders || 4,
    lockup,
    sessionMaxima,
    lcState: 'inactive'
  };
}

      sharedWs.onmessage = (event) => {
        try {
          latestData = JSON.parse(event.data);
          // Dispatch high-frequency 60Hz event directly to Canvas components
          telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: latestData }));
          window.dispatchEvent(new CustomEvent('hud:frame', { detail: latestData }));
          
          // Forward telemetry to Horizon Tuner HUD window via BroadcastChannel
          if (latestData && hudBroadcastChannel) {
            hudBroadcastChannel.postMessage({
              type: 'telemetry',
              data: formatHudTelemetry(latestData)
            });
          }
        } catch (e) {
          console.error("Error parsing telemetry data:", e);
        }
      };

      sharedWs.onclose = () => {
        connectionState = false;
        sharedWs = null;
        console.log("Telemetry WebSocket closed. Reconnecting...");
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connect, 2000);
      };
      
      sharedWs.onerror = (e) => {
        console.error("Telemetry WebSocket error:", e);
        if (sharedWs) sharedWs.close();
      };
    };

    if (subscribers === 1) {
      connect();
    }

    // [MEMORY OPTIMIZATION] Throttle React State updates to 5Hz to prevent massive Fiber garbage collection
    // This provides readable text for the UI while the Canvas uses the 60Hz emitter above
    const interval = setInterval(() => {
      setData(latestData);
      setIsConnected(connectionState);
    }, 1000 / 5);

    return () => {
      clearInterval(interval);
      subscribers--;
      if (subscribers === 0) {
        clearTimeout(reconnectTimeout);
        if (sharedWs) {
          sharedWs.close();
          sharedWs = null;
        }
      }
    };
  }, [url]);

  return { data, isConnected };
}
