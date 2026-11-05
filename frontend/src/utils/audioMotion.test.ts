import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const scope: Record<string, any> = {};
vm.runInNewContext(readFileSync(new URL('../../../hud_overlay/shared/audio-motion.js', import.meta.url), 'utf8'), scope);
const motion = scope.HUDAudioMotion;

describe('shared audio animation time domain', () => {
  it.each([30, 60, 120, 144, 240])('keeps phase, peak decay and VU response consistent at %i Hz', hz => {
    let value = 0;
    let peak = 1;
    for (let i = 0; i < hz; i++) {
      value = motion.follow(value, 1, 1 / hz, 0.025);
      peak = motion.peak(peak, 0, 1 / hz, 0.9);
    }
    expect(value).toBeCloseTo(motion.follow(0, 1, 1, 0.025), 12);
    expect(peak).toBeCloseTo(0.1, 12);
    expect(motion.phase(hz * (1 / hz), 2.1)).toBeCloseTo(2.1, 12);
    for (let i = 0; i < hz; i++) value = motion.follow(value, 0, 1 / hz, 0.28);
    expect(value).toBeCloseTo(motion.follow(1, 0, 1, 0.28), 12);
  });

  it('handles irregular cadence, duplicate timestamps and a background pause without accumulated drift', () => {
    const intervals = [0, 0.003, 0.021, 0.008, 0.11, 0.007, 0.851];
    let value = 1;
    for (const dt of intervals) value = motion.follow(value, 0, dt, 0.28);
    expect(value).toBeCloseTo(motion.follow(1, 0, 1, 0.28), 12);
    expect(motion.peak(0.8, 0.1, 5, 0.9)).toBe(0.1);
    expect(motion.phase(5, 2.1)).toBe(10.5);
    expect(motion.follow(0.2, 1, 0, 0.025)).toBeCloseTo(0.2, 12);
  });
});
