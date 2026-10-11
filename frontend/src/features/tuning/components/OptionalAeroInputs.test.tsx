// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OptionalAeroInputs } from './OptionalAeroInputs';
import { ChassisCalculationStatus } from './ChassisCalculationStatus';
import { updateWorkflowProfile } from '../tuningWorkflow';
import type { CarParams } from '../../../context/CarParamsContext';
import type { ChassisDiagnostics } from '../../../domain/tuning/types';

let imperial = false;
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (key: string) => key,
  convertForce: (v: number) => ({ value: imperial ? v * 2.20462 : v, label: imperial ? 'lbf' : 'kgf' }),
  convertForceToKgf: (v: number) => imperial ? v / 2.20462 : v,
}) }));
let root: Root; let host: HTMLDivElement; let draft: CarParams;
function Editor() {
  const [value, setValue] = useState({ aero_downforce_front: null, aero_downforce_rear: null, aeroBalance: null } as CarParams);
  draft = value;
  return <OptionalAeroInputs value={value} onChange={(key, next) => setValue(updateWorkflowProfile(value, key, next)!)} />;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); imperial = false;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function enter(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#optional-aero-${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('distinguishes blank, zero, one load and both loads without writing a derived force', async () => {
  await act(async () => root.render(<Editor />));
  expect(host.querySelector('#optional-aero-balance')).toBeNull();
  await enter('front', '0');
  expect(draft.aero_downforce_front).toBe(0);
  expect(draft.aeroInputVersion).toBe('optional/v1');
  expect(host.querySelector('#optional-aero-balance')).not.toBeNull();
  await enter('balance', '40');
  expect(draft.aeroBalance).toBe(.4);
  expect(draft.aero_downforce_rear).toBeNull();
  await enter('rear', '150');
  expect(host.querySelector('#optional-aero-balance')).toBeNull();
  await enter('front', ''); await enter('rear', '');
  expect(draft.aero_downforce_front).toBeNull(); expect(draft.aero_downforce_rear).toBeNull();
  expect(host.querySelector('#optional-aero-balance')).toBeNull();
  // Saving JSON retains explicit clear operations.
  expect(JSON.parse(JSON.stringify(draft)).aero_downforce_front).toBeNull();
});
it('converts display units once and forwards invalid values for Rust qualification', async () => {
  imperial = true; await act(async () => root.render(<Editor />));
  await enter('front', '220.462'); expect(draft.aero_downforce_front).toBeCloseTo(100);
  await enter('balance', '101'); expect(draft.aeroBalance).toBe(1.01);
  await enter('front', '-22.0462'); expect(draft.aero_downforce_front).toBeCloseTo(-10);
  await enter('balance', ''); expect(draft.aeroBalance).toBeNull();
});
it('presents unavailable and saturation diagnostics from the authoritative result', async () => {
  const diagnostics = { available: false, reasons: ['aero-balance-required'], aero: { source: 'unavailable', front: null, rear: null }, axles: [] } as unknown as ChassisDiagnostics;
  await act(async () => root.render(<ChassisCalculationStatus diagnostics={diagnostics} />));
  expect(host.textContent).toContain('Enter front aero balance when only one axle load is provided');
  await act(async () => root.render(<ChassisCalculationStatus diagnostics={{ ...diagnostics, available: true, reasons: [], aero: { source: 'derived-rear', front: 100, rear: 150, reason: null }, axles: [{ axle: 'rear', aeroLimited: true }] as ChassisDiagnostics['axles'] }} />));
  expect(host.textContent).toContain('100 kgf / 150 kgf');
  expect(host.textContent).toContain('inputs remain unchanged');
  expect(host.textContent).toContain('support is not guaranteed');
});
