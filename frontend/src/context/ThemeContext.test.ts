import { isCoreTheme, coreThemeEntries } from './themeCatalog';
import { describe, expect, it } from 'vitest';
import {
  defaultThemeSettings,
  normalizeThemeSettings,
  primaryForeground,
  themeColorProperties,
  rhinePalettes,
  type ThemeSettings,
} from './themeSettings';

describe('ThemeContext - Swiss Style and Core Theme support', () => {
  it('validates swiss as a recognized core theme value', () => {
    expect(isCoreTheme('rhine-lab')).toBe(true);
    expect(isCoreTheme('swiss')).toBe(true);
    expect(isCoreTheme('swiss-editorial')).toBe(true);
    expect(isCoreTheme('swiss-contrast')).toBe(true);
    expect(isCoreTheme('default')).toBe(true);
    expect(isCoreTheme('modern')).toBe(true);
    expect(isCoreTheme('elegant')).toBe(true);
    expect(isCoreTheme('unknown')).toBe(false);
  });

  it('correctly normalizes theme settings when halfmoonCore is swiss', () => {
    const candidate: Partial<ThemeSettings> = {
      mode: 'dark',
      halfmoonCore: 'swiss',
      primaryColor: '#e30613',
    };

    const normalized = normalizeThemeSettings(candidate);
    expect(normalized.halfmoonCore).toBe('swiss');
    expect(normalized.primaryColor).toBe('#e30613');
    expect(normalized.mode).toBe('dark');
    expect(normalized.secondaryColor).toBe(defaultThemeSettings.secondaryColor);
  });

  it('falls back to default halfmoonCore when invalid core theme is provided', () => {
    const candidate = {
      halfmoonCore: 'non-existent-core',
    };

    // @ts-expect-error Settings imported from JSON can contain an unknown core.
    const normalized = normalizeThemeSettings(candidate);
    expect(normalized.halfmoonCore).toBe('default');
  });

  it('keeps Mono legible across mode changes, saved settings and JSON round trips', () => {
    const mono = { ...defaultThemeSettings, halfmoonCore: 'swiss' as const,
      primaryColor: '#f1f5f9', secondaryColor: '#ef4444', accentColor: '#64748b' };
    const light = normalizeThemeSettings({ ...mono, mode: 'light' });
    expect(light.primaryColor).toBe('#000000');
    expect(normalizeThemeSettings(JSON.parse(JSON.stringify(light)))).toEqual(light);
    expect(normalizeThemeSettings({ ...light, mode: 'dark' })).toEqual(mono);
    expect(normalizeThemeSettings({ ...mono, primaryColor: '#F1F5F9', mode: 'light' })).toEqual(light);
  });

  it('preserves legacy/custom palettes and fills partial imports from current settings', () => {
    const custom = { ...defaultThemeSettings, halfmoonCore: 'elegant' as const,
      primaryColor: '#f1f5f9', secondaryColor: '#123456', customCSS: '.card { padding: 8px; }' };
    expect(normalizeThemeSettings({ mode: 'light' }, custom)).toEqual({ ...custom, mode: 'light' });
    expect(normalizeThemeSettings({ primaryColor: 'invalid' }, custom)).toEqual(custom);
    expect(normalizeThemeSettings(null)).toEqual(defaultThemeSettings);
  });

  it.each([
    ['#e30613', '#ffffff'], ['#000000', '#ffffff'],
    ['#f1f5f9', '#000000'], ['#00f0ff', '#000000'],
  ])('chooses readable text for primary fill %s', (color, foreground) => {
    expect(primaryForeground(color)).toBe(foreground);
  });

  it.each(coreThemeEntries.map(([id]) => id))('shares the preset with Halfmoon controls in %s', halfmoonCore => {
    const theme = normalizeThemeSettings({ halfmoonCore, primaryColor: '#ff0000' });
    const properties = themeColorProperties(theme);
    expect(properties['--primary']).toBe('#ff0000');
    expect(properties['--bs-primary-hsl']).toBe('0, 100%, 50%');
    expect(properties['--bs-primary-foreground']).toBe(properties['--on-primary']);
    const mono = themeColorProperties({ ...theme, primaryColor: '#ffffff' });
    expect(mono['--bs-primary-hsl']).toBe('0, 0%, 100%');
    expect(mono['--bs-primary-foreground-hsl']).toBe('0, 0%, 0%');
    expect(mono['--bs-primary-switch-svg']).toBe('var(--bs-switch-svg-dark)');
  });
});

it('adapts the complete Rhine palette across modes and leaves edited palettes intact', () => {
  const saved = normalizeThemeSettings({ halfmoonCore: 'rhine-lab', mode: 'dark', ...rhinePalettes.dark });
  const light = normalizeThemeSettings({ ...saved, mode: 'light' });
  expect(light).toMatchObject(rhinePalettes.light);
  expect(normalizeThemeSettings({ ...JSON.parse(JSON.stringify(light)), mode: 'dark' })).toEqual(saved);
  const custom = { ...saved, mode: 'light' as const, accentColor: '#123456' };
  expect(normalizeThemeSettings(custom)).toEqual(custom);
});
