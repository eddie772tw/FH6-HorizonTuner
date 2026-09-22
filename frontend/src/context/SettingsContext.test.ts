import { describe, expect, it } from 'vitest';
import {
  createOptimisticSettingsQueue,
  createScopedConverters,
  mergeSettingsUpdate,
  type AppSettings,
  type UnitSettings,
} from './SettingsContext';

const settings: AppSettings = {
  dyno_recording: false,
  race_recording: false,
  developer_tuning_enabled: false,
  language: 'en-us',
  dyno_test_gear: 4,
  dyno_filter_slip: true,
  dyno_filter_transients: true,
  units: {
    speed: 'kmh', weight: 'kg', temperature: 'C', tirePressure: 'bar', boostPressure: 'bar',
    springRate: 'kgfmm', rideHeight: 'cm', suspensionForce: 'kgf', power: 'hp', torque: 'nm'
  }
};

describe('settings persistence updates', () => {
  it('merges a unit patch without discarding the existing settings', () => {
    expect(mergeSettingsUpdate(settings, { units: { power: 'kw' } }).units.power).toBe('kw');
  });

  it('removes only an older failed patch while retaining a newer optimistic update', () => {
    const queue = createOptimisticSettingsQueue(settings);

    queue.enqueue(1, { language: 'zh-tw' });
    expect(queue.enqueue(2, { dyno_recording: true })).toMatchObject({
      language: 'zh-tw',
      dyno_recording: true,
    });

    expect(queue.settle(1, false)).toMatchObject({
      language: 'en-us',
      dyno_recording: true,
    });
    expect(queue.settle(2, true)).toMatchObject({
      language: 'en-us',
      dyno_recording: true,
    });
  });
});

describe('SettingsContext - convertBoost unit conversions', () => {
  const baseUnits: UnitSettings = {
    speed: 'kmh',
    weight: 'kg',
    temperature: 'C',
    tirePressure: 'bar',
    boostPressure: 'bar',
    springRate: 'kgfmm',
    rideHeight: 'cm',
    suspensionForce: 'kgf',
    power: 'hp',
    torque: 'nm',
  };

  it('converts raw Pa to bar without 6,894.76x magnification', () => {
    const converters = createScopedConverters({ ...baseUnits, boostPressure: 'bar' });
    const result = converters.convertBoost(150_000);
    expect(result.value).toBeCloseTo(1.5, 4);
    expect(result.label).toBe('bar');

    // Negative regression check: verify absence of ~10,342 bar
    expect(result.value).toBeLessThan(10);
  });

  it('converts raw Pa to PSI with accurate physical factor', () => {
    const converters = createScopedConverters({ ...baseUnits, boostPressure: 'psi' });
    const result = converters.convertBoost(150_000);
    expect(result.value).toBeCloseTo(21.756, 2);
    expect(result.label).toBe('PSI');

    // Negative regression check: verify absence of 150,000 psi
    expect(result.value).toBeLessThan(100);
  });

  it('converts raw Pa to kPa correctly', () => {
    const converters = createScopedConverters({ ...baseUnits, boostPressure: 'kpa' });
    const result = converters.convertBoost(150_000);
    expect(result.value).toBeCloseTo(150.0, 4);
    expect(result.label).toBe('kPa');
  });

  it('handles zero, negative, and non-finite boost values safely', () => {
    const converters = createScopedConverters({ ...baseUnits, boostPressure: 'bar' });
    expect(converters.convertBoost(0)).toEqual({ value: 0, label: 'bar' });
    expect(converters.convertBoost(-1000)).toEqual({ value: 0, label: 'bar' });
    expect(converters.convertBoost(NaN)).toEqual({ value: 0, label: 'bar' });
  });
});
