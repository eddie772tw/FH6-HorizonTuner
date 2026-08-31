import { describe, expect, it } from 'vitest';
import { createOptimisticSettingsQueue, mergeSettingsUpdate, type AppSettings } from './SettingsContext';

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
