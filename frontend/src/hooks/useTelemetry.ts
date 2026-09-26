import { useState, useEffect } from "react";
import { backendWebSocketUrl } from "../services/backend";
import { getRuntimeCapabilities } from '../services/runtimeCapabilities';
import { FrameInterpolator } from "../utils/frameInterpolator";

export interface TelemetryData {
  TelemetrySchema?: string;
  DrivetrainType?: number;
  AngularVelocityX?: number;
  AngularVelocityY?: number;
  AngularVelocityZ?: number;
  WheelRotationSpeed?: number[];
  WheelOnRumbleStrip?: number[];
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
  SuspensionTravelMeters?: number[];
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
// One channel belongs to the shared telemetry runtime, including reconnects.
let hudBroadcastChannel: BroadcastChannel | null = null;
export const PA_PER_BAR = 100_000;
export const PA_PER_PSI = 6894.75729;
export const PA_PER_KPA = 1_000;

export interface BoostUnitValues {
  bar: number;
  psi: number;
  kpa: number;
}

export function convertRawBoostToUnits(rawBoostPa?: number | null): BoostUnitValues {
  const pa = typeof rawBoostPa === 'number' && Number.isFinite(rawBoostPa) ? Math.max(0, rawBoostPa) : 0;
  return {
    bar: pa / PA_PER_BAR,
    psi: pa / PA_PER_PSI,
    kpa: pa / PA_PER_KPA,
  };
}

export type HudDisplayUnits = {
  speed: 'kmh' | 'mph';
  power: 'kw' | 'hp' | 'ps';
  torque: 'nm' | 'lbft';
  boostPressure: 'bar' | 'psi' | 'kpa';
};

export const defaultHudDisplayUnits: HudDisplayUnits = {
  speed: 'kmh',
  power: 'kw',
  torque: 'nm',
  boostPressure: 'bar',
};

let hudDisplayUnits: HudDisplayUnits = { ...defaultHudDisplayUnits };

export interface HudSessionState {
  peakSessionPower: number;
  peakSessionTorque: number;
  peakSessionBoost: number;
  lastCarOrdinal: number | null;
}

export function createDefaultHudSessionState(): HudSessionState {
  return {
    peakSessionPower: 100,
    peakSessionTorque: 100,
    peakSessionBoost: 1.5,
    lastCarOrdinal: null,
  };
}

export function formatHudTelemetry(
  raw: TelemetryData,
  displayUnits: HudDisplayUnits = hudDisplayUnits,
  sessionState?: HudSessionState
) {
  const session = sessionState ?? createDefaultHudSessionState();

  const speedKmh = (raw.SpeedMetersPerSecond || 0) * 3.6;
  const speedMph = (raw.SpeedMetersPerSecond || 0) * 2.23694;
  const hp = ((raw.PowerWatts || 0) / 745.7);
  const ftlbs = ((raw.TorqueNewtons || 0) * 0.737562);
  const kw = (raw.PowerWatts || 0) / 1000;
  const ps = kw * 1.35962;
  const nm = raw.TorqueNewtons || 0;

  const { bar: boostBar, psi: boostPsi, kpa: boostKpa } = convertRawBoostToUnits(raw.Boost);

  const displayPower = displayUnits.power === 'kw' ? kw : displayUnits.power === 'ps' ? ps : hp;
  const displayTorque = displayUnits.torque === 'lbft' ? ftlbs : nm;
  const displayBoost = displayUnits.boostPressure === 'psi'
    ? boostPsi
    : displayUnits.boostPressure === 'kpa' ? boostKpa : boostBar;

  const maxRpm = raw.EngineMaxRpm || 7000;
  const idleRpm = raw.EngineIdleRpm || 1000;
  const redlineRpm = Math.max(0, maxRpm - 1000);
  const isRaceOn = raw.IsRaceOn ?? 1;

  if (session.lastCarOrdinal !== null && session.lastCarOrdinal !== raw.CarOrdinal) {
    session.peakSessionPower = 100;
    session.peakSessionTorque = 100;
    session.peakSessionBoost = 1.5;
  }
  session.lastCarOrdinal = raw.CarOrdinal || 1;

  if (displayPower > session.peakSessionPower) session.peakSessionPower = displayPower;
  if (displayTorque > session.peakSessionTorque) session.peakSessionTorque = displayTorque;
  if (displayBoost > session.peakSessionBoost) session.peakSessionBoost = displayBoost;

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
    power: session.peakSessionPower,
    torque: session.peakSessionTorque,
    boost: session.peakSessionBoost,
    maxHP: session.peakSessionPower,
    maxTQ: session.peakSessionTorque,
    maxBoost: session.peakSessionBoost,
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
    displayUnits,
    speed: displayUnits.speed === 'mph' ? speedMph : speedKmh,
    speed_kmh: speedKmh,
    speed_mph: speedMph,
    power: displayPower,
    power_unit: displayUnits.power === 'kw' ? 'kW' : displayUnits.power === 'ps' ? 'PS' : 'HP',
    power_hp: hp,
    power_kw: kw,
    power_ps: ps,
    torque: displayTorque,
    torque_unit: displayUnits.torque === 'lbft' ? 'LB·FT' : 'N·m',
    torque_nm: nm,
    torque_ftlbs: ftlbs,
    boost: displayBoost,
    boost_unit: displayUnits.boostPressure === 'kpa' ? 'kPa' : displayUnits.boostPressure.toUpperCase(),
    boost_psi: boostPsi,
    boost_bar: boostBar,
    boost_kpa: boostKpa,
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

// High-refresh timestamp-based frame pacing interpolator
const sharedInterpolator = new FrameInterpolator();
let sharedRafId: number | null = null;

function startSharedRenderLoop() {
  if (sharedRafId !== null || typeof window === "undefined") return;
  function renderLoop() {
    if (subscribers <= 0) {
      sharedRafId = null;
      return;
    }
    const interpolated = sharedInterpolator.interpolate(performance.now()) as TelemetryData;
    if (interpolated && typeof interpolated === "object" && Object.keys(interpolated).length > 0) {
      telemetryEmitter.dispatchEvent(new CustomEvent("update", { detail: interpolated }));
      window.dispatchEvent(new CustomEvent("hud:frame", { detail: interpolated }));
    }
    sharedRafId = requestAnimationFrame(renderLoop);
  }
  sharedRafId = requestAnimationFrame(renderLoop);
}

function stopSharedRenderLoop() {
  if (sharedRafId !== null && typeof window !== "undefined") {
    cancelAnimationFrame(sharedRafId);
    sharedRafId = null;
  }
  sharedInterpolator.reset();
}

// High-Refresh Event Emitter for high-performance Canvas rendering (Bypasses React)
export const telemetryEmitter = new EventTarget();

// Measurement subscribers receive each decoded WebSocket packet once, before
// display interpolation. HUD frame events are deliberately a separate stream.
const decodedSubscribers = new Set<(frame: TelemetryData) => void>();
export function subscribeToDecodedTelemetry(listener: (frame: TelemetryData) => void) {
  decodedSubscribers.add(listener);
  return () => { decodedSubscribers.delete(listener); };
}

export function useTelemetry(url?: string) {
  const [data, setData] = useState<TelemetryData | null>(latestData);
  const [isConnected, setIsConnected] = useState(connectionState);

  useEffect(() => {
    subscribers++;

    const connect = () => {
      if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
        return;
      }

      sharedWs = new WebSocket(url ?? backendWebSocketUrl("/ws/telemetry"));

      sharedWs.onopen = () => {
        connectionState = true;
        console.log("Telemetry WebSocket connected.");
      };

      if (getRuntimeCapabilities().hudOverlay && !hudBroadcastChannel && typeof window !== 'undefined') {
        hudBroadcastChannel = new BroadcastChannel('horizon_tuner_hud_channel');
        hudBroadcastChannel.addEventListener('message', event => {
          if (event.data?.type !== 'config') return;
          const effective = event.data.data?.effectiveUnits;
          if (effective) hudDisplayUnits = { ...hudDisplayUnits, ...effective };
        });
      }

      const sessionState = createDefaultHudSessionState();

      sharedWs.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && typeof parsed === 'object') {
            latestData = parsed;
            for (const listener of decodedSubscribers) {
              try { listener(parsed); }
              catch (error) { console.error('Decoded telemetry subscriber failed:', error); }
            }
            sharedInterpolator.pushSample(parsed, performance.now());
            startSharedRenderLoop();
            
            // Forward telemetry to Horizon Tuner HUD window via BroadcastChannel
            if (hudBroadcastChannel) {
              hudBroadcastChannel.postMessage({
                type: 'telemetry',
                data: formatHudTelemetry(parsed, hudDisplayUnits, sessionState)
              });
            }
          }
        } catch (e) {
          console.error("Error parsing telemetry data:", e);
        }
      };

      sharedWs.onclose = () => {
        connectionState = false;
        sharedWs = null;
        stopSharedRenderLoop();
        if (subscribers > 0) {
          console.log("Telemetry WebSocket closed. Reconnecting...");
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connect, 2000);
        } else {
          console.log("Telemetry WebSocket closed. No subscribers, stopping reconnection.");
        }
      };
      
      sharedWs.onerror = (e) => {
        console.error("Telemetry WebSocket error:", e);
        connectionState = false;
        if (sharedWs) sharedWs.close();
      };
    };

    if (subscribers === 1) {
      connect();
    }

    // [MEMORY OPTIMIZATION] Throttle React State updates to 5Hz to prevent massive Fiber garbage collection
    // This provides readable text for the UI while the Canvas uses the High-Refresh emitter above
    const interval = setInterval(() => {
      setData(latestData);
      setIsConnected(connectionState);
    }, 1000 / 5);

    return () => {
      clearInterval(interval);
      subscribers--;
      if (subscribers === 0) {
        clearTimeout(reconnectTimeout);
        stopSharedRenderLoop();
        hudBroadcastChannel?.close();
        hudBroadcastChannel = null;
        if (sharedWs) {
          sharedWs.onclose = null;
          sharedWs.onerror = null;
          sharedWs.close();
          sharedWs = null;
          connectionState = false;
        }
      }
    };
  }, [url]);

  return { data, isConnected };
}
