import { TuningCapabilityContract, TuneControlSpec } from './contracts';

export interface NormalizedControlValue {
  value: number | undefined;
  editable: boolean;
  clamped: boolean;
  quantized: boolean;
  reason?: 'locked' | 'unknown-range' | 'non-finite';
}

function roundToPrecision(value: number, precision: number | 'unknown'): number {
  if (precision === 'unknown') return value;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function findControl(contract: TuningCapabilityContract, section: string, field: string): TuneControlSpec | undefined {
  return contract.controls.find((control) => control.section === section && control.field === field);
}

export function normalizeControlValue(
  contract: TuningCapabilityContract,
  section: string,
  field: string,
  rawValue: number
): NormalizedControlValue {
  const control = findControl(contract, section, field);
  if (!control || !control.unlocked) return { value: undefined, editable: false, clamped: false, quantized: false, reason: 'locked' };
  if (!Number.isFinite(rawValue)) return { value: undefined, editable: true, clamped: false, quantized: false, reason: 'non-finite' };
  if (control.min === 'unknown' || control.max === 'unknown') {
    return { value: rawValue, editable: true, clamped: false, quantized: false, reason: 'unknown-range' };
  }

  let value = Math.min(control.max, Math.max(control.min, rawValue));
  const clamped = value !== rawValue;
  let quantized = false;
  if (typeof control.step === 'number' && control.step > 0) {
    value = control.min + Math.round((value - control.min) / control.step) * control.step;
    value = Math.min(control.max, Math.max(control.min, value));
    quantized = value !== rawValue;
  }
  const rounded = roundToPrecision(value, control.precision);
  return { value: rounded, editable: true, clamped, quantized: quantized || rounded !== value };
}

export function getControlSpec(contract: TuningCapabilityContract, section: string, field: string): TuneControlSpec | undefined {
  return findControl(contract, section, field);
}

export function validateCapabilityContract(contract: TuningCapabilityContract): string[] {
  const errors: string[] = [];
  if (contract.schemaVersion !== 'tuning-capabilities/v1') errors.push('Unsupported capability contract schema.');
  if (contract.controls.length === 0) errors.push('Capability contract must contain at least one control.');
  for (const control of contract.controls) {
    if (!control.section || !control.field) errors.push('Every control requires a section and field.');
    if (control.min !== 'unknown' && control.max !== 'unknown' && control.min > control.max) {
      errors.push(`${control.section}.${control.field} has min greater than max.`);
    }
    if (typeof control.step === 'number' && control.step <= 0) {
      errors.push(`${control.section}.${control.field} must use a positive step.`);
    }
  }
  return errors;
}
