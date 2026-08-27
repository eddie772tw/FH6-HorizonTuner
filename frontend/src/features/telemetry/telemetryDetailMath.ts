import type { TelemetryData } from '../../hooks/useTelemetry';
import type { TelemetryHistorySample } from './telemetryHistory';

export const TELEMETRY_CORNERS = ['FL', 'FR', 'RL', 'RR'] as const;
export type TelemetryCorner = typeof TELEMETRY_CORNERS[number];

export interface SeriesSummary {
  minimum: number | null;
  maximum: number | null;
  average: number | null;
}

export interface SuspensionDetailMetrics {
  current: readonly (number | null)[];
  summaries: readonly SeriesSummary[];
  frontAverage: number | null;
  rearAverage: number | null;
  leftAverage: number | null;
  rightAverage: number | null;
  frontRearDifference: number | null;
  leftRightDifference: number | null;
  travelRate: number | null;
  bottomOut: readonly (boolean | null)[];
}

export interface TireDetailMetrics {
  temperature: readonly (number | null)[];
  slipRatio: readonly (number | null)[];
  slipAngle: readonly (number | null)[];
  combinedSlip: readonly (number | null)[];
  surfaceRumble: readonly (number | null)[];
}

export type TelemetryChartPoint = Record<string, number | null> & { time: number };

export interface TireTrendChartData {
  temperature: TelemetryChartPoint[];
  slipRatio: TelemetryChartPoint[];
  slipAngle: TelemetryChartPoint[];
  combinedSlip: TelemetryChartPoint[];
  surfaceRumble: TelemetryChartPoint[];
}

export const finiteOrNull = (value: number | undefined | null): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

export const readFour = (values: readonly number[] | undefined): readonly (number | null)[] => (
  Array.from({ length: 4 }, (_, index) => finiteOrNull(values?.[index]))
);

const averagePair = (first: number | null, second: number | null): number | null => (
  first === null || second === null ? null : (first + second) / 2
);

const averageFour = (values: readonly (number | null)[]): number | null => (
  values.length < 4 || values.some((value) => value === null)
    ? null
    : (values[0]! + values[1]! + values[2]! + values[3]!) / 4
);

export const summarizeSeries = (values: readonly (number | null)[]): SeriesSummary => {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finiteValues.length === 0) return { minimum: null, maximum: null, average: null };
  return {
    minimum: Math.min(...finiteValues),
    maximum: Math.max(...finiteValues),
    average: finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length,
  };
};

export const toChartPoints = (
  history: readonly TelemetryHistorySample[],
  selector: (sample: TelemetryHistorySample) => Record<string, number | null>,
): TelemetryChartPoint[] => {
  const first = history[0]?.timeSeconds ?? 0;
  const result: TelemetryChartPoint[] = new Array(history.length);
  for (let index = 0; index < history.length; index += 1) {
    const sample = history[index];
    result[index] = {
      time: Math.round((sample.timeSeconds - first) * 10) / 10,
      ...selector(sample),
    };
  }
  return result;
};

export const calculateSuspensionMetrics = (
  current: TelemetryData | null,
  history: readonly TelemetryHistorySample[],
): SuspensionDetailMetrics => {
  const currentValues = readFour(current?.NormalizedSuspensionTravel);
  const cornerHistory = TELEMETRY_CORNERS.map((_, index) => history.map((sample) => sample.suspension[index]));
  const firstAverage = averageFour(history[0]?.suspension ?? []);
  const lastSample = history.length > 0 ? history[history.length - 1] : undefined;
  const lastAverage = averageFour(lastSample?.suspension ?? []);
  const firstTime = history[0]?.timeSeconds;
  const lastTime = lastSample?.timeSeconds;
  const elapsed = firstTime === undefined || lastTime === undefined ? null : lastTime - firstTime;

  return {
    current: currentValues,
    summaries: cornerHistory.map(summarizeSeries),
    frontAverage: averagePair(currentValues[0], currentValues[1]),
    rearAverage: averagePair(currentValues[2], currentValues[3]),
    leftAverage: averagePair(currentValues[0], currentValues[2]),
    rightAverage: averagePair(currentValues[1], currentValues[3]),
    frontRearDifference: averagePair(currentValues[0], currentValues[1]) === null || averagePair(currentValues[2], currentValues[3]) === null
      ? null
      : averagePair(currentValues[0], currentValues[1])! - averagePair(currentValues[2], currentValues[3])!,
    leftRightDifference: averagePair(currentValues[0], currentValues[2]) === null || averagePair(currentValues[1], currentValues[3]) === null
      ? null
      : averagePair(currentValues[0], currentValues[2])! - averagePair(currentValues[1], currentValues[3])!,
    travelRate: elapsed === null || elapsed <= 0 || firstAverage === null || lastAverage === null
      ? null
      : (lastAverage - firstAverage) / elapsed,
    bottomOut: currentValues.map((value) => value === null ? null : value >= 0.95),
  };
};

export const readTireMetrics = (current: TelemetryData | null): TireDetailMetrics => ({
  temperature: readFour(current?.TireTemp),
  slipRatio: readFour(current?.TireSlipRatio),
  slipAngle: readFour(current?.TireSlipAngle),
  combinedSlip: readFour(current?.TireCombinedSlip),
  surfaceRumble: readFour(current?.SurfaceRumble),
});

export const getTireTrendValues = (sample: TelemetryHistorySample) => ({
  temperature: {
    FL: sample.tireTemp?.[0] ?? null,
    FR: sample.tireTemp?.[1] ?? null,
    RL: sample.tireTemp?.[2] ?? null,
    RR: sample.tireTemp?.[3] ?? null,
  },
  slipRatio: {
    FL: sample.slipRatio[0], FR: sample.slipRatio[1], RL: sample.slipRatio[2], RR: sample.slipRatio[3],
  },
  slipAngle: {
    FL: radiansToDegrees(sample.slipAngle[0]),
    FR: radiansToDegrees(sample.slipAngle[1]),
    RL: radiansToDegrees(sample.slipAngle[2]),
    RR: radiansToDegrees(sample.slipAngle[3]),
  },
  combinedSlip: {
    FL: sample.combinedSlip?.[0] ?? null,
    FR: sample.combinedSlip?.[1] ?? null,
    RL: sample.combinedSlip?.[2] ?? null,
    RR: sample.combinedSlip?.[3] ?? null,
  },
  surfaceRumble: {
    FL: sample.surfaceRumble?.[0] ?? null,
    FR: sample.surfaceRumble?.[1] ?? null,
    RL: sample.surfaceRumble?.[2] ?? null,
    RR: sample.surfaceRumble?.[3] ?? null,
  },
});

export const toTireTrendChartData = (
  history: readonly TelemetryHistorySample[],
): TireTrendChartData => {
  const first = history[0]?.timeSeconds ?? 0;
  const result: TireTrendChartData = {
    temperature: new Array(history.length),
    slipRatio: new Array(history.length),
    slipAngle: new Array(history.length),
    combinedSlip: new Array(history.length),
    surfaceRumble: new Array(history.length),
  };

  for (let index = 0; index < history.length; index += 1) {
    const sample = history[index];
    const time = Math.round((sample.timeSeconds - first) * 10) / 10;
    result.temperature[index] = {
      time,
      FL: sample.tireTemp?.[0] ?? null,
      FR: sample.tireTemp?.[1] ?? null,
      RL: sample.tireTemp?.[2] ?? null,
      RR: sample.tireTemp?.[3] ?? null,
    };
    result.slipRatio[index] = {
      time,
      FL: sample.slipRatio[0],
      FR: sample.slipRatio[1],
      RL: sample.slipRatio[2],
      RR: sample.slipRatio[3],
    };
    result.slipAngle[index] = {
      time,
      FL: radiansToDegrees(sample.slipAngle[0]),
      FR: radiansToDegrees(sample.slipAngle[1]),
      RL: radiansToDegrees(sample.slipAngle[2]),
      RR: radiansToDegrees(sample.slipAngle[3]),
    };
    result.combinedSlip[index] = {
      time,
      FL: sample.combinedSlip?.[0] ?? null,
      FR: sample.combinedSlip?.[1] ?? null,
      RL: sample.combinedSlip?.[2] ?? null,
      RR: sample.combinedSlip?.[3] ?? null,
    };
    result.surfaceRumble[index] = {
      time,
      FL: sample.surfaceRumble?.[0] ?? null,
      FR: sample.surfaceRumble?.[1] ?? null,
      RL: sample.surfaceRumble?.[2] ?? null,
      RR: sample.surfaceRumble?.[3] ?? null,
    };
  }

  return result;
};

export const getDynamicsTrendValues = (sample: TelemetryHistorySample) => ({
  X: sample.acceleration[0] / 9.81,
  Y: sample.acceleration[1] / 9.81,
  Z: sample.acceleration[2] / 9.81,
});

export const getOrientationTrendValues = (sample: TelemetryHistorySample) => ({
  Pitch: radiansToDegrees(sample.pitch),
  Roll: radiansToDegrees(sample.roll),
  Yaw: radiansToDegrees(sample.yaw),
});

export const radiansToDegrees = (radians: number | null): number | null => (
  radians === null ? null : radians * (180 / Math.PI)
);
