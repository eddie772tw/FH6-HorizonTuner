export const TIRE_TEMPERATURE_MIN = 100;
export const TIRE_TEMPERATURE_MAX = 260;

export interface TireTemperatureHistogram {
  bins: Uint32Array;
}

export function tireTemperatureBinCount(width: number): number {
  return Math.max(10, Math.floor(width / 2.5));
}

export function createTireTemperatureHistogram(binCount: number): TireTemperatureHistogram {
  return { bins: new Uint32Array(binCount) };
}

function temperatureBinIndex(temperature: number, binCount: number): number {
  // Keep the original clamp and arithmetic order, including infinite values at
  // the end bins. NaN produces no valid typed-array index and is ignored.
  const normalized = Math.max(0, Math.min(1,
    (temperature - TIRE_TEMPERATURE_MIN) / (TIRE_TEMPERATURE_MAX - TIRE_TEMPERATURE_MIN)));
  return Math.min(binCount - 1, Math.floor(normalized * binCount));
}

export function addTireTemperature(histogram: TireTemperatureHistogram, temperature: number): void {
  const index = temperatureBinIndex(temperature, histogram.bins.length);
  if (index >= 0) histogram.bins[index]++;
}

// Remove the evicted sample before its ring slot is overwritten. Both update
// operations use constant space and allocate nothing, including for NaN.
export function removeTireTemperature(histogram: TireTemperatureHistogram, temperature: number): void {
  const index = temperatureBinIndex(temperature, histogram.bins.length);
  if (index >= 0) histogram.bins[index]--;
}

export function clearTireTemperatureHistogram(histogram: TireTemperatureHistogram): void {
  histogram.bins.fill(0);
}

export function resizeTireTemperatureHistogram(
  histogram: TireTemperatureHistogram,
  binCount: number,
  samples: readonly { temp: number }[],
): void {
  if (histogram.bins.length === binCount) return;
  histogram.bins = new Uint32Array(binCount);
  // Histogram membership is independent of chronological ring order.
  for (let i = 0; i < samples.length; i++) addTireTemperature(histogram, samples[i].temp);
}

export function peakTireTemperatureCount(histogram: TireTemperatureHistogram): number {
  let peak = 1;
  for (let i = 0; i < histogram.bins.length; i++) {
    if (histogram.bins[i] > peak) peak = histogram.bins[i];
  }
  return peak;
}
