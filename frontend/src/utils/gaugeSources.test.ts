import { describe, expect, it } from 'vitest';
import { normalizeGaugeValueSources, readGaugeValues, type GaugeValueKey } from '../../../hud_overlay/shared/gauge-sources.js';

describe('shared semantic telemetry sources', () => {
  it('converts low Fahrenheit temperatures by declared units and leaves absent sensors empty', () => {
    const result = {} as Record<GaugeValueKey, number | null>;
    expect(readGaugeValues({ TireTemp: [32, 50, 68, 86], boost_psi: 0 }, normalizeGaugeValueSources(null), result)).toBe(result);
    expect(result).toEqual({ boost: 0, oilPressure: null, oilTemperature: null, waterTemperature: 15 });
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
});
