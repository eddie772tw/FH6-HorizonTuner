import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function setup() {
  const scope: any = {};
  const element = { style: { transform: 'none', filter: 'none' } };
  runInNewContext(readFileSync(resolve(import.meta.dirname, '../../artwork-effects.js'), 'utf8'), scope);
  return { scope, element, effects: scope.HUDArtworkEffects.create(element) };
}

describe('opt-in artwork effects', () => {
  it('only accepts the existing explicit custom #RRGGBB setting', () => {
    const { scope, effects } = setup();
    scope._currentCustomColor = '#12AbEF';
    effects.sync(); expect(effects.accent('white')).toBe('white');
    scope._currentUseDefaultColors = false;
    effects.sync(); expect(effects.accent('white')).toBe('#12AbEF');
    scope._currentCustomColor = 'url(example)';
    effects.sync(); expect(effects.accent('white')).toBe('white');
    scope._currentGlowIntensity = 8;
    effects.sync(); expect(effects.glow(10)).toBe(20);
    scope._currentGlowIntensity = 0;
    effects.sync(); expect(effects.glow(10)).toBe(0);
  });

  it('filters invalid/sub-deadzone input and bounds VFD motion without an RAF loop', () => {
    const { effects, element } = setup();
    effects.update({ accel_x: NaN, accel_y: Infinity });
    effects.update({ accel_x: .2, accel_y: -.2 });
    expect(element.style).toEqual({ transform: 'none', filter: 'none' });
    for (let i = 0; i < 100; i++) effects.update({ accel_x: 1000, accel_y: 1000 });
    expect(element.style.transform).toMatch(/^translate3d\(-[\d.]+px, [\d.]+px, 0px\)$/);
    const values = element.style.transform.match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.abs(values[0])).toBeLessThanOrEqual(30);
    expect(values[1]).toBeLessThanOrEqual(30);
    expect(Number(element.style.filter.match(/[\d.]+/)![0])).toBeLessThanOrEqual(.75);
  });

  it('immediately resets on off/hide and cannot revive after disposal', () => {
    const { effects, element } = setup();
    for (let cycle = 0; cycle < 3; cycle++) {
      effects.sync({ showMotionEffect: true, showGauge: true });
      effects.update({ accel_x: 19.62, accel_y: 0 });
      expect(element.style.filter).not.toBe('none');
      effects.sync(cycle % 2 ? { showGauge: false } : { showMotionEffect: false });
      expect(element.style).toEqual({ transform: 'none', filter: 'none' });
    }
    effects.destroy(); effects.sync({ showMotionEffect: true });
    effects.update({ accel_x: 19.62, accel_y: 0 });
    expect(element.style).toEqual({ transform: 'none', filter: 'none' });
  });
});
