import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DriftDisplayMath = {
  normalizeSteerPercent: (rawSteer: number) => number;
  getCounterState: (driftAngle: number, steerPercent: number) => { isCountering: boolean; percent: number; arcAngle: number };
  resolveTorque: (data: Record<string, number>, isMetric: boolean) => { value: number; unit: string };
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

  it('preserves the normalized torque unit selected by the telemetry payload', () => {
    const math = loadMath();
    expect(math.resolveTorque({ torque: 612.4 }, true)).toEqual({ value: 612, unit: 'N·M' });
    expect(math.resolveTorque({ torque: 451.6 }, false)).toEqual({ value: 452, unit: 'LB·FT' });
  });
});
