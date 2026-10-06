import { describe, expect, it } from 'vitest';
import {
  addTireTemperature, clearTireTemperatureHistogram, createTireTemperatureHistogram,
  peakTireTemperatureCount, removeTireTemperature, resizeTireTemperatureHistogram,
  tireTemperatureBinCount,
} from './tireTemperatureHistogram';

// Independent reference: the full-rebin loop previously used by TireRadar.
function fullRebin(samples: readonly { temp: number }[], binCount: number): Uint32Array {
  const bins = new Uint32Array(binCount);
  for (const sample of samples) {
    const normalized = Math.max(0, Math.min(1, (sample.temp - 100) / 160));
    const index = Math.min(binCount - 1, Math.floor(normalized * binCount));
    bins[index]++;
  }
  return bins;
}

// Compare every bin on every randomized step without the assertion library's
// recursive typed-array inspection overhead. Build diagnostics only on failure.
function assertMatchingBins(actual: Uint32Array, reference: Uint32Array, step: number): number {
  if (actual.length !== reference.length) {
    throw new Error(`Step ${step}: expected ${reference.length} bins, received ${actual.length}`);
  }
  let peak = 1;
  for (let bin = 0; bin < reference.length; bin++) {
    if (actual[bin] !== reference[bin]) {
      throw new Error(`Step ${step}, bin ${bin}/${reference.length}: expected ${reference[bin]}, received ${actual[bin]}`);
    }
    if (reference[bin] > peak) peak = reference[bin];
  }
  return peak;
}

describe('tire temperature histogram', () => {
  it('keeps the original width-based bin count and empty peak floor', () => {
    expect([0, 24, 25, 35, 90, 180, 1500].map(tireTemperatureBinCount))
      .toEqual([10, 10, 10, 14, 36, 72, 600]);
    const histogram = createTireTemperatureHistogram(14);
    expect(Array.from(histogram.bins)).toEqual(new Array(14).fill(0));
    expect(peakTireTemperatureCount(histogram)).toBe(1);
  });

  it('ignores NaN while clamping infinities and out-of-range temperatures', () => {
    const temperatures = [NaN, -Infinity, -Number.MAX_VALUE, 99.99, 100, 115.999,
      116, 179.99, 180, 259.99, 260, Number.MAX_VALUE, Infinity];
    const histogram = createTireTemperatureHistogram(10);
    for (const temperature of temperatures) addTireTemperature(histogram, temperature);
    expect(Array.from(histogram.bins)).toEqual([5, 1, 0, 0, 1, 1, 0, 0, 0, 4]);
    expect(peakTireTemperatureCount(histogram)).toBe(5);
    for (const temperature of temperatures) removeTireTemperature(histogram, temperature);
    expect(Array.from(histogram.bins)).toEqual(new Array(10).fill(0));
    expect(peakTireTemperatureCount(histogram)).toBe(1);
  });

  it('matches both sides of every bin boundary after narrow and wide resizes', () => {
    const histogram = createTireTemperatureHistogram(10);
    for (const count of [10, 14, 36, 72, 140, 600]) {
      const samples: { temp: number }[] = [{ temp: NaN }, { temp: -Infinity }, { temp: Infinity }];
      for (let boundary = 0; boundary <= count; boundary++) {
        const temperature = 100 + boundary * 160 / count;
        samples.push({ temp: temperature - 1e-10 }, { temp: temperature }, { temp: temperature + 1e-10 });
      }
      clearTireTemperatureHistogram(histogram);
      resizeTireTemperatureHistogram(histogram, count, []);
      for (const sample of samples) addTireTemperature(histogram, sample.temp);
      expect(histogram.bins).toEqual(fullRebin(samples, count));
    }
  });

  it('decreases the peak when the peak sample is overwritten and keeps instances independent', () => {
    const first = createTireTemperatureHistogram(14);
    const second = createTireTemperatureHistogram(14);
    for (let i = 0; i < 5; i++) addTireTemperature(first, 180);
    addTireTemperature(second, 260);
    expect(peakTireTemperatureCount(first)).toBe(5);
    removeTireTemperature(first, 180);
    addTireTemperature(first, 100);
    expect(peakTireTemperatureCount(first)).toBe(4);
    clearTireTemperatureHistogram(first);
    expect(peakTireTemperatureCount(first)).toBe(1);
    expect(second.bins[13]).toBe(1);
  });

  it('preserves counts and storage when the width changes within the same bin count', () => {
    const histogram = createTireTemperatureHistogram(tireTemperatureBinCount(180));
    const samples = [{ temp: 167 }, { temp: 221 }];
    for (const sample of samples) addTireTemperature(histogram, sample.temp);
    const bins = histogram.bins;
    resizeTireTemperatureHistogram(histogram, tireTemperatureBinCount(181), samples);
    expect(histogram.bins).toBe(bins);
    expect(histogram.bins).toEqual(fullRebin(samples, 72));
    clearTireTemperatureHistogram(histogram);
    expect(histogram.bins).toBe(bins);
  });

  it('matches a full rebin through randomized wraparounds, resizes and resets', () => {
    const capacity = 900;
    const samples: { temp: number }[] = [];
    const histogram = createTireTemperatureHistogram(14);
    let offset = 0;
    let seed = 0x489;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const binCounts = [14, 72, 140, 36, 600, 10];
    for (let step = 0; step < 12_000; step++) {
      if (step > 0 && step % 2711 === 0) {
        // The car/race/chart-disable lifecycle clears the ring and bins together.
        samples.length = 0;
        offset = 0;
        clearTireTemperatureHistogram(histogram);
        expect(peakTireTemperatureCount(histogram)).toBe(1);
      }
      if (step % 197 === 0) {
        resizeTireTemperatureHistogram(histogram,
          binCounts[Math.floor(random() * binCounts.length)], samples);
        assertMatchingBins(histogram.bins, fullRebin(samples, histogram.bins.length), step);
      }
      const temperature = step % 97 === 0 ? NaN
        : step % 101 === 0 ? Infinity
          : step % 103 === 0 ? -Infinity
            : random() * 600 - 100;
      if (samples.length < capacity) samples.push({ temp: temperature });
      else {
        removeTireTemperature(histogram, samples[offset].temp);
        samples[offset].temp = temperature;
        offset = (offset + 1) % capacity;
      }
      addTireTemperature(histogram, temperature);
      const reference = fullRebin(samples, histogram.bins.length);
      const expectedPeak = assertMatchingBins(histogram.bins, reference, step);
      const actualPeak = peakTireTemperatureCount(histogram);
      if (actualPeak !== expectedPeak) {
        throw new Error(`Step ${step}: expected peak ${expectedPeak}, received ${actualPeak}`);
      }
    }
  });
});
