import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DriftDisplayMath = {
  normalizeSteerPercent: (rawSteer: number) => number;
  getCounterState: (driftAngle: number, steerPercent: number) => { isCountering: boolean; percent: number; arcAngle: number };
  resolveTorque: (data: Record<string, unknown>, isMetric: boolean) => { value: number; unit: string };
};

function loadMath(): DriftDisplayMath {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/drift/assets/drift_display_math.js'),
    'utf8',
  );
  const window = {} as { DriftDisplayMath?: DriftDisplayMath };
  new Function('window', source)(window);
  if (!window.DriftDisplayMath) throw new Error('Drift display math did not register itself');
  return window.DriftDisplayMath;
}

describe('Drift display math', () => {
  it('normalizes Forza steering input into a clamped percentage', () => {
    const math = loadMath();
    expect(math.normalizeSteerPercent(127)).toBe(100);
    expect(math.normalizeSteerPercent(-63.5)).toBe(-50);
    expect(math.normalizeSteerPercent(0.5)).toBe(50);
    expect(math.normalizeSteerPercent(999)).toBe(100);
    expect(math.normalizeSteerPercent(-999)).toBe(-100);
    expect(math.normalizeSteerPercent(Number.NaN)).toBe(0);
  });

  it('maps counter-steer to the shared ±60 degree visual arc', () => {
    const math = loadMath();
    const counter = math.getCounterState(36, 50);
    expect(counter.isCountering).toBe(true);
    expect(counter.arcAngle).toBe(30);
    expect(counter.percent).toBeGreaterThan(35);
  });

  it('does not present non-counter steering as counter-steer', () => {
    const math = loadMath();
    expect(math.getCounterState(24, -40)).toMatchObject({ isCountering: false, percent: 0, arcAngle: -24 });
  });

  it('uses the threshold boundary and clamps the visual pointer arc', () => {
    const math = loadMath();
    expect(math.getCounterState(7.99, 50)).toMatchObject({ isCountering: false, percent: 0 });
    expect(math.getCounterState(8, 50)).toMatchObject({ isCountering: true, percent: 22.5, arcAngle: 30 });
    expect(math.getCounterState(45, 200).arcAngle).toBe(60);
  });

  it('preserves the normalized torque unit selected by the telemetry payload', () => {
    const math = loadMath();
    expect(math.resolveTorque({ torque: 612.4 }, true)).toEqual({ value: 612, unit: 'N·M' });
    expect(math.resolveTorque({ torque: 451.6 }, false)).toEqual({ value: 452, unit: 'LB·FT' });
  });

  it('falls back from missing normalized torque to the selected unit field', () => {
    const math = loadMath();
    expect(math.resolveTorque({ torque: null, torque_nm: 703.8, torque_ftlbs: 518.9 }, true)).toEqual({ value: 704, unit: 'N·M' });
    expect(math.resolveTorque({ torque: '', torque_nm: 703.8, torque_ftlbs: 518.9 }, false)).toEqual({ value: 519, unit: 'LB·FT' });
    expect(math.resolveTorque({ torque: Number.NaN, torque_nm: Number.POSITIVE_INFINITY }, true)).toEqual({ value: 0, unit: 'N·M' });
  });
});
