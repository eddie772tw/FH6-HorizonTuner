// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HudRange, HudSwitch } from './HudSettingsControls';
import { HudTextInput } from './HudTextInput';
import { HudUnitSettings } from './HudUnitSettings';

const t = (s: string) => s;
const UNITS = { speed: 'kmh', boostPressure: 'bar', torque: 'nm', power: 'hp', temperature: 'C' } as const;
const setInput = (el: HTMLInputElement, val: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const esc = (el: Element) => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
let host: HTMLDivElement, root: Root;
const render = (ui: ReactNode) => act(async () => root.render(ui));
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('exposes switch semantics and disabled feedback on HudSwitch', async () => {
  await render(<HudSwitch label="Show main gauge" checked={true} disabled={true} onChange={vi.fn()} />);
  const sw = host.querySelector<HTMLInputElement>('input[role="switch"]')!, label = host.querySelector('label')!;
  expect(sw.id).toBeTruthy();
  expect(label.getAttribute('for')).toBe(sw.id);
  expect(sw.getAttribute('aria-checked')).toBe('true');
  expect(label.classList.contains('opacity-75')).toBe(true);
  expect(label.style.cursor).toBe('not-allowed');
});

it('validates HudRange numeric input after edit and restores on Escape or empty blur', async () => {
  const onChange = vi.fn();
  await render(<div className="hud-workspace"><button type="button" role="tab">Tab</button><HudRange label="Glow Intensity" value={1} min={0} max={2} step={0.05} percent numericInput onChange={onChange} /><HudRange label="Offset" value={0} min={-500} max={500} step={5} onChange={vi.fn()} /></div>);
  const [slider, offsetSlider] = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="range"]'));
  expect([slider.getAttribute('aria-valuetext'), offsetSlider.getAttribute('aria-valuetext')]).toEqual(['100%', '0 px']);
  const num = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect([num.getAttribute('aria-label'), num.getAttribute('aria-invalid'), num.hasAttribute('aria-describedby')]).toEqual(['Glow Intensity (%)', 'false', false]);
  await act(async () => { num.focus(); expect(esc(num)).toBe(false); setInput(num, '350'); });
  expect([num.getAttribute('aria-invalid'), num.className.includes('border-danger text-danger-emphasis')]).toEqual(['true', true]);
  expect(document.getElementById(num.getAttribute('aria-describedby') ?? '')?.textContent).toBe('0% – 200%');
  await act(async () => expect(esc(num)).toBe(true));
  expect([num.value, num.getAttribute('aria-invalid'), onChange.mock.calls.length]).toEqual(['100', 'false', 0]);
  await act(async () => setInput(num, ''));
  expect(num.getAttribute('aria-invalid')).toBe('true');
  await act(async () => num.blur());
  expect([num.value, onChange.mock.calls.length]).toEqual(['100', 0]);
  await act(async () => { num.focus(); setInput(num, '140'); host.querySelector<HTMLElement>('[role="tab"]')!.focus(); });
  expect([num.value, onChange.mock.calls.length]).toEqual(['140', 0]);
  await act(async () => { num.focus(); setInput(num, '350'); num.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(onChange).toHaveBeenCalledWith(2);
  expect(num.value).toBe('200');
});

it('hardens HudUnitSettings switch/fieldset semantics and HudTextInput Escape revert', async () => {
  const onCommit = vi.fn();
  const renderPair = (follow: boolean) => render(<><HudUnitSettings followGlobal={follow} units={UNITS} globalUnits={UNITS} onConfigPatch={vi.fn()} t={t} /><HudTextInput id="txt" value="Boost" onCommit={onCommit} /></>);
  await renderPair(true);
  const sw = host.querySelector<HTMLInputElement>('input[role="switch"]')!, fs = host.querySelector('fieldset')!, txt = host.querySelector<HTMLInputElement>('#txt')!;
  expect([sw.getAttribute('aria-checked'), fs.style.opacity, fs.querySelector('legend.visually-hidden')?.textContent]).toEqual(['true', '0.65', 'HUD Unit Settings']);
  expect(document.getElementById(sw.getAttribute('aria-describedby') ?? '')?.textContent).toContain('HUD display units');
  expect(fs.getAttribute('aria-describedby')).toBe(sw.getAttribute('aria-describedby'));
  await renderPair(false);
  expect([fs.style.opacity, fs.hasAttribute('aria-describedby')]).toEqual(['1', false]);
  await act(async () => { txt.focus(); expect(esc(txt)).toBe(false); setInput(txt, 'Oil Temp'); expect(esc(txt)).toBe(true); });
  expect(txt.value).toBe('Boost');
  await act(async () => txt.blur());
  expect(onCommit).not.toHaveBeenCalled();
});
