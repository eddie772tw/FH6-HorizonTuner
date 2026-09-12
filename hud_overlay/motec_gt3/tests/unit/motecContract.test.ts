import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), '../hud_overlay/motec_gt3/index.html'), 'utf8');

function harness() {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)][0][1];
  const output: string[] = [];
  let definition: any;
  const ctx = new Proxy({ fillText: (text: string) => output.push(text) }, {
    get: (target, key) => key in target ? target[key as keyof typeof target] : () => {},
    set: (target, key, value) => { (target as any)[key] = value; return true; },
  });
  const canvas = { getContext: () => ctx };
  const container = { style: {} };
  const doc = { getElementById: (id: string) => id === 'motecCanvas' ? canvas : container };
  new Function('window', 'document', 'HUDCore', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', script)(
    { devicePixelRatio: 2, addEventListener: () => {} }, doc,
    { registerStyle: (_id: string, value: any) => { definition = value; }, init: () => {} },
    { now: () => 1000 }, () => 1, () => {},
  );
  return {
    definition,
    frame: (data: object, payload = {}) => {
      output.length = 0;
      definition.onFrame(data, payload);
      return [...output];
    },
  };
}

describe('MoTeC FH adapted display contract', () => {
  it('renders real canonical lap seconds, speed and reverse/neutral gear', () => {
    const hud = harness();
    let output = hud.frame({ rpm: 7500, max_rpm: 8500, gear: 0, speed_kmh: -15,
      BestLap: 83.245, CurrentLap: 31.007 });
    expect(output).toEqual(expect.arrayContaining(['R', '15', '7500 RPM', 'KM/H', '1:23.245', '0:31.007']));
    output = hud.frame({ gear: 11, speed_kmh: 160, speed_mph: 99, displayUnits: { speed: 'mph' } });
    expect(output).toEqual(expect.arrayContaining(['N', '99', 'MPH']));
  });

  it('does not invent unavailable channels from legacy values, tires, media, or lap subtraction', () => {
    const output = harness().frame({ rpm: 4000, max_rpm: 8500, gear: 4, speed_kmh: 123,
      EngineTemp: 98, OilTemp: 105, OilPressure: 4.5, TireTemp: [190, 190, 190, 190],
      BestLap: 90, CurrentLap: 45 });
    expect(output).toEqual(expect.arrayContaining([
      'ENGINE OIL TMP', 'GBOX OIL TMP', 'DIFF OIL TMP', 'WATER TMP', 'OIL PRESS', 'FUEL PRESS', '—',
    ]));
    for (const fabricated of ['98', '105', '4.5', '190', '-45.000', '+45.000']) {
      expect(output).not.toContain(fabricated);
    }
    expect(output[output.indexOf('1:30.000') + 1]).toBe('—');
    expect(output.join(' ')).not.toMatch(/BRAKE BIAS|ENG OK|DIFF 50%|RADIO/);
  });

  it('clears stale values on missing or invalid frames and keeps a genuine zero running lap', () => {
    const hud = harness();
    hud.frame({ gear: 4, speed_kmh: 177, BestLap: 91.5, CurrentLap: 8 });
    const missing = hud.frame({ gear: 255, speed_kmh: NaN, BestLap: Infinity, CurrentLap: -1 });
    for (const stale of ['4', '177', '1:31.500', '0:08.000', 'NaN', 'Infinity']) {
      expect(missing).not.toContain(stale);
    }
    expect(missing).toContain('—');
    const zero = hud.frame({ gear: 0, speed_kmh: 0, BestLap: 0, CurrentLap: 0 });
    expect(zero).toEqual(expect.arrayContaining(['R', '0', '0:00.000', '—']));
  });

  it('handles absent frames and shift-light animation without fabricated driving values', () => {
    const hud = harness();
    expect(() => hud.definition.onFrame(null, null)).not.toThrow();
    expect(() => hud.definition.onAnimate()).not.toThrow();
  });

  it('distinguishes a stopped engine from missing or invalid RPM', () => {
    const hud = harness();
    expect(hud.frame({ rpm: 0 })).toContain('0 RPM');
    for (const rpm of [undefined, null, NaN, Infinity, -1]) {
      const output = hud.frame({ rpm });
      expect(output).toContain('— RPM');
      expect(output).not.toContain('0 RPM');
    }
  });
});
