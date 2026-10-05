import { describe, expect, it } from 'vitest';
// Style-owned plain JavaScript is also loaded directly by the HUD iframe.
// @ts-expect-error Standalone HUD modules intentionally have no TypeScript build dependency.
import { createState, emptyFrame, gearLabel, normalizeFrame, segmentState, STALE_AFTER_MS, tachometerTicks, tachometerGraduations, tachometerScale } from '../../model.js';

const sample = { timestamp_ms: 100, rpm: 7200, maxRpm: 9000, speed_kmh: 180, speed_mph: 112, gear: 4, boost_bar: 1.3 };

describe('AP1 canonical display boundary', () => {
  it.each([[0, 'R'], [11, 'N'], [1, '1'], [6, '6'], [10, '10'], [-1, '—'], [12, '—'], [1.5, '—'], [null, '—'], [undefined, '—'], ['4', '—']])('maps gear %s to %s', (input, output) => {
    expect(gearLabel(input)).toBe(output);
  });
  it('uses canonical speed values without multiplying a second time', () => {
    expect(normalizeFrame(sample).speedText).toBe('180');
    expect(normalizeFrame(sample, { isMetric: false }).speedText).toBe('112');
    expect(normalizeFrame({ ...sample, displayUnits: { speed: 'mph' } }).unit).toBe('mph');
  });
  it('applies effective units and never relabels a mismatched generic speed', () => {
    const frame = normalizeFrame({ speed: 100, displayUnits: { speed: 'kmh' } }, {}, { effectiveUnits: { speed: 'mph' } });
    expect(frame.speedText).toBe('---');
    expect(frame.unit).toBe('mph');
    expect(normalizeFrame({ speed: 100, displayUnits: { speed: 'kmh' } }).speedText).toBe('100');
  });
  it.each([null, undefined, NaN, Infinity, '', false])('keeps invalid measurements unavailable: %s', value => {
    const frame = normalizeFrame({ speed_kmh: value, rpm: value, boost_bar: value, maxRpm: value });
    expect(frame.speedText).toBe('---');
    expect(frame.rpmRatio).toBeNull();
    expect(frame.boost.value).toBeNull();
  });
  it('uses signed reverse speed magnitude in both units and honors max_rpm', () => {
    const reverse = { ...sample, gear: 0, speed_kmh: -16.2, speed_mph: -10.06, maxRpm: undefined, max_rpm: 8000 };
    expect(normalizeFrame(reverse).speedText).toBe('16');
    expect(normalizeFrame(reverse, { isMetric: false }).speedText).toBe('10');
    expect(normalizeFrame(reverse).maxRpm).toBe(8000);
  });
  it('accepts legacy unit configuration and null message fields safely', () => {
    expect(normalizeFrame(sample, {}, { unit: 'mph' }).speedText).toBe('112');
    expect(normalizeFrame(sample, {}, { effectiveUnit: 'mph' }).speedText).toBe('112');
    expect(normalizeFrame(null, null, null).speedText).toBe('---');
    expect(normalizeFrame({ ...sample, rpm: -1, maxRpm: -1, boost_bar: -1 }).rpmRatio).toBeNull();
  });
  it('distinguishes zero from missing and rejects overflowing speed', () => {
    const zero = normalizeFrame({ ...sample, speed_kmh: 0, rpm: 0, boost_bar: 0 });
    expect(zero.speedText).toBe('0');
    expect(zero.rpmRatio).toBe(0);
    expect(zero.boost.value).toBe(0);
    expect(normalizeFrame({ ...sample, speed_kmh: 1000 }).speedText).toBe('---');
    expect(normalizeFrame({ ...sample, boost_bar: 3 }).boost.value).toBe(3);
  });
  it('does not infer unsupported raw values or invent a redline', () => {
    const frame = normalizeFrame({ SpeedMetersPerSecond: 40, CurrentEngineRpm: 5000, Fuel: 80, EngineMaxRpm: 9000 });
    expect(frame.speedText).toBe('---');
    expect(frame.rpmRatio).toBeNull();
    expect(frame.boost.value).toBeNull();
    expect(frame.shift).toBe(false);
    expect(normalizeFrame(sample).redlineRpm).toBeNull();
  });
  it('scales tachometer and warnings to the current car and Coordinator redline', () => {
    const low = normalizeFrame({ ...sample, rpm: 4500, maxRpm: 6000 }, { redlineRpm: 4000 });
    const high = normalizeFrame({ ...sample, rpm: 9000, maxRpm: 12000 }, { redlineRpm: 11000 });
    expect(low.rpmRatio).toBe(high.rpmRatio);
    expect(low.shift).toBe(true);
    expect(high.shift).toBe(false);
    expect(normalizeFrame({ ...sample, rpm: 10000 }).rpmRatio).toBe(1);
    expect(normalizeFrame(sample, { redlineRpm: 10000 }).redlineRpm).toBeNull();
  });
  it('uses one explicit unnumbered interval of display headroom without inventing redline telemetry', () => {
    for (const maximum of [4500, 6000, 9000, 9500, 12000, 20000]) {
      const scale = tachometerScale(maximum), ticks = tachometerTicks(maximum);
      expect(scale.labelledMaxRpm).toBeGreaterThanOrEqual(maximum);
      expect(scale.labelledMaxRpm - maximum).toBeLessThan(scale.majorStep);
      expect(scale.maxRpm - scale.labelledMaxRpm).toBe(scale.majorStep);
      expect(ticks.at(-1).ratio).toBeLessThan(1);
      const frame = normalizeFrame({ ...sample, maxRpm: maximum, rpm: maximum });
      expect(frame.scaleMaxRpm).toBe(scale.maxRpm);
      expect(frame.rpmRatio).toBeCloseTo(maximum / scale.maxRpm);
      expect(frame.redlineRpm).toBeNull();
    }
  });
  it('aligns major numbers and halfway minor graduations to the same RPM domain', () => {
    for (const maximum of [4500, 9000, 12000, 20000]) {
      const graduations = tachometerGraduations(maximum), ticks = tachometerTicks(maximum);
      expect(graduations[0].ratio).toBe(0);
      expect(graduations.at(-1).ratio).toBe(1);
      for (const tick of ticks) expect(graduations.find((g: any) => g.major && g.rpm === tick.rpm)?.ratio).toBe(tick.ratio);
      for (let i = 1; i < graduations.length - 1; i += 2) {
        expect(graduations[i].major).toBe(false);
        expect(graduations[i].rpm).toBe((graduations[i - 1].rpm + graduations[i + 1].rpm) / 2);
      }
    }
    for (const invalid of [null, 0, -1, NaN, Infinity, Number.MAX_VALUE]) {
      expect(tachometerScale(invalid)).toBeNull();
      expect(tachometerGraduations(invalid)).toEqual([]);
    }
  });
  it('maps zero, engine maximum, redline and displayed overrange monotonically to dense cells', () => {
    const frames = [0, 1000, 4500, 8000, 9000, 10000, 11000].map(rpm => normalizeFrame({ ...sample, rpm }, { redlineRpm: 8000 }));
    const amounts = frames.map(f => segmentState(f.rpmRatio, f.redlineRatio).filter((s: any) => s.lit).length);
    expect(amounts[0]).toBe(0);
    expect(amounts).toEqual([...amounts].sort((a,b) => a-b));
    expect(frames[4].rpmRatio).toBe(.9);
    expect(frames[3].redlineRatio).toBe(.8);
    expect(frames[3].shift).toBe(true);
    expect(frames[5].rpmRatio).toBe(1);
    expect(amounts[5]).toBe(amounts[6]);
    expect(segmentState(frames[3].rpmRatio, frames[3].redlineRatio).some((s: any) => s.hot)).toBe(true);
  });
  it('has bounded, proportional segments and readable dynamic tick intervals', () => {
    expect(segmentState(0, .8).some((s: { lit: boolean }) => s.lit)).toBe(false);
    expect(segmentState(1, .8).every((s: { lit: boolean }) => s.lit)).toBe(true);
    expect(segmentState(null, null).every((s: { lit: boolean; hot: boolean }) => !s.lit && !s.hot)).toBe(true);
    for (const max of [4500, 9000, 12000, 20000]) {
      const ticks = tachometerTicks(max);
      expect(ticks.length).toBeLessThanOrEqual(11);
      expect(ticks.every((t: { ratio: number }) => t.ratio >= 0 && t.ratio <= 1)).toBe(true);
      expect(ticks.at(-1).ratio).toBeGreaterThan(.5);
    }
    expect(tachometerTicks(null)).toEqual([]);
  });
});

describe('AP1 telemetry lifecycle', () => {
  it('keeps launcher synthetic zero standby unavailable', () => {
    const state = createState();
    expect(state.snapshot()).toEqual(emptyFrame());
    state.receive({ ...sample, timestamp_ms: undefined, gear: 0 }, {}, 10);
    expect(state.snapshot(10).gear).toBe('—');
    expect(state.snapshot(10).status).toBe('WAITING FOR DATA');
  });
  it('expires repeated Coordinator frames with a frozen timestamp and recovers on progress', () => {
    const state = createState();
    state.receive(sample, {}, 0);
    expect(state.snapshot(1).live).toBe(true);
    state.receive({ ...sample, rpm: 7201 }, {}, STALE_AFTER_MS - 1);
    expect(state.snapshot(STALE_AFTER_MS).status).toBe('SIGNAL LOST');
    expect(state.snapshot(STALE_AFTER_MS).speedText).toBe('---');
    state.receive({ ...sample, timestamp_ms: 101 }, {}, STALE_AFTER_MS + 1);
    expect(state.snapshot(STALE_AFTER_MS + 2).live).toBe(true);
  });
  it('accepts timestamp zero and clock rollover as new telemetry', () => {
    const state = createState();
    state.receive({ ...sample, timestamp_ms: 0 }, {}, 0);
    expect(state.snapshot(1).live).toBe(true);
    state.receive({ ...sample, timestamp_ms: 2 ** 32 - 1 }, {}, 100);
    state.receive({ ...sample, timestamp_ms: 0 }, {}, 200);
    expect(state.snapshot(201).live).toBe(true);
  });
  it('clears values on partial input, error and pause instead of retaining old values', () => {
    const state = createState();
    state.receive(sample, {}, 0);
    state.receive({ timestamp_ms: 101 }, {}, 1);
    expect(state.snapshot(2).status).toBe('PARTIAL DATA');
    expect(state.snapshot(2).speedText).toBe('---');
    state.receive({ ...sample, timestamp_ms: 102, success: false }, {}, 3);
    expect(state.snapshot(4).status).toBe('DATA ERROR');
    expect(state.snapshot(4).boost.value).toBeNull();
    state.receive({ ...sample, timestamp_ms: 103, isRaceOn: 0 }, {}, 5);
    expect(state.snapshot(6).status).toBe('SESSION PAUSED');
  });
  it('unit/config changes never extend freshness, and destroy cannot be revived', () => {
    const state = createState();
    state.receive({ ...sample, displayUnits: { speed: 'kmh' } }, { isMetric: true }, 0);
    state.configure({ effectiveUnits: { speed: 'mph' } });
    expect(state.snapshot(1).speedText).toBe('112');
    expect(state.snapshot(STALE_AFTER_MS).status).toBe('SIGNAL LOST');
    expect(state.snapshot(STALE_AFTER_MS).unit).toBe('mph');
    expect(state.snapshot(STALE_AFTER_MS).speedText).toBe('---');
    expect(state.snapshot(STALE_AFTER_MS).boost.mode).toBe('unavailable');
    state.destroy();
    state.receive({ ...sample, timestamp_ms: 200 }, {}, STALE_AFTER_MS + 1);
    state.configure({ isMetric: true });
    expect(state.snapshot(STALE_AFTER_MS + 2).status).toBe('OFFLINE');
  });
});
