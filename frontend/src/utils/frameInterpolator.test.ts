import { describe, it, expect } from 'vitest';
import { FrameInterpolator, lerp, lerpAngleDeg } from './frameInterpolator';

describe('frameInterpolator unit tests', () => {
  it('lerp calculates linear interpolation correctly', () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('lerpAngleDeg wraps shortest angular path correctly', () => {
    expect(lerpAngleDeg(10, 30, 0.5)).toBe(20);
    // 350 deg to 10 deg: delta is +20 deg, midpoint is 0 deg
    expect(lerpAngleDeg(350, 10, 0.5)).toBe(0);
    // 10 deg to 350 deg: delta is -20 deg, midpoint is 0 deg
    expect(lerpAngleDeg(10, 350, 0.5)).toBe(0);
  });

  it('interpolates continuous numeric properties and preserves discrete properties', () => {
    const interpolator = new FrameInterpolator({ staleTimeoutMs: 200 });

    const t0 = 1000;
    const sample0 = {
      rpm: 3000,
      speed_kmh: 100,
      gear: 3,
      isRaceOn: 1,
      lockup: { fl: false, fr: false, rl: false, rr: false },
      TireTemp: [150, 150, 160, 160],
      heading_deg: 90,
    };

    const t1 = 1016.667;
    const sample1 = {
      rpm: 4000,
      speed_kmh: 120,
      gear: 4, // Shifted to 4th gear
      isRaceOn: 1,
      lockup: { fl: true, fr: false, rl: false, rr: false },
      TireTemp: [160, 160, 170, 170],
      heading_deg: 100,
    };

    interpolator.pushSample(sample0, t0);
    interpolator.pushSample(sample1, t1);

    // Exact midpoint (alpha = 0.5)
    const midTime = t0 + (t1 - t0) * 0.5;
    const midFrame = interpolator.interpolate(midTime);

    expect(midFrame.rpm).toBeCloseTo(3500, 1);
    expect(midFrame.speed_kmh).toBeCloseTo(110, 1);
    expect(midFrame.heading_deg).toBeCloseTo(95, 1);
    expect(midFrame.TireTemp[0]).toBeCloseTo(155, 1);
    expect(midFrame.TireTemp[1]).toBeCloseTo(155, 1);
    expect(midFrame.TireTemp[2]).toBeCloseTo(165, 1);
    expect(midFrame.TireTemp[3]).toBeCloseTo(165, 1);

    // Discrete fields must immediately reflect the latest sample (no floating point gears)
    expect(midFrame.gear).toBe(4);
    expect(midFrame.lockup.fl).toBe(true);
  });

  it('clamps extrapolation beyond latest sample to maxExtrapolationAlpha', () => {
    const interpolator = new FrameInterpolator({ maxExtrapolationAlpha: 1.25 });

    const t0 = 1000;
    const sample0 = { rpm: 2000 };
    const t1 = 1020;
    const sample1 = { rpm: 3000 };

    interpolator.pushSample(sample0, t0);
    interpolator.pushSample(sample1, t1);

    // Target is way in the future (alpha would be 2.0 without clamp)
    const futureTime = t0 + 40; // 2.0 * dt
    const futureFrame = interpolator.interpolate(futureTime);

    // Extrapolated at alpha = 1.25 -> 2000 + 1000 * 1.25 = 3250
    expect(futureFrame.rpm).toBeCloseTo(3250, 1);
  });

  it('falls back to latest frame on stale timeout without drift', () => {
    const interpolator = new FrameInterpolator({ staleTimeoutMs: 100 });

    const t0 = 1000;
    const sample0 = { rpm: 2000 };
    const t1 = 1020;
    const sample1 = { rpm: 3000 };

    interpolator.pushSample(sample0, t0);
    interpolator.pushSample(sample1, t1);

    // Render time 200ms after t1 (exceeds staleTimeoutMs = 100ms)
    const staleTime = t1 + 200;
    const staleFrame = interpolator.interpolate(staleTime);

    // Directly returns sample1 without extrapolation
    expect(staleFrame.rpm).toBe(3000);
  });

  it('resets buffer and avoids blending when car ordinal changes', () => {
    const interpolator = new FrameInterpolator();

    const sampleCarA = { carOrdinal: 1, rpm: 8000, speed_kmh: 250 };
    const sampleCarB = { carOrdinal: 2, rpm: 1000, speed_kmh: 0 };

    interpolator.pushSample(sampleCarA, 1000);
    interpolator.pushSample(sampleCarB, 1020);

    const frame = interpolator.interpolate(1020);
    expect(frame.carOrdinal).toBe(2);
    expect(frame.rpm).toBe(1000);
    expect(frame.speed_kmh).toBe(0);
  });
});
