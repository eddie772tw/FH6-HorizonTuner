// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const hudPaused = vi.fn(() => true);
vi.mock('@platform/hud', () => ({ useHudTelemetryPaused: () => hudPaused() }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: { IsRaceOn: 1 }, isConnected: true }), telemetryEmitter: new EventTarget() }));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => ({ carName: 'Nissan GT-R' }) }));
vi.mock('../../context/SettingsContext', () => ({
  ScopedUnitSettingsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSettings: () => ({
    t: (s: string) => s,
    settings: { units: { speed: 'kmh', weight: 'kg', temperature: 'C', tirePressure: 'bar', boostPressure: 'bar', springRate: 'kgfmm', rideHeight: 'cm', suspensionForce: 'kgf', power: 'kw', torque: 'nm' } },
  }),
}));
vi.mock('./components/TelemetryCardShell', () => ({ default: () => null }));

import TelemetryView from './TelemetryView';

let host: HTMLDivElement, root: Root;
const renderView = async () => act(async () => root.render(<TelemetryView />));
const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
const popover = () => host.querySelector<HTMLElement>('.popover[role="dialog"]');

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  hudPaused.mockReturnValue(true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('exposes an accessible non-modal dialog popover with Escape, outside dismiss, and focus restoration', async () => {
  await renderView();
  const btn = trigger()!;
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
  const dlg = popover()!;
  expect(btn.getAttribute('aria-controls')).toBe(dlg.id);
  expect(document.getElementById(dlg.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('HUD Overlay Active');
  expect(document.getElementById(dlg.getAttribute('aria-describedby') ?? '')?.textContent).toContain('HUD Overlay is active');
  expect(dlg.style.minWidth).toBe('');
  expect(dlg.style.width).toMatch(/^min\(320px,.*100vw.*\)$/);

  await act(async () => dlg.querySelector<HTMLButtonElement>('button.btn-close')!.click());
  expect(popover()).toBeNull();
  expect(btn.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(btn);
  await act(async () => btn.click());
  popover()!.querySelector<HTMLButtonElement>('button.btn-close')!.focus();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(popover()).toBeNull();
  expect(document.activeElement).toBe(btn);
  await act(async () => btn.click());
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(popover()).toBeNull();
});

it('defers Escape to active modal drawers and renders non-interactive status when HUD is unpaused', async () => {
  await renderView();
  const unitsBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Telemetry Units')!;
  await act(async () => unitsBtn.click());
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(popover()).not.toBeNull();
  hudPaused.mockReturnValue(false);
  await renderView();
  expect(trigger()).toBeNull();
  expect(popover()).toBeNull();
});
