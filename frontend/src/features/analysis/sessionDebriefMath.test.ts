import { describe, it, expect } from 'vitest';
import { calculateFrontendDebrief } from './sessionDebriefMath';
import fixture from '../../../../tests/fixtures/road_observation_contract.json';

describe('descriptive session observations', () => {
  it('preserves unknown values for empty, untimed and stopped observations', () => {
    for (const points of [[], [{ TireTemp: [140, 140, 140, 140] }],
      [0, 100].map(TimestampMS => ({ TimestampMS, IsRaceOn: 0, SpeedMetersPerSecond: 30, TireTemp: [140, 140, 140, 140] }))]) {
      const result = calculateFrontendDebrief(points);
      expect(result.observed_seconds).toBe(0);
      expect(result.tire_thermals.fl_avg).toBeNull();
      expect(result.suspension.bottom_out_count).toBeNull();
      expect(result.handling_balance.understeer_pct).toBeNull();
      expect(result.handling_balance.tendency).toBe('no_data');
    }
  });
  it('matches the backend shared contract including per-wheel missing data and gaps', () => {
    const result = calculateFrontendDebrief(fixture.points);
    expect(result).toEqual({
      ...fixture.expected,
      observed_seconds: expect.closeTo(fixture.expected.observed_seconds),
      tire_thermals: { ...fixture.expected.tire_thermals, fl_avg: expect.closeTo(85),
        rl_avg: expect.closeTo(60), rr_avg: expect.closeTo((240 - 32) * 5 / 9) },
      handling_balance: { ...fixture.expected.handling_balance,
        observed_seconds: expect.closeTo(fixture.expected.handling_balance.observed_seconds),
        understeer_pct: expect.closeTo(50), oversteer_pct: expect.closeTo(50) },
    });
  });
  it('counts sustained travel as one event per wheel at either sample rate', () => {
    for (const interval of [0.1, 0.05]) {
      const points = Array.from({ length: Math.round(2 / interval) + 1 }, (_, i) => ({
        time: i * interval, SpeedMetersPerSecond: 30,
        SuspTravel: [.96, .96, .4, .4], TireTemp: [140, 140, 140, 140],
      }));
      const result = calculateFrontendDebrief(points);
      expect(result.observed_seconds).toBeCloseTo(2);
      expect(result.suspension.bottom_out_count).toBe(2);
      expect(result.tire_thermals.fl_avg).toBeCloseTo(60);
      expect(result.tire_thermals.status).toBe('Observed');
    }
  });
  it('requires a seen start and attributable delayed LastLap for complete laps', () => {
    const points = [
      { LapNumber: 0, CurrentLap: .1, LastLap: 0 },
      { LapNumber: 0, CurrentLap: 65, LastLap: 0 },
      { LapNumber: 1, CurrentLap: .1, LastLap: 0 },
      { LapNumber: 1, CurrentLap: .2, LastLap: 65.1 },
    ];
    expect(calculateFrontendDebrief(points).valid_laps).toBe(1);
    expect(calculateFrontendDebrief(points.slice(1)).valid_laps).toBe(0);
    expect(calculateFrontendDebrief(points.slice(0, 3)).valid_laps).toBe(0);
  });
});
