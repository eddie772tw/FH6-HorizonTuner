import { describe, expect, it } from 'vitest';
import { normalizeStackSt8100Config, STACK_ST8100_DEFAULTS, STACK_ST8100_FIELDS, STACK_ST8100_LIMITS } from './config';
import { parseStackSt8100ThresholdDraft, resolveStackSt8100BoostUnit, stackSt8100ThresholdFromDisplay, stackSt8100ThresholdToDisplay } from './units';

describe('Stack ST8100 configuration boundary', () => {
  it('adds active defaults with opt-in monitoring and preserves unrelated data', () => {
    const source = { hudStyle: 'stack_st8100', future: { enabled: true }, classicJdmTachStyle: 'defi' };
    expect(normalizeStackSt8100Config(source)).toEqual({ ...source, ...STACK_ST8100_DEFAULTS });
    expect(source).not.toHaveProperty('stackSt8100Dial');
  });

  it('leaves unrelated inactive settings intact and only normalizes present Stack keys', () => {
    const source = { hudStyle: 'vfd', future: ['keep'], glowIntensity: 1.4 };
    expect(normalizeStackSt8100Config(source)).toEqual(source);
    expect(normalizeStackSt8100Config({ ...source, stackSt8100ShiftEnabled: 'false', stackSt8100Field1: 'oil' }))
      .toEqual({ ...source, stackSt8100ShiftEnabled: true, stackSt8100Field1: 'speed' });
  });

  it('accepts every supported field and exact enum, including auto and fixed dial ranges', () => {
    for (const { value } of STACK_ST8100_FIELDS) {
      expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100Field2: value }).stackSt8100Field2).toBe(value);
    }
    for (const value of ['auto', '0-3-8', '0-4-10', '0-6-13']) {
      expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100Dial: value }).stackSt8100Dial).toBe(value);
    }
    expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100Page: 'peaks', stackSt8100TemperatureUnit: 'f' }))
      .toMatchObject({ stackSt8100Page: 'peaks', stackSt8100TemperatureUnit: 'f' });
  });

  it('rejects coercion and non-finite values, clamps finite thresholds, and is idempotent', () => {
    for (const invalid of [null, true, false, '75', '', [], {}, NaN, Infinity, -Infinity]) {
      for (const key of Object.keys(STACK_ST8100_LIMITS) as (keyof typeof STACK_ST8100_LIMITS)[]) {
        const normalized = normalizeStackSt8100Config({ hudStyle: 'stack_st8100', [key]: invalid });
        expect(normalized[key]).toBe(STACK_ST8100_DEFAULTS[key]);
      }
    }
    for (const [key, { min, max }] of Object.entries(STACK_ST8100_LIMITS)) {
      expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', [key]: -1000 })[key]).toBe(min);
      expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', [key]: 10000 })[key]).toBe(max);
    }
    for (const value of ['false', 0, 1, null, [], {}]) {
      expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100FuelWarningEnabled: value }).stackSt8100FuelWarningEnabled).toBe(false);
    }
    const normalized = normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100ShiftEnabled: false, stackSt8100FuelWarningEnabled: true });
    expect(normalizeStackSt8100Config(normalized)).toEqual(normalized);
  });
});

describe('Stack threshold display units', () => {
  it('does not persist incomplete or invalid text drafts and accepts complete decimal edits', () => {
    const units = { temperature: 'c', boostPressure: 'bar' } as const;
    for (const draft of ['', ' ', '.', '-', 'NaN', 'Infinity', '0x10', '1e3', '1.2x']) {
      expect(parseStackSt8100ThresholdDraft('stackSt8100BoostWarningBar', draft, units)).toBeNull();
    }
    expect(parseStackSt8100ThresholdDraft('stackSt8100BoostWarningBar', '2.25', units)).toBe(2.25);
    expect(parseStackSt8100ThresholdDraft('stackSt8100BoostWarningBar', '.5', units)).toBe(0.5);
    expect(parseStackSt8100ThresholdDraft('stackSt8100BoostWarningBar', '999', units)).toBe(5);
  });
  it('follows app boost units unless the HUD has explicitly selected independent units', () => {
    expect(resolveStackSt8100BoostUnit({ units: { boostPressure: 'bar' } }, { boostPressure: 'psi' })).toBe('psi');
    expect(resolveStackSt8100BoostUnit({ followAppUnits: false, units: { boostPressure: 'kpa' } }, { boostPressure: 'psi' })).toBe('kpa');
  });

  it('round trips display units without changing canonical C/bar settings', () => {
    for (const temperature of ['c', 'f'] as const) {
      for (const boostPressure of ['bar', 'psi', 'kpa'] as const) {
        const units = { temperature, boostPressure };
        for (const [key, value] of [['stackSt8100TireWarningC', 120], ['stackSt8100BoostWarningBar', 1.5]] as const) {
          expect(stackSt8100ThresholdFromDisplay(key, stackSt8100ThresholdToDisplay(key, value, units), units)).toBeCloseTo(value, 10);
        }
      }
    }
    expect(stackSt8100ThresholdToDisplay('stackSt8100TireWarningC', 120, { temperature: 'f', boostPressure: 'bar' })).toBe(248);
    expect(stackSt8100ThresholdFromDisplay('stackSt8100TireWarningC', -100, { temperature: 'f', boostPressure: 'bar' })).toBe(50);
    expect(stackSt8100ThresholdFromDisplay('stackSt8100BoostWarningBar', 1000, { temperature: 'c', boostPressure: 'kpa' })).toBe(5);
  });
});
