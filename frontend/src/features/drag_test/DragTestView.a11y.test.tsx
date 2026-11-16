// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DragTestView from './DragTestView';
import { backendFetch } from '../../services/backend';

vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s, convertSpeed: (v: number) => ({ value: v * 3.6, label: 'km/h' }) }) }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Box, LineChart: Box, Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null };
});

let host: HTMLDivElement, root: Root, statusValue = 'idle';
const sample = [{ time: 0, SpeedMetersPerSecond: 10, CurrentEngineRpm: 3000, Gear: 1, AccelInput: 255, BrakeInput: 0, TorqueNewtons: 300, PowerWatts: 100000, TireSlipRatio: [0, 0, 0, 0] }];
const analysis = { car_name: 'GT-R', drivetrain: 'AWD', max_gear: 6, max_speed_kmh: 220, duration: 8.5, launch_slip_percent: 5, launch_recommendation: 'ok', shifts: [], shift_recommendations: [], final_drive_recommendation: 'ok', path_valid: true, max_deviation_meters: 0.2, yaw_variance_rad: 0.01, stability_diagnostics: [] };
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  statusValue = 'idle';
  vi.mocked(backendFetch).mockImplementation(async (path) => {
    if (path === '/api/drag/status') return json({ status: statusValue, points_count: 1 });
    if (path === '/api/drag/sessions') return json([{ filename: 'run1.json', timestamp: 1700000000, car_name: 'GT-R', max_speed_kmh: 220 }]);
    if (path === '/api/drag/data' || path === '/api/drag/sessions/run1.json') return json(path === '/api/drag/data' ? sample : { data: sample, analysis });
    return json(analysis);
  });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('exposes keyboard-accessible launch conditions dialog with Escape and close focus restoration', async () => {
  await act(async () => root.render(<DragTestView />));
  const trigger = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'RUN CONDITIONS READY')!;
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await act(async () => trigger.click());
  const dialog = host.querySelector('[role="dialog"]')!;
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
  expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => (host.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('exposes WAI-ARIA chart tabs with keyboard navigation and contextual Delete label', async () => {
  statusValue = 'finished';
  await act(async () => root.render(<DragTestView />));
  await act(async () => {});
  const select = host.querySelector('#drag-test-compare-session') as HTMLSelectElement;
  await act(async () => { select.value = 'run1.json'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('button[aria-label="Delete selected session"]')?.getAttribute('type')).toBe('button');
  const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Telemetry Visualization"] [role="tab"]'));
  expect(tabs.map(t => [t.getAttribute('aria-selected'), t.tabIndex])).toEqual([['true', 0], ['false', -1]]);
  tabs[0].focus();
  await act(async () => tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tabs[1]);
  expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tabs[1].id);
  await act(async () => tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  expect(tabs[0].getAttribute('aria-selected')).toBe('true');
});
