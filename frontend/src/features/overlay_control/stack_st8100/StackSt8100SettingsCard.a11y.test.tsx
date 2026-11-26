// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { STACK_ST8100_DEFAULTS } from './config';
import { StackSt8100SettingsCard } from './StackSt8100SettingsCard';
import { StackSt8100ThresholdInput } from './StackSt8100ThresholdInput';

const t = (s: string) => s;
const UNITS = { speed: 'kmh', boostPressure: 'bar', torque: 'nm', power: 'hp', temperature: 'C' } as const;
const ST_UNITS = { ...UNITS, temperature: 'c' } as const;
const setInput = (el: HTMLInputElement, val: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const key = (el: Element, k: string, opts: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(e); return e.defaultPrevented;
};
let host: HTMLDivElement, root: Root;
const render = (ui: ReactNode) => act(async () => root.render(ui));
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('disambiguates switches and binds guidance descriptions in StackSt8100SettingsCard', async () => {
  const alarms = [{ enabled: true, metric: 'tire_max', direction: 'high', threshold: 120 }, { enabled: false, metric: 'boost', direction: 'high', threshold: 1.5 }, { enabled: false, metric: 'rpm', direction: 'high', threshold: 7000 }] as const;
  await render(<StackSt8100SettingsCard config={{ ...STACK_ST8100_DEFAULTS, followAppUnits: true, units: UNITS, stackSt8100Alarms: [...alarms] }} appUnits={UNITS} onChange={vi.fn()} t={t} />);
  const switches = Array.from(host.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
  expect(switches.map(el => el.getAttribute('aria-checked'))).toEqual(['true', 'true', 'false', 'false']);
  const labels = switches.map(el => host.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`)!);
  expect(labels.every(l => l.style.cursor === 'pointer')).toBe(true);
  expect(labels.map(l => l.textContent)).toEqual(['Enabled (Shift light)', 'Enabled (Alarm 1)', 'Enabled (Alarm 2)', 'Enabled (Alarm 3)']);
  const lcdFs = Array.from(host.querySelectorAll('fieldset')).find(fs => fs.querySelector('legend')?.textContent === 'Live LCD fields')!;
  expect(document.getElementById(lcdFs.getAttribute('aria-describedby') ?? '')?.textContent).toContain('HUD Unit Settings');
  const metricSelects = Array.from(host.querySelectorAll('select[id$="-metric"]'));
  expect(metricSelects).toHaveLength(3);
  metricSelects.forEach(s => expect(document.getElementById(s.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Changing an alarm metric resets'));
});

it('validates StackSt8100ThresholdInput post-edit, protects IME/tabs, and reverts on Escape', async () => {
  const onChange = vi.fn();
  await render(<div className="hud-workspace"><button type="button" role="tab">Tab</button><StackSt8100ThresholdInput id="shift" metric="shift_percent" value={90} units={ST_UNITS} onChange={onChange} t={t} /></div>);
  const input = host.querySelector<HTMLInputElement>('#shift')!, unitAddon = host.querySelector('.input-group-text')!;
  const hint = document.getElementById(input.getAttribute('aria-describedby') ?? '')!;
  expect([input.getAttribute('aria-invalid'), unitAddon.getAttribute('aria-hidden'), hint.className]).toEqual(['false', 'true', 'visually-hidden']);
  await act(async () => { input.focus(); expect(key(input, 'Escape')).toBe(false); setInput(input, '150'); });
  expect([input.getAttribute('aria-invalid'), input.className.includes('border-danger text-danger-emphasis'), hint.className.includes('text-danger-emphasis'), hint.textContent]).toEqual(['true', true, true, 'Range: 50–100 % max RPM']);
  await act(async () => setInput(input, 'abc'));
  expect(input.getAttribute('aria-invalid')).toBe('true');
  await act(async () => expect(key(input, 'Escape')).toBe(true));
  expect([input.value, input.getAttribute('aria-invalid'), hint.className]).toEqual(['90', 'false', 'visually-hidden']);
  await act(async () => input.blur());
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => { input.focus(); setInput(input, '95'); key(input, 'Enter', { isComposing: true }); host.querySelector<HTMLElement>('[role="tab"]')!.focus(); });
  expect([input.value, onChange.mock.calls.length]).toEqual(['95', 0]);
  await act(async () => { input.focus(); setInput(input, '150'); key(input, 'Enter'); });
  expect(onChange).toHaveBeenCalledWith(100);
  expect(input.value).toBe('100');
});
