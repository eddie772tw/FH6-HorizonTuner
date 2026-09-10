import { describe, expect, it } from 'vitest';
import {
  createCarParamsSaveSnapshot,
  isCurrentCarParamsSnapshot,
  mergeDynoPollResult,
  persistCarParams,
  type CarParams,
} from './CarParamsContext';

const params = (): CarParams => ({
  weight: 1200,
  weight_distribution: 50,
  drivetrain: 'RWD',
  induction: 'NA',
  maxHp: 400,
  maxTorque: 350,
  maxHpRpm: 6500,
  maxTorqueRpm: 5000,
  aeroEfficiency: 0.5,
  adjustability: {
    gearbox: 'Full', gears: 6, suspension: 'Race', arb: 'Adjustable',
    aero: 'Adjustable', brakes: 'Adjustable', diff: 'Adjustable',
  },
  dyno_curve: { '5000': { hp: 300, torque: 315 } },
  dyno_quality: {
    status: 'observing', confidence: 0.25, reasons: [], canCollect: true,
    segmentId: 0, segmentReset: false,
  },
});

describe('mergeDynoPollResult', () => {
  it('refreshes dyno quality with the curve on each polling response', () => {
    const refreshed = mergeDynoPollResult(params(), {
      dyno_curve: { '6000': { hp: 410, torque: 360 } },
      dyno_quality: {
        status: 'confident', confidence: 1, reasons: [], canCollect: true,
        segmentId: 2, segmentReset: false,
      },
    });

    expect(refreshed.dyno_curve).toEqual({ '6000': { hp: 410, torque: 360 } });
    expect(refreshed.dyno_quality).toMatchObject({ status: 'confident', segmentId: 2 });
    expect(refreshed.maxHpRpm).toBe(6500);
  });

  it('clears stale quality when the next profile response has no quality field', () => {
    const refreshed = mergeDynoPollResult(params(), {
      dyno_curve: {},
      dyno_quality: undefined,
    });

    expect(refreshed.dyno_quality).toBeUndefined();
  });
});

describe('car parameter persistence', () => {
  it('requires an OK response before reporting a profile saved', async () => {
    const request = async (path: string, options?: RequestInit) => {
      expect(path).toBe('/api/car_params/3726');
      expect(options).toMatchObject({ method: 'POST', body: JSON.stringify(params()) });
      return new Response('', { status: 500 });
    };

    await expect(persistCarParams(createCarParamsSaveSnapshot('3726', params()), request as typeof fetch)).resolves.toBe(false);
  });

  it('binds a pending autosave to the edited car instead of the later active car', () => {
    const snapshot = createCarParamsSaveSnapshot('3726', params());
    expect(isCurrentCarParamsSnapshot('3726', snapshot)).toBe(true);
    expect(isCurrentCarParamsSnapshot('2659', snapshot)).toBe(false);
  });
});
