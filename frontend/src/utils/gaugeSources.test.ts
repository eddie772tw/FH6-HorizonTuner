import { describe, expect, it } from 'vitest';
import { createGaugeValueReader, normalizeGaugeValueSources, readGaugeValues, type GaugeValueKey } from '../../../hud_overlay/shared/gauge-sources.js';

describe('shared semantic telemetry sources', () => {
  it('converts low Fahrenheit temperatures by declared units and leaves absent sensors empty', () => {
    const result = {} as Record<GaugeValueKey, number | null>;
    expect(readGaugeValues({ TireTemp: [32, 50, 68, 86], boost_psi: 0 }, normalizeGaugeValueSources(null), result)).toBe(result);
    expect(result).toEqual({ boost: 0, oilPressure: null, oilTemperature: 15, waterTemperature: 15 });
    readGaugeValues({ TireTemp: [0, 0, 0, 0], tire_temp_f: [null, null, null, null] }, normalizeGaugeValueSources(null), result);
    expect(result.waterTemperature).toBeNull();
    readGaugeValues({}, normalizeGaugeValueSources(null), result);
    expect(Object.values(result)).toEqual([null, null, null, null]);
  });
  it('redefines shared readings, converts pressure and never infers engine sensor values from rpm', () => {
    const sources = normalizeGaugeValueSources({
      boost: { field: 'boost_bar', unit: 'bar', label: 'Manifold pressure' },
      oilPressure: { field: 'torque_nm', unit: 'native', label: 'Torque proxy' },
      oilTemperature: { field: 'temp_fr', unit: 'F', label: 'Front right tire' },
      waterTemperature: { field: 'temp_rl', unit: 'C', label: 'Rear left readout' },
    });
    const values = readGaugeValues({ boost_bar: 1, torque_nm: 42, temp_fr: 212, temp_rl: 65, rpm: 7000 }, sources, {} as Record<GaugeValueKey, number | null>);
    expect(values).toEqual({ boost: 14.5038, oilPressure: 42, oilTemperature: 100, waterTemperature: 65 });
    const changed = normalizeGaugeValueSources({ ...sources, boost: { field: 'boost_kpa', unit: 'kpa', label: 'Pressure' } });
    readGaugeValues({ boost_kpa: 6.89476, temp_fr: null, temp_rl: NaN, torque_nm: '42' }, changed, values);
    expect(values).toEqual({ boost: 1, oilPressure: null, oilTemperature: null, waterTemperature: null });
  });
  it('bounds metadata, rejects paths and mismatched units, and skips inherited properties', () => {
    const sources = normalizeGaugeValueSources({
      boost: { field: '../bad', unit: 'C', label: '  ' },
      oilPressure: { field: 'constructor', unit: 'psi', label: 'x'.repeat(80) },
    });
    expect(sources.boost).toEqual({ field: 'boost_psi', unit: 'psi', label: 'Boost' });
    expect(sources.oilPressure.label).toHaveLength(64);
    const result = readGaugeValues(Object.create({ constructor: 123, boost_psi: 45 }), sources, {} as Record<GaugeValueKey, number | null>);
    expect(result.boost).toBeNull();
    expect(result.oilPressure).toBeNull();
  });

  it('upgrades exact legacy defaults while preserving explicit custom or unassigned sources', () => {
    const migrated = normalizeGaugeValueSources({
      oilPressure: { field: '', unit: 'psi', label: 'Oil pressure (unassigned)' },
      oilTemperature: { field: '', unit: 'C', label: 'Oil temperature (unassigned)' },
    });
    expect(migrated.oilPressure.field).toBe('estimated_oil_pressure_psi');
    expect(migrated.oilTemperature).toEqual(migrated.waterTemperature);
    const custom = normalizeGaugeValueSources({
      oilPressure: { field: '', unit: 'psi', label: 'Disabled intentionally' },
      oilTemperature: { field: 'power_kw', unit: 'native', label: 'Power' },
    });
    expect(custom.oilPressure.field).toBe('');
    expect(custom.oilTemperature.field).toBe('power_kw');
  });

  it('damps a load estimate by elapsed time at 30 through 240Hz', () => {
    const sources = normalizeGaugeValueSources(null);
    const data = { rpm: 5000, maxRpm: 10000, throttle: 1, TireTemp: [176, 194, 212, 230] };
    for (const hz of [30, 60, 120, 144, 240]) {
      const read = createGaugeValueReader();
      const output = {} as Record<GaugeValueKey, number | null>;
      expect(read(data, sources, output, 0)).toBe(output);
      expect(output.oilPressure).toBe(0);
      for (let frame = 1; frame <= hz * 3; frame++) read(data, sources, output, frame * 1000 / hz);
      expect(output.oilPressure).toBeCloseTo(50 * (1 - Math.exp(-2)), 10);
      expect(output.oilTemperature).toBe(95);
      expect(output.waterTemperature).toBe(95);
    }
  });

  it('follows increasing and decreasing load without step jumps or overshoot', () => {
    const read = createGaugeValueReader();
    const sources = normalizeGaugeValueSources(null);
    const output = {} as Record<GaugeValueKey, number | null>;
    read({ rpm: 10000, maxRpm: 10000, throttle: 1 }, sources, output, 0);
    read({ rpm: 10000, maxRpm: 10000, throttle: 1 }, sources, output, 1500);
    const loaded = output.oilPressure!;
    expect(loaded).toBeCloseTo(80 * (1 - Math.exp(-1)), 10);
    read({ rpm: 1000, maxRpm: 10000, throttle: 0 }, sources, output, 3000);
    expect(output.oilPressure).toBeCloseTo(20 + (loaded - 20) * Math.exp(-1), 10);
    const unloaded = output.oilPressure!;
    read({ rpm: 0 }, sources, output, 4500);
    expect(output.oilPressure).toBeCloseTo(unloaded * Math.exp(-1), 10);
  });

  it('bypasses pressure damping for custom sources and leaves input telemetry untouched', () => {
    const read = createGaugeValueReader();
    const sources = normalizeGaugeValueSources({ oilPressure: { field: 'torque_nm', unit: 'native', label: 'Torque' } });
    const output = {} as Record<GaugeValueKey, number | null>;
    const data = Object.freeze({ rpm: 6000, maxRpm: 8000, throttle: .8, torque_nm: 300 });
    read(data, sources, output, 0);
    expect(output.oilPressure).toBe(300);
    read({ ...data, torque_nm: 27 }, sources, output, 1);
    expect(output.oilPressure).toBe(27);
    expect(data).not.toHaveProperty('estimated_oil_pressure_psi');
  });

  it('resets simulation on car changes, missing telemetry, race exit and clock restart', () => {
    const read = createGaugeValueReader();
    const sources = normalizeGaugeValueSources(null);
    const output = {} as Record<GaugeValueKey, number | null>;
    const data = { CurrentEngineRpm: 6000, EngineMaxRpm: 8000, AccelInput: 255, CarOrdinal: 1 };
    read(data, sources, output, 0);
    read(data, sources, output, 1500);
    expect(output.oilPressure).toBeGreaterThan(0);
    read({ ...data, CarOrdinal: 2 }, sources, output, 1600);
    expect(output.oilPressure).toBe(0);
    read({ ...data, EngineMaxRpm: 0 }, sources, output, 1700);
    expect(output.oilPressure).toBeNull();
    read({ ...data, IsRaceOn: 0 }, sources, output, 1800);
    expect(output.oilPressure).toBeNull();
    read(data, sources, output, 2000);
    read(data, sources, output, 3000);
    read(data, sources, output, 100);
    expect(output.oilPressure).toBe(0);
    read({ ...data, AccelInput: NaN }, sources, output, 200);
    expect(output.oilPressure).toBeNull();
  });
});
