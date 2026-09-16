import { describe, expect, it } from 'vitest';
import {
  CLASSIC_JDM_STYLE_ID,
  DEFAULT_CLASSIC_JDM_AUX1,
  DEFAULT_CLASSIC_JDM_AUX2,
  DEFAULT_CLASSIC_JDM_DEFI_THEME,
  DEFAULT_CLASSIC_JDM_SHOW_TRIPLE,
  DEFAULT_CLASSIC_JDM_TACH_STYLE,
  normalizeClassicJdmConfig,
} from './config';

describe('normalizeClassicJdmConfig', () => {
  it('migrates legacy initial_d to classic_jdm with TRD tach style', () => {
    const legacy = {
      hudStyle: 'initial_d',
      scale: 1.0,
    };
    const result = normalizeClassicJdmConfig(legacy);
    expect(result.hudStyle).toBe(CLASSIC_JDM_STYLE_ID);
    expect(result.classicJdmTachStyle).toBe('trd');
    expect(result.classicJdmShowTriple).toBe(DEFAULT_CLASSIC_JDM_SHOW_TRIPLE);
    expect(result.classicJdmAux1).toBe(DEFAULT_CLASSIC_JDM_AUX1);
    expect(result.classicJdmAux2).toBe(DEFAULT_CLASSIC_JDM_AUX2);
    expect(result.classicJdmDefiTheme).toBe(DEFAULT_CLASSIC_JDM_DEFI_THEME);
  });

  it('migrates legacy defi_triple to classic_jdm with Defi tach style and showTriple true', () => {
    const legacy = {
      hudStyle: 'defi_triple',
      scale: 1.2,
    };
    const result = normalizeClassicJdmConfig(legacy);
    expect(result.hudStyle).toBe(CLASSIC_JDM_STYLE_ID);
    expect(result.classicJdmTachStyle).toBe('defi');
    expect(result.classicJdmShowTriple).toBe(true);
  });

  it('normalizes classic_jdm with valid custom options', () => {
    const custom = {
      hudStyle: 'classic_jdm',
      classicJdmTachStyle: 'defi' as const,
      classicJdmShowTriple: false,
      classicJdmAux1: 'susp_travel_4w' as const,
      classicJdmAux2: 'slip_ratio_4w' as const,
      classicJdmDefiTheme: 'white' as const,
    };
    const result = normalizeClassicJdmConfig(custom);
    expect(result.hudStyle).toBe(CLASSIC_JDM_STYLE_ID);
    expect(result.classicJdmTachStyle).toBe('defi');
    expect(result.classicJdmShowTriple).toBe(false);
    expect(result.classicJdmAux1).toBe('susp_travel_4w');
    expect(result.classicJdmAux2).toBe('slip_ratio_4w');
    expect(result.classicJdmDefiTheme).toBe('white');
  });

  it('falls back to defaults when invalid options are provided to classic_jdm', () => {
    const invalid = {
      hudStyle: 'classic_jdm',
      classicJdmTachStyle: 'invalid_tach',
      classicJdmAux1: 'invalid_aux',
      classicJdmAux2: 'invalid_aux2',
      classicJdmDefiTheme: 'invalid_theme',
    };
    const result = normalizeClassicJdmConfig(invalid as any);
    expect(result.classicJdmTachStyle).toBe(DEFAULT_CLASSIC_JDM_TACH_STYLE);
    expect(result.classicJdmShowTriple).toBe(DEFAULT_CLASSIC_JDM_SHOW_TRIPLE);
    expect(result.classicJdmAux1).toBe(DEFAULT_CLASSIC_JDM_AUX1);
    expect(result.classicJdmAux2).toBe(DEFAULT_CLASSIC_JDM_AUX2);
    expect(result.classicJdmDefiTheme).toBe(DEFAULT_CLASSIC_JDM_DEFI_THEME);
  });

  it('leaves other HUD styles untouched', () => {
    const vfd = { hudStyle: 'vfd', scale: 0.8 };
    expect(normalizeClassicJdmConfig(vfd)).toBe(vfd);
  });
});
