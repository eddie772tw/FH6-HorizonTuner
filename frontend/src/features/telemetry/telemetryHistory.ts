import { useEffect, useState } from 'react';
import { telemetryEmitter, type TelemetryData } from '../../hooks/useTelemetry';

export const TELEMETRY_HISTORY_WINDOW_MS = 30_000;
export const TELEMETRY_HISTORY_SAMPLE_MS = 100;

type FourValues = readonly [number, number, number, number];

export interface TelemetryHistorySample {
  timestampMs: number;
  timeSeconds: number;
  suspension: FourValues;
  tireTemp: FourValues | null;
  slipRatio: FourValues;
  slipAngle: FourValues;
  combinedSlip: FourValues | null;
  surfaceRumble: FourValues | null;
  acceleration: readonly [number, number, number];
  pitch: number | null;
  roll: number | null;
  yaw: number | null;
  speedMetersPerSecond: number | null;
  rpm: number | null;
  powerWatts: number | null;
  torqueNewtons: number | null;
  boost: number | null;
  gear: number | null;
  steerInput: number | null;
  accelInput: number | null;
  brakeInput: number | null;
  clutchInput: number | null;
  handBrakeInput: number | null;
}

type HistoryListener = () => void;

const finiteOrNull = (value: number | undefined): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const readFour = (values: number[] | undefined): FourValues | null => {
  if (!Array.isArray(values) || values.length < 4) return null;
  const result: [number, number, number, number] = [values[0], values[1], values[2], values[3]];
  return result.every((value) => Number.isFinite(value)) ? result : null;
};

const requiredFour = (values: number[] | undefined): FourValues => {
  const result = readFour(values);
  return result ?? [0, 0, 0, 0];
};

const requiredThree = (x: number, y: number, z: number): readonly [number, number, number] => [
  Number.isFinite(x) ? x : 0,
  Number.isFinite(y) ? y : 0,
  Number.isFinite(z) ? z : 0,
];

export class TelemetryHistoryStore {
  private readonly capacity = Math.ceil(TELEMETRY_HISTORY_WINDOW_MS / TELEMETRY_HISTORY_SAMPLE_MS);
  private readonly samples: Array<TelemetryHistorySample | undefined> = new Array(this.capacity);
  private writeIndex = 0;
  private size = 0;
  private lastSampleTimestamp = -Infinity;
  private lastNotifyTimestamp = -Infinity;
  private lastCarOrdinal: number | undefined;
  private lastRaceState: number | undefined;
  private readonly listeners = new Set<HistoryListener>();

  constructor() {
    telemetryEmitter.addEventListener('update', this.handleUpdate);
  }

  private readonly handleUpdate = (event: Event) => {
    const data = (event as CustomEvent<TelemetryData>).detail;
    this.record(data);
  };

  public record(data: TelemetryData | null | undefined): void {
    if (!data || (typeof window !== 'undefined' && (window as unknown as { __IS_HUD_PAUSED__?: boolean }).__IS_HUD_PAUSED__)) {
      return;
    }

    const timestampMs = finiteOrNull(data.TimestampMS)?.valueOf() ?? performance.now();
    const carChanged = this.lastCarOrdinal !== undefined && this.lastCarOrdinal !== data.CarOrdinal;
    const raceChanged = this.lastRaceState !== undefined && this.lastRaceState !== data.IsRaceOn;
    if (carChanged || raceChanged) this.clear();
    this.lastCarOrdinal = data.CarOrdinal;
    this.lastRaceState = data.IsRaceOn;

    if (data.IsRaceOn !== 1) return;
    if (timestampMs < this.lastSampleTimestamp) this.clear();
    if (timestampMs - this.lastSampleTimestamp < TELEMETRY_HISTORY_SAMPLE_MS) return;

    const sample: TelemetryHistorySample = {
      timestampMs,
      timeSeconds: timestampMs / 1000,
      suspension: requiredFour(data.NormalizedSuspensionTravel),
      tireTemp: readFour(data.TireTemp),
      slipRatio: requiredFour(data.TireSlipRatio),
      slipAngle: requiredFour(data.TireSlipAngle),
      combinedSlip: readFour(data.TireCombinedSlip),
      surfaceRumble: readFour(data.SurfaceRumble),
      acceleration: requiredThree(data.AccelerationX, data.AccelerationY, data.AccelerationZ),
      pitch: finiteOrNull(data.Pitch),
      roll: finiteOrNull(data.Roll),
      yaw: finiteOrNull(data.Yaw),
      speedMetersPerSecond: finiteOrNull(data.SpeedMetersPerSecond),
      rpm: finiteOrNull(data.CurrentEngineRpm),
      powerWatts: finiteOrNull(data.PowerWatts),
      torqueNewtons: finiteOrNull(data.TorqueNewtons),
      boost: finiteOrNull(data.Boost),
      gear: finiteOrNull(data.Gear),
      steerInput: finiteOrNull(data.SteerInput),
      accelInput: finiteOrNull(data.AccelInput),
      brakeInput: finiteOrNull(data.BrakeInput),
      clutchInput: finiteOrNull(data.ClutchInput),
      handBrakeInput: finiteOrNull(data.HandBrakeInput),
    };

    this.samples[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
    this.lastSampleTimestamp = timestampMs;

    if (timestampMs - this.lastNotifyTimestamp >= 200) {
      this.lastNotifyTimestamp = timestampMs;
      for (const listener of this.listeners) listener();
    }
  }

  public clear(): void {
    this.writeIndex = 0;
    this.size = 0;
    this.lastSampleTimestamp = -Infinity;
    this.lastNotifyTimestamp = -Infinity;
  }

  public getSnapshot(): TelemetryHistorySample[] {
    const result: TelemetryHistorySample[] = [];
    const firstIndex = (this.writeIndex - this.size + this.capacity) % this.capacity;
    for (let offset = 0; offset < this.size; offset += 1) {
      const sample = this.samples[(firstIndex + offset) % this.capacity];
      if (sample) result.push(sample);
    }
    return result;
  }

  public subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const telemetryHistoryStore = new TelemetryHistoryStore();

export function useTelemetryHistory(): TelemetryHistorySample[] {
  const [snapshot, setSnapshot] = useState<TelemetryHistorySample[]>(() => telemetryHistoryStore.getSnapshot());

  useEffect(() => telemetryHistoryStore.subscribe(() => setSnapshot(telemetryHistoryStore.getSnapshot())), []);

  return snapshot;
}
