import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error HUD-native JavaScript is intentionally outside the TS build.
import { normalizeBoost, PSI_PER_BAR, KPA_PER_PSI } from '../../boost-model.js';
// @ts-expect-error HUD-native JavaScript is intentionally outside the TS build.
import { createState } from '../../model.js';

describe('AP1 boost source and display contract', () => {
  const parsedFixtures = JSON.parse(readFileSync(resolve(process.cwd(), '../hud_overlay/ap1_rev_arc/tests/fixtures/boost-raw-json.json'), 'utf8'));
  it.each(parsedFixtures.cases)('accepts the production-parser JSON $name boost fixture', ({ frame, expectedBar }) => {
    expect(normalizeBoost(frame).bar).toBeCloseTo(expectedBar, 6);
  });
  it('reads raw Boost as PSI above atmosphere, including signed and zero values', () => {
    expect(normalizeBoost({ Boost: PSI_PER_BAR }).valueText).toBe('1.00');
    expect(normalizeBoost({ Boost: -PSI_PER_BAR / 2, boost_bar: 0 }).valueText).toBe('-0.50');
    expect(normalizeBoost({ Boost: 0 }).valueText).toBe('0.00');
    expect(normalizeBoost({ Boost: 0 }).ratio).toBeCloseTo(1 / 3);
    expect(normalizeBoost({}).valueText).toBe('--');
    expect(normalizeBoost({}).ratio).toBeNull();
  });
  it.each([null, undefined, '', false, NaN, Infinity, '14.5'])('never falls through an invalid raw Boost: %s', Boost => {
    expect(normalizeBoost({ Boost, boost_bar: 1, boost_psi: 14.5 }).value).toBeNull();
  });
  it.each(['TimestampMS', 'CurrentEngineRpm', 'EngineMaxRpm', 'SpeedMetersPerSecond', 'IsRaceOn', 'CarOrdinal'])('rejects fabricated aliases in a Coordinator-shaped frame marked by %s', marker => {
    expect(normalizeBoost({ [marker]: 1, boost: 0, boost_bar: 0, boost_psi: 0, boost_kpa: 0 }).value).toBeNull();
  });
  it('accepts canonical-only typed values without magnitude guessing', () => {
    expect(normalizeBoost({ boost_psi: PSI_PER_BAR }).bar).toBeCloseTo(1);
    expect(normalizeBoost({ boost_bar: -.75 }).bar).toBe(-.75);
    expect(normalizeBoost({ boost_kpa: -100 }).ratio).toBe(0);
    expect(normalizeBoost({ boost: 100, boost_unit: 'kPa' }).valueText).toBe('100');
    expect(normalizeBoost({ boost: 10, displayUnits: { boostPressure: 'psi' } }).valueText).toBe('10.0');
    expect(normalizeBoost({ boost: 14.5 }).value).toBeNull();
    expect(normalizeBoost({ boost: 100000, boost_unit: 'Pa' }).value).toBeNull();
    expect(normalizeBoost({ boost: 100000, boost_unit: 'Pa', displayUnits: { boostPressure: 'bar' } }).value).toBeNull();
  });
  it('honors canonical pressure metadata and supported configuration fallback', () => {
    const raw = { Boost: 10 };
    const psi = normalizeBoost(raw, {}, 'mph');
    const kpa = normalizeBoost(raw, { effectiveUnits: { boostPressure: 'kpa' } });
    expect(psi.unitLabel).toBe('PSI');
    expect(psi.value).toBe(10);
    expect(kpa.value).toBe(10 * KPA_PER_PSI);
    expect(normalizeBoost(raw, { units: { boostPressure: 'psi' } }).unit).toBe('psi');
    expect(normalizeBoost({ ...raw, displayUnits: { boostPressure: 'bar' } }, { effectiveUnits: { boostPressure: 'psi' } }).unit).toBe('bar');
  });
  it('clamps the signed geometry only and preserves actual out-of-range numbers', () => {
    const low = normalizeBoost({ boost_bar: -2 });
    const high = normalizeBoost({ boost_bar: 3 });
    expect(low.ratio).toBe(0);
    expect(low.valueText).toBe('-2.00');
    expect(low.overflow).toBe('low');
    expect(high.ratio).toBe(1);
    expect(high.valueText).toBe('3.00');
    expect(high.overflow).toBe('high');
    expect(normalizeBoost({ boost_bar: 1e8 }).valueText).toContain('e+');
  });
  it('keeps authored units while clearing stale or missing boost and restoring fresh zero', () => {
    const state = createState();
    state.configure({ effectiveUnits: { boostPressure: 'psi' } });
    state.receive({ timestamp_ms: 1, Boost: 10 }, {}, 0);
    expect(state.snapshot(1).boost.value).toBe(10);
    expect(state.snapshot(1600).boost.valueText).toBe('--');
    expect(state.snapshot(1600).boost.unitLabel).toBe('PSI');
    state.receive({ timestamp_ms: 2, Boost: 0 }, {}, 1700);
    expect(state.snapshot(1701).boost.valueText).toBe('0.0');
    state.receive({ timestamp_ms: 3, TimestampMS: 3, boost_psi: 0 }, {}, 1800);
    expect(state.snapshot(1801).boost.value).toBeNull();
  });
});
