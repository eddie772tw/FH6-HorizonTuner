// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@platform/hud', () => ({ useHudTelemetryPaused: () => false }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: { IsRaceOn: 1 }, isConnected: true }), telemetryEmitter: new EventTarget() }));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => ({ carName: 'Nissan GT-R' }) }));
vi.mock('../../context/SettingsContext', () => ({ ScopedUnitSettingsProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useSettings: () => ({ t: (s: string) => s, settings: { units: { speed: 'kmh', weight: 'kg', temperature: 'C', tirePressure: 'bar', boostPressure: 'bar', springRate: 'kgfmm', rideHeight: 'cm', suspensionForce: 'kgf', power: 'kw', torque: 'nm' } } }) }));
vi.mock('./components/TelemetryCardShell', () => ({ default: ({ title, renderSwitch, expandLabel }: { title: string; renderSwitch?: ReactNode; expandLabel?: string }) => <section className="telemetry-card-shell" aria-label={title}>{renderSwitch}{expandLabel && <button type="button" aria-label={expandLabel}>{expandLabel}</button>}</section> }));
import TelemetryView from './TelemetryView';
import RenderSwitch from './components/RenderSwitch';
import { UnitSettingsSidebar } from '../../components/UnitSettingsSidebar';

let host: HTMLDivElement, root: Root;
const render = (node: ReactNode) => act(async () => root.render(node));
const esc = (target: EventTarget = document) => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); target.dispatchEvent(e); return e; };

beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('exposes distinct card labels, pressed states, and unit drawer ARIA semantics', async () => {
  await render(<TelemetryView />);
  const cards = ['Live Telemetry Traces', 'Vehicle Dynamics Overview', 'Tire Grip & Status', 'Suspension Travel'];
  const switches = Array.from(host.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
  expect(switches.map(el => el.getAttribute('aria-label'))).toEqual(cards.map(c => `Toggle chart rendering for this section: ${c}`));
  expect(switches.every(el => el.getAttribute('aria-checked') === 'true' && !el.hasAttribute('aria-describedby'))).toBe(true);
  expect(Array.from(host.querySelectorAll('button[aria-label^="Expand card"]')).map(b => b.getAttribute('aria-label'))).toEqual(cards.map(c => `Expand card: ${c}`));
  const [rel, abs] = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="group"] button'));
  expect([rel.getAttribute('aria-pressed'), abs.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
  await act(async () => abs.click());
  expect([rel.getAttribute('aria-pressed'), abs.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
  const unitsBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Telemetry Units')!;
  const dlg = document.getElementById('telemetry-units-dialog')!;
  expect([unitsBtn.getAttribute('aria-controls'), unitsBtn.getAttribute('aria-expanded'), dlg.getAttribute('aria-hidden'), dlg.hasAttribute('inert'), dlg.previousElementSibling?.getAttribute('aria-hidden')]).toEqual(['telemetry-units-dialog', 'false', 'true', true, 'true']);
  await act(async () => unitsBtn.click());
  expect([unitsBtn.getAttribute('aria-expanded'), dlg.getAttribute('aria-hidden'), dlg.hasAttribute('inert'), dlg.style.transition, dlg.getAttribute('aria-describedby')]).toEqual(['true', 'false', false, '', 'telemetry-units-description']);
  const follow = document.getElementById('telemetry-units-follow-global') as HTMLInputElement;
  expect([follow.getAttribute('role'), follow.getAttribute('aria-checked'), follow.getAttribute('aria-describedby'), dlg.querySelector('fieldset')?.getAttribute('aria-describedby')]).toEqual(['switch', 'true', 'telemetry-units-description', 'telemetry-units-description']);
});

it('handles RenderSwitch alignment/Escape containment and UnitSettingsSidebar focus return', async () => {
  const onEscModal = vi.fn();
  const Harness = () => {
    const [open, setOpen] = useState(false);
    return <><button type="button" onClick={() => setOpen(true)}>Units</button>
      <div className="telemetry-card-shell" role={open ? undefined : 'dialog'} aria-modal={open ? undefined : true} onKeyDown={e => { if (e.key === 'Escape') onEscModal(); }}><RenderSwitch checked onChange={vi.fn()} sectionLabel="Traces" /></div>
      <UnitSettingsSidebar idPrefix="test-units" show={open} title="Units" onClose={() => setOpen(false)} preference={{ followGlobal: true, general: 'metric', power: 'hp', spring: 'kgfmm' }} onChange={vi.fn()} /></>;
  };
  await render(<Harness />);
  const sw = host.querySelector<HTMLInputElement>('input[role="switch"]')!;
  vi.spyOn(host.querySelector('.telemetry-card-shell')!, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 300 } as DOMRect);
  vi.spyOn(sw.closest('.position-relative')!, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 60 } as DOMRect);
  await act(async () => sw.focus());
  expect(host.querySelector('[role="tooltip"]')!.parentElement!.style.left).toBe('0px');
  expect(host.querySelector('[role="tooltip"]')!.className).not.toMatch(/pointer-events-none|text-nowrap/);
  await act(async () => { esc(sw); });
  expect([host.querySelector('[role="tooltip"]'), onEscModal.mock.calls.length]).toEqual([null, 0]);
  await act(async () => { esc(sw); });
  expect(onEscModal).toHaveBeenCalledOnce();
  const trigger = host.querySelector('button')!;
  await act(async () => { trigger.focus(); trigger.click(); });
  await act(async () => { sw.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
  await act(async () => { esc(document); });
  expect([Boolean(host.querySelector('[role="tooltip"]')), document.activeElement === trigger]).toEqual([true, true]);
});
