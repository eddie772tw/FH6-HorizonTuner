// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import { TimeTrialRoutePanel } from './TimeTrialRoutePanel';
import { RoamingRoutePanel } from './RoamingRoutePanel';

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
