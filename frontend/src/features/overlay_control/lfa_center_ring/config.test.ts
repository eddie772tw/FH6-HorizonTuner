import { describe, expect, it } from 'vitest';
import { DEFAULT_HUD_CONFIG } from '../hudConfig';
import { normalizeLfaExpansionConfig } from './config';

describe('LFA expansion settings boundary', () => {
  it('keeps both options opt-in by default', () => {
    expect(DEFAULT_HUD_CONFIG.lfaManualExpand).toBe(false);
    expect(DEFAULT_HUD_CONFIG.lfaAutoExpand).toBe(false);
    expect(normalizeLfaExpansionConfig({ hudStyle: 'lfa_center_ring' })).toEqual({
      hudStyle: 'lfa_center_ring', lfaManualExpand: false, lfaAutoExpand: false,
    });
  });

  it.each([[false, false], [false, true], [true, false], [true, true]])(
    'preserves manual=%s / automatic=%s as independent saved options', (lfaManualExpand, lfaAutoExpand) => {
      const config = { hudStyle: 'lfa_center_ring', lfaManualExpand, lfaAutoExpand, pluginField: { keep: true } };
      expect(normalizeLfaExpansionConfig(config)).toEqual(config);
    },
  );

  it.each([null, undefined, 0, 1, '', 'true', 'false', [], {}])(
    'does not coerce invalid switch values (%s) into an opt-in', value => {
      expect(normalizeLfaExpansionConfig({ hudStyle: 'lfa_center_ring', lfaManualExpand: value, lfaAutoExpand: value }))
        .toMatchObject({ lfaManualExpand: false, lfaAutoExpand: false });
    },
  );

  it.each(['vfd', 'simple', 'classic_jdm', 's650_hmi', 'custom_style'])(
    'does not normalize unrelated %s settings', hudStyle => {
      const config = { hudStyle, lfaManualExpand: 'leave alone', lfaAutoExpand: true, pluginField: 3 };
      expect(normalizeLfaExpansionConfig(config)).toBe(config);
    },
  );
});
