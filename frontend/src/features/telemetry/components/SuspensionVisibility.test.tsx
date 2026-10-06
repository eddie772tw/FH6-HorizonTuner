// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import SuspensionBar from './SuspensionBar';
import TelemetryCardShell from './TelemetryCardShell';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { createSuspensionTraceHistory, type SuspensionTraceHistory } from '../suspensionTrace';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));
vi.mock('../suspensionTrace', async importOriginal => {
  const original = await importOriginal<typeof import('../suspensionTrace')>();
  return { ...original, createSuspensionTraceHistory: vi.fn(original.createSuspensionTraceHistory) };
});

it('continues suspension history and min/max while hidden, then paints the retained current value at current DPR', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let visibility: IntersectionObserverCallback = () => undefined;
  let target: Element;
  let resize: ResizeObserverCallback = () => undefined;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { visibility = callback; }
    observe(element: Element) { target = element; }
    disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now += 20);
  const sample = (travel: number) => telemetryEmitter.dispatchEvent(new CustomEvent('update', {
    detail: { IsRaceOn: 1, CarOrdinal: 1, NormalizedSuspensionTravel: [travel, 0, 0, 0] },
  }));
  const visible = (isIntersecting: boolean) => visibility([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  const resizeTo = (width: number, height: number) => resize([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver);
  try {
    await act(async () => root.render(<TelemetryCardShell id="suspension" title="Suspension" expanded={false}
      gridColumn="1" onClose={() => undefined} closeLabel="Close"><SuspensionBar title="Front Left" isLeft tireIdx={0} /></TelemetryCardShell>));
    const results = vi.mocked(createSuspensionTraceHistory).mock.results;
    const history = results[results.length - 1].value as SuspensionTraceHistory;
    const canvas = host.querySelector('canvas')!;
    const readout = host.querySelector('.fs-7 span')!;
    const size = { width: 180, height: 45 };
    resizeTo(size.width, size.height);
    sample(0.4);
    expect(readout.textContent).toBe('0.40');
    visible(false);
    context.mockImplementation(() => { throw new Error('A hidden card must not enter the Canvas renderer'); });
    sample(0.8);
    sample(0.2);
    const retainedSamples = history.samples.slice(0, history.size).map(sample => ({ ...sample }));
    expect(retainedSamples.map(sample => sample.travel)).toEqual([0.4, 0.8, 0.2]);
    expect(readout.textContent).toBe('0.40');
    vi.stubGlobal('devicePixelRatio', 2);
    resizeTo(size.width * 2, size.height);
    document.documentElement.style.setProperty('--instrument-linear', '1');
    await Promise.resolve();
    context.mockReturnValue(null);
    visible(true);
    expect(readout.textContent).toBe('0.20');
    expect(host.textContent).toContain('Max: 0.80');
    expect(history.samples.slice(0, history.size)).toEqual(retainedSamples);
    expect(canvas.width).toBe(size.width * 2 * window.devicePixelRatio);
    expect(canvas.height).toBe(size.height * window.devicePixelRatio);
  } finally {
    await act(async () => root.unmount()); host.remove();
    document.documentElement.style.removeProperty('--instrument-linear');
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
