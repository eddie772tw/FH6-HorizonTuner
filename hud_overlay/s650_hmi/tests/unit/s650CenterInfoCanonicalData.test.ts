import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DisplayValue = { value: number | string; unit: string };

type CenterInfoCommon = {
  displayPower: (view: { isMetric: boolean }, data: unknown) => DisplayValue;
  displayTorque: (view: { isMetric: boolean }, data: unknown) => DisplayValue;
  displayBoost: (view: { isMetric: boolean }, data: unknown) => DisplayValue;
  displayFuel: (data: unknown) => DisplayValue;
};

function loadCommon(): CenterInfoCommon {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_center_info_common.js'),
    'utf8',
  );
  const window = {} as { S650HmiCenterInfoCommon?: CenterInfoCommon };
  new Function('window', source)(window);
  if (!window.S650HmiCenterInfoCommon) throw new Error('S650 center-info common module did not register itself');
  return window.S650HmiCenterInfoCommon;
}

describe('S650 central information canonical data', () => {
  it('renders fixed-unit canonical powertrain and fuel fields', () => {
    const common = loadCommon();
    const data = {
      power_kw: 337,
      power_hp: 452,
      torque_nm: 610,
      torque_ftlbs: 450,
      boost_bar: 1.05,
      boost_psi: 15.2,
      fuel_ratio: 0.85,
    };

    expect(common.displayPower({ isMetric: true }, data)).toEqual({ value: 337, unit: 'kW' });
    expect(common.displayPower({ isMetric: false }, data)).toEqual({ value: 452, unit: 'HP' });
    expect(common.displayTorque({ isMetric: true }, data)).toEqual({ value: 610, unit: 'N·m' });
    expect(common.displayTorque({ isMetric: false }, data)).toEqual({ value: 450, unit: 'FT·LB' });
    expect(common.displayBoost({ isMetric: true }, data)).toEqual({ value: '1.1', unit: 'BAR' });
    expect(common.displayBoost({ isMetric: false }, data)).toEqual({ value: '15.2', unit: 'PSI' });
    expect(common.displayFuel(data)).toEqual({ value: 85, unit: '%' });
  });

  it('does not derive central information from raw telemetry aliases', () => {
    const common = loadCommon();
    const rawData = {
      PowerWatts: 337000,
      TorqueNewtons: 610,
      Boost: 15.2,
      Fuel: 0.85,
    };

    expect(common.displayPower({ isMetric: true }, rawData)).toEqual({ value: 0, unit: 'kW' });
    expect(common.displayTorque({ isMetric: false }, rawData)).toEqual({ value: 0, unit: 'FT·LB' });
    expect(common.displayBoost({ isMetric: false }, rawData)).toEqual({ value: '0.0', unit: 'PSI' });
    expect(common.displayFuel(rawData)).toEqual({ value: '--', unit: '%' });
  });
});
