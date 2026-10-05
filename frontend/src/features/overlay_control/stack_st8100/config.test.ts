import { describe, expect, it } from 'vitest';
import { changeStackSt8100AlarmMetric, normalizeStackSt8100Alarms, normalizeStackSt8100Config, STACK_ST8100_ALARM_METRICS,
  STACK_ST8100_DEFAULTS, STACK_ST8100_DIALS, STACK_ST8100_FIELDS, STACK_ST8100_LEGACY_KEYS, type StackSt8100AlarmMetric } from './config';
import { parseStackSt8100ThresholdDraft, resolveStackSt8100DisplayUnits, stackSt8100ThresholdFromDisplay, stackSt8100ThresholdToDisplay } from './units';

const metricUnits = { temperature: 'c', speed: 'kmh', boostPressure: 'bar', power: 'kw', torque: 'nm' } as const;

describe('Stack ST8100 revised configuration boundary', () => {
  it('adds active defaults, preserves unrelated settings, and creates independent three-slot arrays', () => {
    const source = { hudStyle: 'stack_st8100', future: { keep: true }, classicJdmTachStyle: 'defi' };
    const first = normalizeStackSt8100Config(source);
    expect(first).toEqual({ ...source, ...STACK_ST8100_DEFAULTS });
    expect(source).not.toHaveProperty('stackSt8100Dial');
    const alarms = normalizeStackSt8100Alarms(undefined);
    alarms[0].enabled = true;
    expect(normalizeStackSt8100Alarms(undefined)[0].enabled).toBe(false);
    expect(normalizeStackSt8100Config(first)).toEqual(first);
  });

  it('accepts revised fields, black/white faces and all exact range profiles', () => {
    for (const { value } of STACK_ST8100_FIELDS) expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100Field1: value }).stackSt8100Field1).toBe(value);
    for (const value of STACK_ST8100_DIALS) expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100Dial: value }).stackSt8100Dial).toBe(value);
    expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100Face: 'white' }).stackSt8100Face).toBe('white');
    expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100Face: ['white'] }).stackSt8100Face).toBe('black');
  });

  it('migrates fuel in every slot and tire/boost alarms while removing all retired keys', () => {
    const legacy = { hudStyle: 'simple', stackSt8100Field1: 'fuel', stackSt8100Field2: 'fuel', stackSt8100Field3: 'fuel', stackSt8100Field4: 'fuel',
      stackSt8100FuelWarningEnabled: true, stackSt8100FuelWarningPercent: 10, stackSt8100TireWarningEnabled: true,
      stackSt8100TireWarningC: 135, stackSt8100BoostWarningEnabled: true, stackSt8100BoostWarningBar: 2.2, future: 'keep' };
    const result = normalizeStackSt8100Config(legacy);
    expect(result).toMatchObject({ hudStyle: 'simple', stackSt8100Field1: 'race_time', stackSt8100Field2: 'race_time',
      stackSt8100Field3: 'race_time', stackSt8100Field4: 'race_time', future: 'keep', stackSt8100Alarms: [
        { enabled: true, metric: 'tire_max', direction: 'high', threshold: 135 },
        { enabled: true, metric: 'boost', direction: 'high', threshold: 2.2 },
        { enabled: false, metric: 'rpm', direction: 'high', threshold: 7000 },
      ] });
    for (const key of STACK_ST8100_LEGACY_KEYS) expect(result).not.toHaveProperty(key);
    expect(result).not.toHaveProperty('stackSt8100Face');
    const selected = [{ enabled: true, metric: 'brake', direction: 'low', threshold: 20 }];
    expect(normalizeStackSt8100Config({ ...legacy, stackSt8100Alarms: selected }).stackSt8100Alarms[0]).toEqual(selected[0]);
    expect(normalizeStackSt8100Config({ ...legacy, stackSt8100Alarms: null }).stackSt8100Alarms).toEqual(STACK_ST8100_DEFAULTS.stackSt8100Alarms);
  });

  it('does not add absent inactive namespace keys, including fuel-only legacy cleanup', () => {
    const source = { hudStyle: 'vfd', future: ['keep'] };
    expect(normalizeStackSt8100Config(source)).toEqual(source);
    expect(normalizeStackSt8100Config({ ...source, stackSt8100FuelWarningEnabled: true, stackSt8100FuelWarningPercent: 12 })).toEqual(source);
    expect(normalizeStackSt8100Config({ ...source, stackSt8100ShiftPercent: '90' })).toEqual({ ...source, stackSt8100ShiftPercent: 90 });
  });

  it('enforces exactly three strict alarm objects, metric-specific limits and no primitive coercion', () => {
    for (const invalid of [null, true, '120', '', [], {}, NaN, Infinity, -Infinity]) {
      const alarms = normalizeStackSt8100Alarms([{ enabled: 'true', metric: ['speed'], direction: ['low'], threshold: invalid }]);
      expect(alarms).toEqual(STACK_ST8100_DEFAULTS.stackSt8100Alarms);
    }
    expect(normalizeStackSt8100Alarms([[], null, false, { enabled: true }])).toEqual(STACK_ST8100_DEFAULTS.stackSt8100Alarms);
    for (const [metric, spec] of Object.entries(STACK_ST8100_ALARM_METRICS)) {
      const normalized = normalizeStackSt8100Alarms([
        { metric, enabled: true, direction: 'low', threshold: -1e9 },
        { metric, enabled: false, direction: 'high', threshold: 1e9 },
        { metric, threshold: '999' }, { metric, threshold: 10 },
      ]);
      expect(normalized).toHaveLength(3);
      expect(normalized[0]).toEqual({ metric, enabled: true, direction: 'low', threshold: spec.min });
      expect(normalized[1].threshold).toBe(spec.max);
      expect(normalized[2].threshold).toBe(spec.threshold);
    }
    expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100ShiftPercent: 500 }).stackSt8100ShiftPercent).toBe(100);
    expect(normalizeStackSt8100Config({ hudStyle: 'stack_st8100', stackSt8100ShiftEnabled: 'false' }).stackSt8100ShiftEnabled).toBe(true);
  });

  it('metric changes reset incompatible thresholds and disable the changed slot', () => {
    expect(changeStackSt8100AlarmMetric({ metric: 'rpm', enabled: true, direction: 'low', threshold: 8000 }, 'boost'))
      .toEqual({ metric: 'boost', enabled: false, direction: 'low', threshold: 1.5 });
  });
});

describe('Stack canonical alarm units and threshold drafts', () => {
  it('honors global or independent units without coupling the Stack temperature choice', () => {
    const app = { speed: 'mph', boostPressure: 'psi', power: 'hp', torque: 'lbft' } as const;
    expect(resolveStackSt8100DisplayUnits({ units: metricUnits, stackSt8100TemperatureUnit: 'c' }, app)).toEqual({ ...app, temperature: 'c' });
    expect(resolveStackSt8100DisplayUnits({ followAppUnits: false, units: metricUnits, stackSt8100TemperatureUnit: 'f' }, app)).toEqual({ ...metricUnits, temperature: 'f' });
  });

  it('round trips all metrics across every display unit without losing canonical meaning', () => {
    for (const temperature of ['c', 'f'] as const) for (const speed of ['kmh', 'mph'] as const)
      for (const boostPressure of ['bar', 'psi', 'kpa'] as const) for (const power of ['kw', 'hp', 'ps'] as const)
        for (const torque of ['nm', 'lbft'] as const) {
          const units = { temperature, speed, boostPressure, power, torque };
          for (const metric of Object.keys(STACK_ST8100_ALARM_METRICS) as StackSt8100AlarmMetric[]) {
            const value = STACK_ST8100_ALARM_METRICS[metric].threshold;
            expect(stackSt8100ThresholdFromDisplay(metric, stackSt8100ThresholdToDisplay(metric, value, units), units)).toBeCloseTo(value, 8);
          }
        }
    expect(stackSt8100ThresholdToDisplay('tire_max', 120, { ...metricUnits, temperature: 'f' })).toBe(248);
    expect(stackSt8100ThresholdToDisplay('speed', 160.9344, { ...metricUnits, speed: 'mph' })).toBeCloseTo(100);
    expect(stackSt8100ThresholdToDisplay('power', 745.7, { ...metricUnits, power: 'hp' })).toBeCloseTo(1000, 8);
  });

  it('rejects incomplete or nondecimal drafts and clamps only when committing valid input', () => {
    for (const draft of ['', ' ', '.', '-', 'NaN', 'Infinity', '0x10', '1e3', '1.2x']) expect(parseStackSt8100ThresholdDraft('boost', draft, metricUnits)).toBeNull();
    expect(parseStackSt8100ThresholdDraft('boost', '-.5', metricUnits)).toBe(-0.5);
    expect(parseStackSt8100ThresholdDraft('boost', '999', metricUnits)).toBe(10);
    expect(parseStackSt8100ThresholdDraft('shift_percent', '5', metricUnits)).toBe(50);
  });
});
