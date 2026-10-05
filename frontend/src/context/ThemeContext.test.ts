import { describe, expect, it } from 'vitest';
import {
  defaultThemeSettings,
  isHalfmoonCore,
  normalizeThemeSettings,
  type ThemeSettings,
} from './ThemeContext';

describe('ThemeContext - Swiss Style and Core Theme support', () => {
  it('validates swiss as a recognized HalfmoonCore value', () => {
    expect(isHalfmoonCore('swiss')).toBe(true);
    expect(isHalfmoonCore('default')).toBe(true);
    expect(isHalfmoonCore('modern')).toBe(true);
    expect(isHalfmoonCore('elegant')).toBe(true);
    expect(isHalfmoonCore('unknown')).toBe(false);
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
      halfmoonCore: 'non-existent-core' as any,
    };

    const normalized = normalizeThemeSettings(candidate);
    expect(normalized.halfmoonCore).toBe('default');
  });
});
