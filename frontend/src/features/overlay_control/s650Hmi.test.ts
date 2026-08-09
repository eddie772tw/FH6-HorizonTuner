import { describe, expect, it } from 'vitest';
import {
  isS650HmiTheme,
  normalizeS650HmiConfig,
} from './s650Hmi';

describe('S650 HMI config contract', () => {
  it('migrates each legacy style id to the unified HMI style', () => {
    expect(normalizeS650HmiConfig({ hudStyle: 's650_track' })).toEqual({
      hudStyle: 's650_hmi',
      s650Theme: 'track',
    });
  });

  it('preserves a valid HMI mode and defaults invalid modes to normal', () => {
    expect(normalizeS650HmiConfig({ hudStyle: 's650_hmi', s650Theme: 'foxbody' }).s650Theme).toBe('foxbody');
    expect(normalizeS650HmiConfig({ hudStyle: 's650_hmi', s650Theme: 'unknown' }).s650Theme).toBe('normal');
  });

  it('does not alter non-S650 HUD styles', () => {
    const config = { hudStyle: 'vfd', s650Theme: 'track' };
    expect(normalizeS650HmiConfig(config)).toBe(config);
  });

  it('recognizes only registered HMI modes', () => {
    expect(isS650HmiTheme('heritage67')).toBe(true);
    expect(isS650HmiTheme('s650_heritage67')).toBe(false);
  });
});
