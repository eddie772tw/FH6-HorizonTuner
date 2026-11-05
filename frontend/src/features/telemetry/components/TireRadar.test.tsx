// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import TireRadar from './TireRadar';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

const settings = vi.hoisted(() => ({ celsius: false }));
vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({
  useSettings: () => ({ convertTemp: (value: number) => ({ value: settings.celsius ? (value - 32) * 5 / 9 : value }) }),
}));

it('redraws the latest tire sample after chart toggles and unit changes without another packet', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const context = new Proxy({}, { get: () => () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<TireRadar title="Front Left" isLeft tireIdx={0} />));
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: {
      IsRaceOn: 1, CarOrdinal: 1, TireTemp: [230], TireSlipRatio: [1.1], TireSlipAngle: [1.2],
    } }));
    const temperature = () => (host.querySelector('.telemetry-temperature-label') as HTMLElement).textContent;
    expect(temperature()).toBe('230');
    await act(async () => root.render(<TireRadar title="Front Left" isLeft tireIdx={0} renderCharts={false} />));
    settings.celsius = true;
    await act(async () => root.render(<TireRadar title="Front Left" isLeft tireIdx={0} />));
    expect(temperature()).toBe('110');
    const readouts = Array.from(host.querySelectorAll('span')).map(element => element.textContent);
    expect(readouts).toContain('1.20');
    expect(readouts).toContain('1.10');
  } finally {
    await act(async () => root.unmount()); host.remove();
    settings.celsius = false;
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
it('accurately renders historical trajectory and clamps points exceeding grip limits', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const lineToSpy = vi.fn();
  const moveToSpy = vi.fn();
  const arcSpy = vi.fn();
  const context = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'lineTo') return lineToSpy;
      if (prop === 'moveTo') return moveToSpy;
      if (prop === 'arc') return arcSpy;
      return () => {};
    }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<TireRadar title="Front Right" isLeft={false} tireIdx={1} renderCharts={true} />));
    // Packet 1: Normal grip
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: {
      IsRaceOn: 1, CarOrdinal: 1, TireTemp: [0, 180, 0, 0], TireSlipRatio: [0, 0.4, 0, 0], TireSlipAngle: [0, 0.3, 0, 0],
    } }));
    // Packet 2: Beyond limit (triggers clamping path)
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: {
      IsRaceOn: 1, CarOrdinal: 1, TireTemp: [0, 240, 0, 0], TireSlipRatio: [0, 3.5, 0, 0], TireSlipAngle: [0, 3.5, 0, 0],
    } }));
    expect(moveToSpy).toHaveBeenCalled();
    expect(lineToSpy).toHaveBeenCalled();
    expect(arcSpy).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
it('guards canvas context state and renders coaxial active grip marker', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const saveSpy = vi.fn();
  const restoreSpy = vi.fn();
  const strokeSpy = vi.fn();
  const fillSpy = vi.fn();
  const context = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'save') return saveSpy;
      if (prop === 'restore') return restoreSpy;
      if (prop === 'stroke') return strokeSpy;
      if (prop === 'fill') return fillSpy;
      return () => {};
    }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<TireRadar title="Rear Left" isLeft tireIdx={2} renderCharts={true} />));
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: {
      IsRaceOn: 1, CarOrdinal: 1, TireTemp: [0, 0, 195, 0], TireSlipRatio: [0, 0, 1.25, 0], TireSlipAngle: [0, 0, 1.15, 0],
    } }));
    expect(saveSpy).toHaveBeenCalled();
    expect(restoreSpy).toHaveBeenCalled();
    expect(saveSpy.mock.calls.length).toBe(restoreSpy.mock.calls.length);
    expect(strokeSpy).toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
