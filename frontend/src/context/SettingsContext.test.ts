import { describe, expect, it } from 'vitest';
import { mergeSettingsUpdate, persistSettingsUpdate, type AppSettings } from './SettingsContext';

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

  it('returns the exact previous settings for rollback when a write fails', async () => {
    const result = await persistSettingsUpdate(settings, { language: 'zh-tw' }, async () => new Response(null, { status: 500 }));

    expect(result.settings.language).toBe('zh-tw');
    expect(result.rollback).toEqual(settings);
  });
});
