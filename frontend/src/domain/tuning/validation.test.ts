import { describe, expect, it } from 'vitest';
import { createDefaultCapabilityContract } from './contracts';
import { getControlSpec, normalizeControlValue, validateCapabilityContract } from './validation';

const car = {
  adjustability: {
    gearbox: 'FinalDrive',
    gears: 6,
    suspension: 'Sport',
    arb: 'Fixed',
    aero: 'Rear Only',
    brakes: 'Adjustable',
    diff: 'Adjustable'
  },
  spring_front_min: 20,
  spring_front_max: 80,
  spring_rear_min: 18,
  spring_rear_max: 70,
  height_front_min: 10,
  height_front_max: 20,
  height_rear_min: 10,
  height_rear_max: 20
};

describe('tuning capability contract', () => {
  it('represents part locks and unknown game boundaries without inventing steps', () => {
    const contract = createDefaultCapabilityContract(car);
    expect(contract.schemaVersion).toBe('tuning-capabilities/v1');
    expect(contract.gameBuild).toBe('unknown');
    expect(getControlSpec(contract, 'arb', 'front')).toMatchObject({ unlocked: false, min: 'unknown', max: 'unknown', step: 'unknown' });
    expect(getControlSpec(contract, 'gearing', 'finalDrive')).toMatchObject({ unlocked: true, min: 'unknown', max: 'unknown', step: 'unknown' });
    expect(getControlSpec(contract, 'gearing', 'gears')).toMatchObject({ unlocked: false });
    expect(getControlSpec(contract, 'aero', 'front')).toMatchObject({ unlocked: false });
    expect(validateCapabilityContract(contract)).toEqual([]);
  });

  it('clamps known car-specific bounds while preserving unknown-step status', () => {
    const contract = createDefaultCapabilityContract(car);
    const result = normalizeControlValue(contract, 'springs', 'front', 100);
    expect(result).toEqual({ value: 80, editable: true, clamped: true, quantized: false });

    const unknown = normalizeControlValue(contract, 'gearing', 'finalDrive', 4.237);
    expect(unknown).toEqual({ value: 4.237, editable: true, clamped: false, quantized: false, reason: 'unknown-range' });
  });

  it('does not produce a value for locked controls or non-finite input', () => {
    const contract = createDefaultCapabilityContract(car);
    expect(normalizeControlValue(contract, 'arb', 'front', 50)).toMatchObject({ value: undefined, editable: false, reason: 'locked' });
    expect(normalizeControlValue(contract, 'springs', 'front', Number.NaN)).toMatchObject({ value: undefined, editable: true, reason: 'non-finite' });
  });
});
