// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import TireRadar from './TireRadar';
import { TelemetryCardPaintContext, type TelemetryCardPaint } from './TelemetryCardVisibility';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import * as histogramApi from '../../../utils/tireTemperatureHistogram';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
const settings = vi.hoisted(() => ({ celsius: false }));
vi.mock('../../../context/SettingsContext', () => ({
  useSettings: () => ({ convertTemp: (value: number) => ({ value: settings.celsius ? (value - 32) * 5 / 9 : value }) }),
}));

afterEach(() => {
  settings.celsius = false;
  document.documentElement.style.removeProperty('--instrument-linear');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the full tire window while hidden and repaints current units without resampling on reentry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let resize = () => {};
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect() {}
  });
  let width = 180;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(90);
  let visible = true;
  const listeners = new Set<() => void>();
  const paint: TelemetryCardPaint = {
    canPaint: () => visible,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  // A disabled drawing surface rejects all paint attempts. This checks the
  // visibility contract, not low-level canvas operation counts or coordinates.
  const context = new Proxy({}, { get: () => () => { if (!visible) throw new Error('hidden canvas painted'); } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
  const create = vi.spyOn(histogramApi, 'createTireTemperatureHistogram');
  const rebin = vi.spyOn(histogramApi, 'resizeTireTemperatureHistogram');
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const render = (renderCharts = true) => <StrictMode><TelemetryCardPaintContext.Provider value={paint}>
    <TireRadar title="Front Left" isLeft tireIdx={0} renderCharts={renderCharts} />
  </TelemetryCardPaintContext.Provider></StrictMode>;
  const emit = (temp: number, angle: number, car = 1, race = 1) => {
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: {
      IsRaceOn: race, CarOrdinal: car, TireTemp: [temp], TireSlipRatio: [angle / 2], TireSlipAngle: [angle],
    } }));
  };
  const temperature = () => host.querySelector('.telemetry-temperature-label')?.textContent;
  try {
    await act(async () => root.render(render()));
    emit(180, 0.2);
    expect(temperature()).toBe('180');
    const histogram = create.mock.results[create.mock.results.length - 1]!.value as histogramApi.TireTemperatureHistogram;
    visible = false;
    for (let i = 0; i < 1000; i++) emit(i === 999 ? 230 : 200, 1.2);
    expect(temperature()).toBe('180');
    expect(Array.from(histogram.bins).reduce((sum, count) => sum + count, 0)).toBe(900);
    expect(Array.from(histogram.bins).filter(Boolean).sort((a, b) => a - b)).toEqual([1, 899]);

    width = 350;
    resize();
    const history = rebin.mock.calls[rebin.mock.calls.length - 1]![2];
    const sampleTimes = history.map(sample => (sample as { temp: number; time: number }).time);
    expect(history).toHaveLength(900);
    document.documentElement.style.setProperty('--instrument-linear', '1');
    await Promise.resolve();
    settings.celsius = true;
    await act(async () => root.render(render()));
    expect(temperature()).toBe('180');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    visible = true;
    for (const listener of listeners) listener();
    expect(temperature()).toBe('110');
    expect(Array.from(host.querySelectorAll('span')).map(span => span.textContent)).toContain('1.20');
    expect(histogram.bins.length).toBe(histogramApi.tireTemperatureBinCount(width));
    expect(Array.from(histogram.bins).reduce((sum, count) => sum + count, 0)).toBe(900);
    expect(history.map(sample => (sample as { temp: number; time: number }).time)).toEqual(sampleTimes);
    expect(Array.from(host.querySelectorAll('canvas')).every(canvas => canvas.width > 0)).toBe(true);

    visible = false;
    emit(160, 0.1, 2);
    expect(Array.from(histogram.bins).reduce((sum, count) => sum + count, 0)).toBe(1);
    emit(160, 0.1, 2, 0);
    expect(Array.from(histogram.bins).every(count => count === 0)).toBe(true);
    await act(async () => root.render(render(false)));
    emit(170, 0.3, 2);
    expect(Array.from(histogram.bins).every(count => count === 0)).toBe(true);
    await act(async () => root.render(render()));
    emit(190, 0.3, 2);
    expect(Array.from(histogram.bins).reduce((sum, count) => sum + count, 0)).toBe(1);
  } finally {
    await act(async () => root.unmount()); host.remove();
    expect(listeners.size).toBe(0);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  }
});
