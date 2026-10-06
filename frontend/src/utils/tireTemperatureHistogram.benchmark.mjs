// Node >= 22.18: node frontend/src/utils/tireTemperatureHistogram.benchmark.mjs
// Algorithm microbenchmark only: no Canvas, browser, React, application FPS or
// native frame-time measurements. Imports the actual production accumulator.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  addTireTemperature, createTireTemperatureHistogram,
  peakTireTemperatureCount, removeTireTemperature,
} from './tireTemperatureHistogram.ts';

const capacity = 900;
const binCount = 72;
const tireCount = 4;
const repetitions = 7;
// Same deterministic 10,000-frame fixture as the pre-implementation probe.
const temperatures = Array.from({ length: 10_000 }, (_, i) => i % 97 === 0 ? -50
  : i % 101 === 0 ? 400 : 180 + 100 * Math.sin(i * 0.037));

function run(mode) {
  const tires = Array.from({ length: tireCount }, () => ({
    samples: [], offset: 0, histogram: createTireTemperatureHistogram(binCount),
  }));
  // The old implementation reused a shared scratch buffer, with no allocation
  // per rebin. Keep that baseline rather than comparing against allocating bins.
  const scratch = new Uint32Array(binCount);
  let checksum = 0;
  const start = performance.now();
  for (const temperature of temperatures) {
    for (const tire of tires) {
      const samples = tire.samples;
      if (samples.length < capacity) samples.push({ temp: temperature });
      else {
        if (mode === 'incremental') removeTireTemperature(tire.histogram, samples[tire.offset].temp);
        samples[tire.offset].temp = temperature;
        tire.offset = (tire.offset + 1) % capacity;
      }
      let peak = 1;
      if (mode === 'incremental') {
        addTireTemperature(tire.histogram, temperature);
        peak = peakTireTemperatureCount(tire.histogram);
      } else {
        scratch.fill(0);
        // Original chronological scan and inline maximum from TireRadar.
        for (let i = 0; i < samples.length; i++) {
          const index = samples.length < capacity ? i : (tire.offset + i) % samples.length;
          const normalized = Math.max(0, Math.min(1, (samples[index].temp - 100) / 160));
          const bin = Math.min(binCount - 1, Math.floor(normalized * binCount));
          scratch[bin]++;
          if (scratch[bin] > peak) peak = scratch[bin];
        }
      }
      checksum += peak;
    }
  }
  return { milliseconds: performance.now() - start, checksum };
}

// Warm up both paths before timing and alternate their order each round.
for (let i = 0; i < 2; i++) assert.equal(run('full-rebin').checksum, run('incremental').checksum);
const results = { 'full-rebin': [], incremental: [] };
let expectedChecksum;
for (let round = 0; round < repetitions; round++) {
  for (const mode of round % 2 ? ['incremental', 'full-rebin'] : ['full-rebin', 'incremental']) {
    const result = run(mode);
    expectedChecksum ??= result.checksum;
    assert.equal(result.checksum, expectedChecksum);
    results[mode].push(result.milliseconds);
  }
}
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0],
    maxMs: sorted.at(-1), roundsMs: values };
};
console.log(JSON.stringify({
  scope: 'Binning microbenchmark: existing ring ingestion + full rebin versus existing ring ingestion + incremental bins + paint-time peak scan. No Canvas/React/FPS/native p95 claims.',
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  fixture: { frames: temperatures.length, tires: tireCount, capacity, bins: binCount, repetitions },
  checksum: expectedChecksum,
  fullRebin: summarize(results['full-rebin']),
  incremental: summarize(results.incremental),
}, null, 2));
