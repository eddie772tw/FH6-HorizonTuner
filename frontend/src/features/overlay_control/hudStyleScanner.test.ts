import { describe, it, expect, vi } from 'vitest';
import {
  fetchHudStylesList,
  formatHudDropdownOptions,
  getHudUrlPrefix,
  HUD_DISPLAY_NAMES,
  HudStyleEntry,
} from './hudStyleScanner';

describe('hudStyleScanner frontend module tests', () => {
  it('fetchHudStylesList should correctly call backend API and return parsed styles', async () => {
    const mockResponse: HudStyleEntry[] = [
      { id: 'simple', source: 'builtin', urlPrefix: '/hud' },
      { id: 'custom_racing', source: 'user', urlPrefix: '/hud_user' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ styles: mockResponse }),
    });

    const result = await fetchHudStylesList('http://127.0.0.1:8001', mockFetch as any);

    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8001/api/hud/styles');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('simple');
    expect(result[1].source).toBe('user');
  });

  it('fetchHudStylesList should return empty array when API call fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchHudStylesList('http://127.0.0.1:8001', mockFetch as any);

    expect(result).toEqual([]);
  });

  it('formatHudDropdownOptions should map built-in HUD names and prefix custom HUD names with [Custom]', () => {
    const styles: HudStyleEntry[] = [
      { id: 'vfd', source: 'builtin', urlPrefix: '/hud' },
      { id: 'gt7', source: 'builtin', urlPrefix: '/hud' },
      { id: 'cyber_drift', source: 'user', urlPrefix: '/hud_user' },
    ];

    const options = formatHudDropdownOptions(styles, HUD_DISPLAY_NAMES);

    expect(options).toHaveLength(3);

    // Builtin mapping
    expect(options[0]).toEqual({
      value: 'vfd',
      label: 'Retro VFD',
      isCustom: false,
    });
    expect(options[1]).toEqual({
      value: 'gt7',
      label: 'GT7',
      isCustom: false,
    });

    // Custom mapping
    expect(options[2]).toEqual({
      value: 'cyber_drift',
      label: '[Custom] cyber_drift',
      isCustom: true,
    });
  });

  it('formatHudDropdownOptions should return default fallback options when styles list is empty', () => {
    const options = formatHudDropdownOptions([]);

    expect(options.length).toBeGreaterThan(0);
    expect(options.some((opt) => opt.value === 'vfd' && opt.label === 'Retro VFD')).toBe(true);
    expect(options.some((opt) => opt.value === 'drift' && opt.label === 'Drift HUD')).toBe(true);
    expect(options.some((opt) => opt.value === 's650_hmi' && opt.label === 'S650 HMI')).toBe(true);
  });

  it('getHudUrlPrefix should return /hud_user for custom HUD and /hud for builtin or unknown HUD', () => {
    const styles: HudStyleEntry[] = [
      { id: 'simple', source: 'builtin', urlPrefix: '/hud' },
      { id: 'my_hud', source: 'user', urlPrefix: '/hud_user' },
    ];

    expect(getHudUrlPrefix(styles, 'my_hud')).toBe('/hud_user');
    expect(getHudUrlPrefix(styles, 'simple')).toBe('/hud');
    expect(getHudUrlPrefix(styles, 'non_existent')).toBe('/hud');
  });
});
