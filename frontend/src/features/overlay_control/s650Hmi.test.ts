import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DEFAULT_S650_HMI_THEME,
  DEFAULT_S650_CENTER_WIDGET,
  LEGACY_S650_STYLE_MAP,
  S650_CENTER_WIDGETS,
  S650_HMI_STYLE_ID,
  S650_HMI_THEMES,
  type S650HmiTheme,
  isS650CenterWidget,
  isS650HmiTheme,
  normalizeS650HmiConfig,
} from './s650Hmi';

describe('S650 HMI config contract', () => {
  it('exposes only the retained S650 themes in the selector', () => {
    expect(S650_HMI_THEMES.map((theme) => theme.value)).toEqual([
      'normal',
      'foxbody',
      'heritage67',
    ]);
  });

  it('exposes stable central information pages for dual-ring themes', () => {
    expect(S650_CENTER_WIDGETS.map((widget) => widget.value)).toEqual(['disable', 'drive', 'tire_temp', 'performance']);
  });

  it.each(Object.entries(LEGACY_S650_STYLE_MAP))('migrates legacy style id %s', (legacyStyle, theme) => {
    const config = {
      hudStyle: legacyStyle,
      s650Theme: 'stale-theme',
      customSetting: { enabled: true },
    };

    expect(normalizeS650HmiConfig(config)).toEqual({
      ...config,
      hudStyle: S650_HMI_STYLE_ID,
      s650Theme: theme,
      s650CenterWidget: DEFAULT_S650_CENTER_WIDGET,
    });
    expect(config).toEqual({
      hudStyle: legacyStyle,
      s650Theme: 'stale-theme',
      customSetting: { enabled: true },
    });
  });

  it.each(['s650_sport', 's650_track', 's650_calm', 's650_svt_cobra'])
    ('falls back removed legacy style id %s to Heritage', (legacyStyle) => {
      expect(normalizeS650HmiConfig({ hudStyle: legacyStyle }).s650Theme).toBe(DEFAULT_S650_HMI_THEME);
    });

  it.each([
    ['unknown', 'unknown string'],
    ['', 'empty string'],
    [null, 'null'],
    [42, 'number'],
    [{ value: 'track' }, 'object'],
  ])('falls back to Heritage for an invalid theme (%s)', (invalidTheme, label) => {
    expect(label).toBeTypeOf('string');
    expect(normalizeS650HmiConfig({ hudStyle: S650_HMI_STYLE_ID, s650Theme: invalidTheme }).s650Theme).toBe(
      DEFAULT_S650_HMI_THEME
    );
  });

  it('preserves a valid HMI theme and unrelated config fields', () => {
    const config = {
      hudStyle: S650_HMI_STYLE_ID,
      s650Theme: 'foxbody',
      telemetry: { showGear: true },
    };

    const normalized = normalizeS650HmiConfig(config);

    expect(normalized).toEqual({ ...config, s650CenterWidget: DEFAULT_S650_CENTER_WIDGET });
    expect(normalized).not.toBe(config);
    expect(normalized.telemetry).toBe(config.telemetry);
  });

  it('defaults a missing theme for an already-normalized HMI config', () => {
    expect(normalizeS650HmiConfig({ hudStyle: S650_HMI_STYLE_ID })).toEqual({
      hudStyle: S650_HMI_STYLE_ID,
      s650Theme: DEFAULT_S650_HMI_THEME,
      s650CenterWidget: DEFAULT_S650_CENTER_WIDGET,
    });
  });

  it.each([
    { hudStyle: 'vfd', s650Theme: 'track', customSetting: true },
    { hudStyle: 'advanced', s650Theme: 'invalid', customSetting: true },
    { customSetting: true },
  ])('does not alter non-S650 HUD configs or their object identity', (config) => {
    const before = { ...config };

    expect(normalizeS650HmiConfig(config)).toBe(config);
    expect(normalizeS650HmiConfig(config)).toEqual(config);
    expect(config).toEqual(before);
  });

  it('recognizes only registered HMI themes', () => {
    expect(isS650HmiTheme('normal')).toBe(true);
    expect(isS650HmiTheme('foxbody')).toBe(true);
    expect(isS650HmiTheme('heritage67')).toBe(true);
    expect(isS650HmiTheme('track')).toBe(false);
    expect(isS650HmiTheme('s650_heritage67')).toBe(false);
    expect(isS650HmiTheme('')).toBe(false);
    expect(isS650HmiTheme(undefined)).toBe(false);
    expect(isS650HmiTheme(null)).toBe(false);
    expect(isS650HmiTheme(42)).toBe(false);
    expect(isS650HmiTheme({ value: 'heritage67' })).toBe(false);
  });

  it.each(['disable', 'drive', 'tire_temp', 'performance'] as const)('preserves the supported central information page %s', (widget) => {
    expect(normalizeS650HmiConfig({ hudStyle: S650_HMI_STYLE_ID, s650CenterWidget: widget }).s650CenterWidget).toBe(widget);
    expect(normalizeS650HmiConfig({ hudStyle: S650_HMI_STYLE_ID, s650CenterWidget: 'unknown' }).s650CenterWidget).toBe(
      DEFAULT_S650_CENTER_WIDGET
    );
    expect(isS650CenterWidget('disable')).toBe(true);
    expect(isS650CenterWidget('performance')).toBe(true);
    expect(isS650CenterWidget('tpms')).toBe(false);
  });

  it('keeps the generic config shape while exposing the theme type guard', () => {
    const config = {
      hudStyle: S650_HMI_STYLE_ID,
      s650Theme: 'normal' as const,
      customSetting: 7,
    };
    const normalized = normalizeS650HmiConfig(config);

    expectTypeOf(normalized).toMatchTypeOf<typeof config>();
    expectTypeOf(isS650HmiTheme).guards.toEqualTypeOf<S650HmiTheme>();

    const candidate: unknown = 'normal';
    if (isS650HmiTheme(candidate)) {
      expectTypeOf(candidate).toEqualTypeOf<S650HmiTheme>();
    }
  });
});
