import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { normalizeStackSt8100Config, STACK_ST8100_ALARM_METRICS } from './config';

const sandbox: { StackConfig?: { normalize: (input: object) => object } } = {};
vm.runInNewContext(readFileSync(new URL('../../../../../hud_overlay/stack_st8100/stack-config.js', import.meta.url), 'utf8'), sandbox);
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('Stack GUI and standalone HUD persisted behavior parity', () => {
  it('agrees on active/inactive defaults, legacy migration, strict malformed input and metric-specific limits', () => {
    const cases = [
      { hudStyle: 'stack_st8100' }, { hudStyle: 'simple', future: { preserve: true } },
      { hudStyle: 'vfd', stackSt8100FuelWarningEnabled: true },
      { hudStyle: 'simple', stackSt8100Field1: 'fuel', stackSt8100Field2: 'fuel', stackSt8100Field3: 'fuel', stackSt8100Field4: 'fuel' },
      { hudStyle: 'simple', stackSt8100TireWarningEnabled: true, stackSt8100TireWarningC: 135, stackSt8100BoostWarningEnabled: true, stackSt8100BoostWarningBar: 2.2 },
      { hudStyle: 'stack_st8100', stackSt8100Face: 'white', stackSt8100Dial: '0-3-10.5' },
      { hudStyle: 'stack_st8100', stackSt8100Face: ['white'], stackSt8100Dial: {}, stackSt8100ShiftPercent: Infinity },
      { hudStyle: 'stack_st8100', stackSt8100TireWarningEnabled: true, stackSt8100Alarms: null },
      { hudStyle: 'stack_st8100', stackSt8100Alarms: [{ enabled: 'true', metric: ['speed'], threshold: '5', direction: ['low'] }, [], null, { enabled: true }] },
      ...Object.keys(STACK_ST8100_ALARM_METRICS).map(metric => ({ hudStyle: 'stack_st8100', stackSt8100Alarms: [
        { enabled: true, metric, direction: 'low', threshold: -1e9 }, { metric, threshold: 1e9 }, { metric, threshold: NaN },
      ] })),
    ];
    for (const input of cases) {
      const normalized = normalizeStackSt8100Config(input);
      expect(plain(sandbox.StackConfig!.normalize(input))).toEqual(plain(normalized));
      expect(normalizeStackSt8100Config(normalized)).toEqual(normalized);
    }
  });
});
