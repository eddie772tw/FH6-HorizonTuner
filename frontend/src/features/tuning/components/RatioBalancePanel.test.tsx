// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RatioBalancePanel } from './RatioBalancePanel';
import type { RatioBalanceDiagnostic, RatioBalanceRequest } from '../ratioBalanceTypes';
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (key: string) => key }) }));
const original: RatioBalanceRequest = { schemaVersion: 'ratio-balance/v1', bounds: { source: 'user-observed',
  finalDrive: { min: 3.5, max: 3.53, step: .01 }, gears: [{ min: 1, max: 6, step: .01 }] } };
const diagnostic: RatioBalanceDiagnostic = { status: 'available', base: { finalDrive: 3.5, gears: [3] },
  legalFinalDrives: [3.5, 3.51, 3.53], selectedFinalDrive: 3.5, totalRatioErrors: [0], totalRatioTolerance: [.0175] };
let root: Root; let host: HTMLDivElement; let current: RatioBalanceRequest | null;
function Harness({ unavailable = false }: { unavailable?: boolean }) {
  const [request, setRequest] = useState<RatioBalanceRequest | null>(original); current = request;
  return <RatioBalancePanel request={request} diagnostic={{ ...diagnostic, ...(unavailable ? { status: 'unavailable', reason: 'Invalid final drive' } : {}) }}
    pending={false} storageError={false} gearCount={1} onChange={setRequest} />;
}
const inputValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('passes an exact .01 FD edit and Reset without computing or replacing baseline gear ratios', async () => {
  await act(async () => root.render(<Harness />));
  const input = [...host.querySelectorAll<HTMLInputElement>('input[type=number]')].find(i => i.id.endsWith('-fd'))!;
  await act(async () => input.focus()); await act(async () => inputValue(input, '3.51')); await act(async () => input.blur());
  expect(current?.candidateFinalDrive).toBe(3.51);
  const reset = [...host.querySelectorAll('button')].find(button => button.textContent === 'Reset to original gearing')!;
  await act(async () => reset.click()); expect(current).toEqual(original);
});
it('uses server legal choices with gaps and remains recoverable after rejected candidate', async () => {
  await act(async () => root.render(<Harness unavailable />));
  const slider = host.querySelector<HTMLInputElement>('input[type=range]')!;
  expect(slider.disabled).toBe(false);
  await act(async () => inputValue(slider, '2'));
  expect(current?.candidateFinalDrive).toBe(3.53);
  expect(host.textContent).toContain('Invalid final drive');
});
it('keeps the edit unchanged on untouched focus/blur', async () => {
  await act(async () => root.render(<Harness />));
  const input = [...host.querySelectorAll<HTMLInputElement>('input[type=number]')].find(i => i.id.endsWith('-fd'))!;
  await act(async () => input.focus()); await act(async () => input.blur()); expect(current).toEqual(original);
});
