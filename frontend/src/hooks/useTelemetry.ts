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

      sharedWs.onmessage = (event) => {
        try {
          latestData = JSON.parse(event.data);
          // Dispatch high-frequency 60Hz event directly to Canvas components
          telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: latestData }));
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
