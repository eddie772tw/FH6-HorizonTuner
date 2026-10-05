import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error HUD-native JavaScript is intentionally outside the TS build.
import { normalizeBoost, boostGaugeRatio, boostScaleTicks, PSI_PER_BAR, KPA_PER_PSI } from '../../boost-model.js';
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
    expect(normalizeBoost({ Boost: 0 }).ratio).toBe(0);
    expect(normalizeBoost({ Boost: 0 }).mode).toBe('neutral');
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
    expect(normalizeBoost({ boost_kpa: -100 }).ratio).toBe(.75);
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
    const low = normalizeBoost({ boost_bar: -3 });
    const high = normalizeBoost({ boost_bar: 3 });
    expect(low.ratio).toBe(1);
    expect(low.valueText).toBe('-3.00');
    expect(low.overflow).toBe('low');
    expect(high.ratio).toBe(1);
    expect(high.valueText).toBe('3.00');
    expect(high.overflow).toBe('high');
    expect(normalizeBoost({ boost_bar: 1e8 }).valueText).toContain('e+');
  });
  it.each([['bar','-0.00'],['psi','-0.0'],['kpa','-0']])('retains tiny negative source sign in %s but treats actual negative zero as neutral', (unit, expected) => {
    const tiny = normalizeBoost({ boost_bar: -.001 }, { effectiveUnits: { boostPressure: unit } });
    expect(tiny.valueText).toBe(expected);
    expect(tiny.mode).toBe('vacuum');
    const zero = normalizeBoost({ boost_bar: -0 }, { effectiveUnits: { boostPressure: unit } });
    expect(zero.valueText.startsWith('-')).toBe(false);
    expect(zero.mode).toBe('neutral');
    expect(zero.ratio).toBe(0);
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


describe('AP1 shared monochrome magnitude mapping', () => {
  it.each([[0,0],[.25,.1875],[.5,.375],[1,.75],[1.5,.875],[2,1],[3,1]])('maps positive %sbar to the requested fraction %s', (bar, ratio) => {
    expect(boostGaugeRatio(bar)).toBe(ratio);
  });
  it.each([-.25,-.5,-1,-2])('uses the same nonlinear magnitude curve for negative %sbar', bar => {
    const boost = normalizeBoost({ boost_bar: bar });
    expect(boost.ratio).toBe(boostGaugeRatio(Math.abs(bar)));
    expect(boost.mode).toBe('vacuum');
    expect(boost.modeLabel).toBe('VAC');
    expect(boost.value).toBe(bar);
  });
  it.each([.5,1,2])('shares the exact fill fraction and magnitude graduations for both signs at%sbar', bar => {
    const positive = normalizeBoost({ boost_bar: bar });
    const negative = normalizeBoost({ boost_bar: -bar });
    expect(negative.ratio).toBe(positive.ratio);
    expect(negative.ticks).toEqual(positive.ticks);
    expect(negative.valueText).toBe('-' + positive.valueText);
    expect(negative.modeLabel).toBe('VAC');
    expect(negative.overflow).toBeNull();
  });
  it('is monotonic within each mode and continuous at the positive breakpoint', () => {
    for (let i = 0; i < 200; i++) {
      expect(boostGaugeRatio(i / 100)).toBeLessThanOrEqual(boostGaugeRatio((i + 1) / 100));
      expect(boostGaugeRatio(-i / 100)).toBeLessThanOrEqual(boostGaugeRatio(-(i + 1) / 100));
    }
    expect(boostGaugeRatio(1 - 1e-8)).toBeCloseTo(.75, 7);
    expect(boostGaugeRatio(1 + 1e-8)).toBeCloseTo(.75, 7);
    expect(boostGaugeRatio(null)).toBeNull();
  });
  it('keeps fill fractions and tick positions invariant across units', () => {
    for (const bar of [-2,-1,-.5,0,.25,.5,1,2]) {
      const expected = boostGaugeRatio(bar);
      for (const data of [{ boost_bar: bar }, { boost_psi: bar * PSI_PER_BAR }, { boost_kpa: bar * 100 }]) {
        for (const unit of ['bar','psi','kpa']) {
          expect(normalizeBoost(data, { effectiveUnits: { boostPressure: unit } }).ratio).toBeCloseTo(expected, 12);
        }
      }
    }
    for (const unit of ['bar','psi','kpa']) {
      expect(boostScaleTicks(unit, 'boost').map((tick: any) => tick.position)).toEqual([0,.375,.75,1]);
      expect(boostScaleTicks(unit, 'vacuum').map((tick: any) => tick.position)).toEqual([0,.375,.75,1]);
    }
    expect(boostScaleTicks('kpa','boost').map((tick: any) => tick.label)).toEqual(['0','50','100','200']);
    expect(boostScaleTicks('bar','vacuum').map((tick: any) => tick.label)).toEqual(['0','0.5','1','2']);
  });
});
