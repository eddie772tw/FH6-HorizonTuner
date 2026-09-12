import { describe, it, expect, vi } from 'vitest';
import {
  fetchHudStylesList,
  formatHudDropdownOptions,
  getHudUrlPrefix,
  isWipHudQueryEnabled,
  HUD_DISPLAY_NAMES,
  WIP_HUD_DISPLAY_NAMES,
  WIP_HUD_IDS,
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

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8001/api/hud/styles',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('simple');
    expect(result[1].source).toBe('user');
  });

  it('fetchHudStylesList should return empty array when API call fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchHudStylesList('http://127.0.0.1:8001', mockFetch as any);

    expect(result).toEqual([]);
  });

  it('fetchHudStylesList should reject API failures in strict mode', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(
      fetchHudStylesList('http://127.0.0.1:8001', mockFetch as any, { strict: true }),
    ).rejects.toThrow('HUD styles request failed (HTTP 503).');
  });

  it('fetchHudStylesList should reject timeouts in strict mode', async () => {
    const mockFetch = vi.fn().mockImplementation(
      (_path: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
    );

    await expect(
      fetchHudStylesList('http://127.0.0.1:8001', mockFetch as any, {
        strict: true,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('HUD styles request timed out after 1ms.');
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

  describe('HUD menu registration and WIP handling', () => {
    it('HUD_DISPLAY_NAMES should exclude WIP styles and retain production styles', () => {
      // WIP styles must be unregistered from official HUD_DISPLAY_NAMES
      expect(HUD_DISPLAY_NAMES['motec_gt3']).toBeUndefined();
      expect(HUD_DISPLAY_NAMES['fh5_arc']).toBeUndefined();
      expect(HUD_DISPLAY_NAMES['cyberpunk_hud']).toBeUndefined();

      // Production styles should be retained
      expect(HUD_DISPLAY_NAMES['defi_triple']).toBe('Defi Advance BF');
      expect(HUD_DISPLAY_NAMES['initial_d']).toBe('Initial D AE86 TRD');
      expect(HUD_DISPLAY_NAMES['vfd']).toBe('Retro VFD');
    });

    it('WIP_HUD_DISPLAY_NAMES and WIP_HUD_IDS should correctly track WIP styles', () => {
      expect(WIP_HUD_IDS.has('motec_gt3')).toBe(true);
      expect(WIP_HUD_IDS.has('fh5_arc')).toBe(true);
      expect(WIP_HUD_IDS.has('cyberpunk_hud')).toBe(true);
      expect(WIP_HUD_IDS.has('defi_triple')).toBe(false);

      expect(WIP_HUD_DISPLAY_NAMES['fh5_arc']).toContain('(WIP)');
      expect(WIP_HUD_DISPLAY_NAMES['cyberpunk_hud']).toContain('(WIP)');
      expect(WIP_HUD_DISPLAY_NAMES['motec_gt3']).toContain('(WIP)');
    });

    it('formatHudDropdownOptions should exclude WIP styles by default', () => {
      const mockStyles: HudStyleEntry[] = [
        { id: 'vfd', source: 'builtin', urlPrefix: '/hud' },
        { id: 'fh5_arc', source: 'builtin', urlPrefix: '/hud' },
        { id: 'cyberpunk_hud', source: 'builtin', urlPrefix: '/hud' },
        { id: 'motec_gt3', source: 'builtin', urlPrefix: '/hud' },
        { id: 'defi_triple', source: 'builtin', urlPrefix: '/hud' },
      ];

      const options = formatHudDropdownOptions(mockStyles);
      const optionValues = options.map((o) => o.value);

      expect(optionValues).toContain('vfd');
      expect(optionValues).toContain('defi_triple');
      expect(optionValues).not.toContain('fh5_arc');
      expect(optionValues).not.toContain('cyberpunk_hud');
      expect(optionValues).not.toContain('motec_gt3');
    });

    it('formatHudDropdownOptions should include WIP styles when includeWip is true', () => {
      const mockStyles: HudStyleEntry[] = [
        { id: 'vfd', source: 'builtin', urlPrefix: '/hud' },
        { id: 'fh5_arc', source: 'builtin', urlPrefix: '/hud' },
        { id: 'defi_triple', source: 'builtin', urlPrefix: '/hud' },
      ];

      const options = formatHudDropdownOptions(mockStyles, HUD_DISPLAY_NAMES, { includeWip: true });
      const fh5Option = options.find((o) => o.value === 'fh5_arc');

      expect(fh5Option).toBeDefined();
      expect(fh5Option?.label).toBe('Forza Horizon 5 (WIP)');
    });

    it('formatHudDropdownOptions should preserve WIP style if it matches currentStyle', () => {
      const mockStyles: HudStyleEntry[] = [
        { id: 'vfd', source: 'builtin', urlPrefix: '/hud' },
        { id: 'fh5_arc', source: 'builtin', urlPrefix: '/hud' },
        { id: 'cyberpunk_hud', source: 'builtin', urlPrefix: '/hud' },
      ];

      const options = formatHudDropdownOptions(mockStyles, HUD_DISPLAY_NAMES, {
        includeWip: false,
        currentStyle: 'cyberpunk_hud',
      });
      const values = options.map((o) => o.value);

      expect(values).toContain('cyberpunk_hud');
      expect(values).not.toContain('fh5_arc');

      const cyberpunkOption = options.find((o) => o.value === 'cyberpunk_hud');
      expect(cyberpunkOption?.label).toBe('Cyberpunk 2077 Quadra (WIP)');
    });

    it('isWipHudQueryEnabled should correctly detect URL search parameters', () => {
      expect(isWipHudQueryEnabled('?wip=1')).toBe(true);
      expect(isWipHudQueryEnabled('?wip=true')).toBe(true);
      expect(isWipHudQueryEnabled('?dev=1')).toBe(true);
      expect(isWipHudQueryEnabled('?dev=true')).toBe(true);
      expect(isWipHudQueryEnabled('?foo=bar&wip=1')).toBe(true);
      expect(isWipHudQueryEnabled('?wip=0')).toBe(false);
      expect(isWipHudQueryEnabled('?dev=false')).toBe(false);
      expect(isWipHudQueryEnabled('')).toBe(false);
    });
  });
});
