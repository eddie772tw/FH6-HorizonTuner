import { describe, expect, it } from 'vitest';
import { coreThemeEntries } from '../../context/themeCatalog';
import { rhinePalettes } from '../../context/themeSettings';
import { parseCompanionVisualTheme } from './companionTheme';

const visual = { schemaVersion: 1, mode: 'light', halfmoonCore: 'swiss', primaryColor: '#123456', secondaryColor: '#abcdef', accentColor: '#987654' };
describe('Companion visual contract', () => {
  it('accepts all seven cores, both modes, presets and custom palettes atomically', () => {
    for (const [halfmoonCore] of coreThemeEntries) for (const mode of ['light', 'dark']) {
      for (const palette of [visual, { primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff' }, { primaryColor: '#e30613', secondaryColor: '#111827', accentColor: '#6b7280' }]) {
        const input = { ...visual, ...palette, mode, halfmoonCore };
        expect(parseCompanionVisualTheme(input)).toEqual(input);
      }
      expect(parseCompanionVisualTheme({ ...visual, mode, halfmoonCore, ...rhinePalettes.light })).toMatchObject(rhinePalettes[mode as 'light' | 'dark']);
      expect(parseCompanionVisualTheme({ ...visual, mode, halfmoonCore, primaryColor: '#f1f5f9', secondaryColor: '#ef4444', accentColor: '#64748b' })?.primaryColor).toBe(mode === 'light' ? '#000000' : '#f1f5f9');
    }
  });
  it('rejects missing, unknown, executable, malformed and oversized fields without partial fallback', () => {
    for (const key of Object.keys(visual)) {
      const incomplete: Record<string, unknown> = { ...visual }; delete incomplete[key];
      expect(parseCompanionVisualTheme(incomplete)).toBeNull();
    }
    for (const value of [null, undefined, [], '{', { ...visual, schemaVersion: 2 }, { ...visual, mode: 'auto' }, { ...visual, halfmoonCore: 'rhine' }, { ...visual, primaryColor: '#fff' }, { ...visual, accentColor: 'url(x)' }, { ...visual, customCSS: 'script' }, ' '.repeat(1025) + JSON.stringify(visual)]) expect(parseCompanionVisualTheme(value)).toBeNull();
  });
});
