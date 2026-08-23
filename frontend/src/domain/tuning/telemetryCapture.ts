import type { TelemetryData } from '../../hooks/useTelemetry';

export interface TuningCaptureMetadata {
  label: string;
  purpose: string;
  carId: string;
  gameBuild: string;
  installedParts: string;
  tireType: string;
  surface: string;
  weather: string;
  eventType: string;
  track: string;
  shareCode: string;
  driverAssists: string;
  notes: string;
}

export interface TuningCaptureSample {
  timestampMS: number;
  isRaceOn: number;
  carOrdinal: number;
  speedMps: number;
  rpm: number;
  gear: number;
  accelInput: number;
  brakeInput: number;
  clutchInput: number;
  handBrakeInput: number;
  steerInput: number;
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  normalizedSuspensionTravel: number[];
  tireSlipRatio: number[];
  tireSlipAngle: number[];
  tireTemp: number[];
  tireCombinedSlip: number[];
  positionX: number;
  positionY: number;
  positionZ: number;
  surfaceRumble: number[];
  lapNumber: number;
  currentRaceTime: number;
}

export interface TuningCaptureFile {
  schemaVersion: 'tuning-capture/v1';
  capturedAt: string;
  metadata: TuningCaptureMetadata;
  samples: TuningCaptureSample[];
}

export interface TuningCaptureSummary {
  sampleCount: number;
  durationSeconds: number;
  cadenceHz: number;
  medianDeltaMs: number;
  maxSpeedKmh: number;
  maxLongitudinalG: number;
  maxLateralG: number;
  peakSlipRatio: number[];
  peakSlipAngleDeg: number[];
  maxTireTemp: number[];
  maxCombinedSlip: number[];
  droppedTimestampCount: number;
}

const finite = (value: number | undefined, fallback = 0): number => Number.isFinite(value) ? (value as number) : fallback;
const array4 = (value: number[] | undefined): number[] => Array.from({ length: 4 }, (_, index) => finite(value?.[index]));
const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function telemetryToCaptureSample(data: TelemetryData): TuningCaptureSample {
  return {
    timestampMS: finite(data.TimestampMS),
    isRaceOn: finite(data.IsRaceOn),
    carOrdinal: finite(data.CarOrdinal),
    speedMps: finite(data.SpeedMetersPerSecond),
    rpm: finite(data.CurrentEngineRpm),
    gear: finite(data.Gear),
    accelInput: finite(data.AccelInput),
    brakeInput: finite(data.BrakeInput),
    clutchInput: finite(data.ClutchInput),
    handBrakeInput: finite(data.HandBrakeInput),
    steerInput: finite(data.SteerInput),
    accelerationX: finite(data.AccelerationX),
    accelerationY: finite(data.AccelerationY),
    accelerationZ: finite(data.AccelerationZ),
    velocityX: finite(data.VelocityX),
    velocityY: finite(data.VelocityY),
    velocityZ: finite(data.VelocityZ),
    normalizedSuspensionTravel: array4(data.NormalizedSuspensionTravel),
    tireSlipRatio: array4(data.TireSlipRatio),
    tireSlipAngle: array4(data.TireSlipAngle),
    tireTemp: array4(data.TireTemp),
    tireCombinedSlip: array4(data.TireCombinedSlip),
    positionX: finite(data.PositionX),
    positionY: finite(data.PositionY),
    positionZ: finite(data.PositionZ),
    surfaceRumble: Array.from(data.SurfaceRumble ?? []).map((value) => finite(value)),
    lapNumber: finite(data.LapNumber),
    currentRaceTime: finite(data.CurrentRaceTime)
  };
}

export function summarizeCapture(samples: TuningCaptureSample[]): TuningCaptureSummary {
  if (samples.length === 0) {
    return { sampleCount: 0, durationSeconds: 0, cadenceHz: 0, medianDeltaMs: 0, maxSpeedKmh: 0, maxLongitudinalG: 0, maxLateralG: 0, peakSlipRatio: [0, 0, 0, 0], peakSlipAngleDeg: [0, 0, 0, 0], maxTireTemp: [0, 0, 0, 0], maxCombinedSlip: [0, 0, 0, 0], droppedTimestampCount: 0 };
  }

  // [PERF] Optimized single-pass loop processing to avoid .slice(), .map(), .filter(), and .reduce()
  // allocations over potentially large telemetry arrays (e.g., 50k+ elements).
  const deltas: number[] = [];
  let maxSpeedMps = 0;
  let maxLongG = 0;
  let maxLatG = 0;
  let droppedTimestampCount = 0;

  const peakSlipRatio = [0, 0, 0, 0];
  const peakSlipAngleDeg = [0, 0, 0, 0];
  const maxTireTemp = [0, 0, 0, 0];
  const maxCombinedSlip = [0, 0, 0, 0];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];

    if (i > 0) {
      const prevSample = samples[i - 1];
      const delta = sample.timestampMS - prevSample.timestampMS;
      if (delta > 0) {
        deltas.push(delta);
      }
      if (sample.timestampMS <= prevSample.timestampMS) {
        droppedTimestampCount++;
      }
    }

    if (sample.speedMps > maxSpeedMps) maxSpeedMps = sample.speedMps;

    const absLongG = Math.abs(sample.accelerationZ);
    if (absLongG > maxLongG) maxLongG = absLongG;

    const absLatG = Math.abs(sample.accelerationX);
    if (absLatG > maxLatG) maxLatG = absLatG;

    for (let w = 0; w < 4; w++) {
      const slipRatio = Math.abs(sample.tireSlipRatio[w] ?? 0);
      if (slipRatio > peakSlipRatio[w]) peakSlipRatio[w] = slipRatio;

      const slipAngle = Math.abs(sample.tireSlipAngle[w] ?? 0);
      if (slipAngle > peakSlipAngleDeg[w]) peakSlipAngleDeg[w] = slipAngle;

      const tireTemp = Math.abs(sample.tireTemp[w] ?? 0);
      if (tireTemp > maxTireTemp[w]) maxTireTemp[w] = tireTemp;

      const combinedSlip = Math.abs(sample.tireCombinedSlip[w] ?? 0);
      if (combinedSlip > maxCombinedSlip[w]) maxCombinedSlip[w] = combinedSlip;
    }
  }

  const sortedDeltas = deltas.sort((a, b) => a - b);
  const medianDeltaMs = sortedDeltas.length === 0 ? 0 : sortedDeltas[Math.floor(sortedDeltas.length / 2)];
  const durationSeconds = Math.max(0, (samples[samples.length - 1].timestampMS - samples[0].timestampMS) / 1000);

  return {
    sampleCount: samples.length,
    durationSeconds: round(durationSeconds, 3),
    cadenceHz: medianDeltaMs > 0 ? round(1000 / medianDeltaMs, 2) : 0,
    medianDeltaMs: round(medianDeltaMs, 3),
    maxSpeedKmh: round(maxSpeedMps * 3.6, 2),
    maxLongitudinalG: round(maxLongG / 9.80665, 3),
    maxLateralG: round(maxLatG / 9.80665, 3),
    peakSlipRatio: peakSlipRatio.map((value) => round(value, 4)),
    peakSlipAngleDeg: peakSlipAngleDeg.map((value) => round(value * 180 / Math.PI, 3)),
    maxTireTemp: maxTireTemp.map((value) => round(value, 2)),
    maxCombinedSlip: maxCombinedSlip.map((value) => round(value, 4)),
    droppedTimestampCount
  };
}

export function captureToCsv(capture: TuningCaptureFile): string {
  const headers = 'timestampMS,isRaceOn,carOrdinal,speedMps,rpm,gear,accelInput,brakeInput,clutchInput,handBrakeInput,steerInput,accelerationX,accelerationY,accelerationZ,velocityX,velocityY,velocityZ,suspensionFL,suspensionFR,suspensionRL,suspensionRR,slipRatioFL,slipRatioFR,slipRatioRL,slipRatioRR,slipAngleFL,slipAngleFR,slipAngleRL,slipAngleRR,tireTempFL,tireTempFR,tireTempRL,tireTempRR,combinedSlipFL,combinedSlipFR,combinedSlipRL,combinedSlipRR,positionX,positionY,positionZ,lapNumber,currentRaceTime';

  // [PERF] Optimized for large datasets by pre-allocating an array and using template
  // literals instead of nested .map() calls and rest operators. This eliminates massive
  // intermediate array allocations, prevents V8 garbage collection spikes during export,
  // and avoids Maximum Call Stack Exceeded errors when processing tens of thousands of rows.
  const len = capture.samples.length;
  const lines = new Array(len + 1);
  lines[0] = headers;

  for (let i = 0; i < len; i++) {
    const s = capture.samples[i];
    lines[i + 1] = `${s.timestampMS},${s.isRaceOn},${s.carOrdinal},${s.speedMps},${s.rpm},${s.gear},${s.accelInput},${s.brakeInput},${s.clutchInput},${s.handBrakeInput},${s.steerInput},${s.accelerationX},${s.accelerationY},${s.accelerationZ},${s.velocityX},${s.velocityY},${s.velocityZ},${s.normalizedSuspensionTravel[0]},${s.normalizedSuspensionTravel[1]},${s.normalizedSuspensionTravel[2]},${s.normalizedSuspensionTravel[3]},${s.tireSlipRatio[0]},${s.tireSlipRatio[1]},${s.tireSlipRatio[2]},${s.tireSlipRatio[3]},${s.tireSlipAngle[0]},${s.tireSlipAngle[1]},${s.tireSlipAngle[2]},${s.tireSlipAngle[3]},${s.tireTemp[0]},${s.tireTemp[1]},${s.tireTemp[2]},${s.tireTemp[3]},${s.tireCombinedSlip[0]},${s.tireCombinedSlip[1]},${s.tireCombinedSlip[2]},${s.tireCombinedSlip[3]},${s.positionX},${s.positionY},${s.positionZ},${s.lapNumber},${s.currentRaceTime}`;
  }
  return lines.join('\n');
}
