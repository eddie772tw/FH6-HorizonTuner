// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import ToastContainer from '../../components/common/ToastContainer';
import { TimeTrialRoutePanel } from './TimeTrialRoutePanel';
import { RoamingRoutePanel } from './RoamingRoutePanel';

vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));

let host: HTMLDivElement, root: Root;
const baseProps = {
  routes: [],
  selectedRouteId: null,
  isArmed: false,
  isRecording: false,
  armedRouteId: null,
  liveTelemetry: null,
  onSelectRoute: vi.fn(),
  onSaveRoute: vi.fn(async () => true),
  onDeleteRoute: vi.fn(async () => true),
  onArmRoute: vi.fn(async () => true),
  onDisarmRoute: vi.fn(async () => true),
  onImportRoutes: vi.fn(async () => undefined),
  onExportRoute: vi.fn(),
  t: (text: string) => text,
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function assertLabelsBound(container: HTMLElement, expectedCount: number) {
  const labels = Array.from(container.querySelectorAll('label'));
  expect(labels).toHaveLength(expectedCount);
  const ids = labels.map((label) => {
    const htmlFor = label.getAttribute('for');
    expect(htmlFor).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(htmlFor!)}`)).not.toBeNull();
    return htmlFor!;
  });
  expect(new Set(ids).size).toBe(expectedCount);
}

it('associates all TimeTrialRoutePanel labels, gate group, and slider aria-valuetext', async () => {
  await act(async () => root.render(<ToastProvider><TimeTrialRoutePanel {...baseProps} /></ToastProvider>));
  assertLabelsBound(host, 6);
  const group = host.querySelector('[role="group"]')!;
  expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).toContain('Timing Gate');
  expect(host.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe('15.0 m');
});

it('disambiguates RoamingRoutePanel Start/Finish gate groups, labels, capture buttons, and sliders', async () => {
  await act(async () => root.render(<ToastProvider><RoamingRoutePanel {...baseProps} /></ToastProvider>));
  assertLabelsBound(host, 10);
  const groups = Array.from(host.querySelectorAll('[role="group"]'));
  expect(groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent)).toEqual([
    'Start Gate (Departure)',
    'Finish Gate (Arrival)',
  ]);
  const captureLabels = Array.from(host.querySelectorAll('button'))
    .filter((b) => b.textContent === 'Capture Live')
    .map((b) => b.getAttribute('aria-label'));
  expect(captureLabels).toEqual(['Capture Live - Start Gate (Departure)', 'Capture Live - Finish Gate (Arrival)']);
  const sliders = Array.from(host.querySelectorAll('input[type="range"]'));
  expect(sliders.map((s) => s.getAttribute('aria-valuetext'))).toEqual(['15.0 m', '15.0 m']);
});

it('confirms TimeTrialRoutePanel deletion inline with Escape, busy guard, toasts, and focus restoration', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  let finish!: (ok: boolean) => void;
  const onDeleteRoute = vi.fn(() => new Promise<boolean>((r) => { finish = r; }));
  const route = { route_id: 'tt1', name: 'Goliath Sprint', mode: 'time_trial' as const, start_x: 0, start_y: 0, start_z: 0, start_radius: 15 };
  const renderPanel = (selectedRouteId: string | null) => act(async () => root.render(
    <ToastProvider><ToastContainer /><TimeTrialRoutePanel {...baseProps} routes={[route]} selectedRouteId={selectedRouteId} onDeleteRoute={onDeleteRoute} /></ToastProvider>,
  ));
  await renderPanel('tt1');
  const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="Delete Goliath Sprint"]')!;
  await act(async () => trigger().click());
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(onDeleteRoute).not.toHaveBeenCalled();
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  expect(trigger().disabled).toBe(true);
  const group = document.getElementById(trigger().getAttribute('aria-controls')!)!;
  expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).toContain('Goliath Sprint');
  const cancelBtn = Array.from(group.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!;
  expect(document.activeElement).toBe(cancelBtn);

  const outside = document.createElement('button'); document.body.append(outside); outside.focus();
  const outsideEsc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => outside.dispatchEvent(outsideEsc));
  expect(outsideEsc.defaultPrevented).toBe(false); expect(document.getElementById(group.id)).not.toBeNull(); outside.remove();
  await act(async () => cancelBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(trigger().getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(trigger());

  await act(async () => trigger().click());
  const confirmBtn = () => host.querySelector<HTMLButtonElement>('[role="group"] button.btn-danger')!;
  await act(async () => confirmBtn().click());
  expect(confirmBtn().getAttribute('aria-busy')).toBe('true');
  await act(async () => confirmBtn().click());
  expect(onDeleteRoute).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Failed to delete route.');
  expect(document.activeElement).toBe(trigger());

  await act(async () => trigger().click()); await act(async () => confirmBtn().click());
  await renderPanel(null); await act(async () => finish(true));
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Route deleted.');
  expect(document.activeElement).toBe(host.querySelector('select'));
});

it('confirms RoamingRoutePanel deletion inline and preserves focus when switching routes mid-delete', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  let finish!: (ok: boolean) => void;
  const onDeleteRoute = vi.fn(() => new Promise<boolean>((r) => { finish = r; }));
  const routes = [
    { route_id: 'r1', name: 'Mountain Pass', mode: 'roaming' as const, start_x: 0, start_y: 0, start_z: 0, start_radius: 15, end_x: 100, end_y: 0, end_z: 0, end_radius: 15 },
    { route_id: 'r2', name: 'Coastal Run', mode: 'roaming' as const, start_x: 10, start_y: 0, start_z: 0, start_radius: 15, end_x: 200, end_y: 0, end_z: 0, end_radius: 15 },
  ];
  const renderPanel = (selectedRouteId: string | null) => act(async () => root.render(
    <ToastProvider><ToastContainer /><RoamingRoutePanel {...baseProps} routes={routes} selectedRouteId={selectedRouteId} onDeleteRoute={onDeleteRoute} /></ToastProvider>,
  ));
  await renderPanel('r1');
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Delete Mountain Pass"]')!.click());
  expect(confirmSpy).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>('[role="group"] button.btn-danger')!.click());
  const select = host.querySelector<HTMLSelectElement>('select')!;
  select.focus(); await renderPanel('r2');
  await act(async () => finish(true));
  expect(document.activeElement).toBe(select);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Route deleted.');
});
