// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import EngineRpmDisplay from './EngineRpmDisplay';
import { TelemetryCardPaintContext, type TelemetryCardPaint } from './TelemetryCardVisibility';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (s: string) => s,
  convertSpeed: (value: number) => ({ value: value * 3.6, label: 'km/h' }),
}) }));

it('starts neutral, renders explicit reverse and restores the latest hidden gear without another packet', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  let visible = true;
  const listeners = new Set<() => void>();
  const paint: TelemetryCardPaint = {
    canPaint: () => visible,
    subscribe: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
  };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const gear = () => Array.from(host.querySelectorAll('span')).find(span => span.textContent === 'GEAR')?.nextElementSibling?.textContent;
  const emit = (Gear: number) => telemetryEmitter.dispatchEvent(new CustomEvent('update', {
    detail: { Gear, CurrentEngineRpm: 2400, SpeedMetersPerSecond: 15 },
  }));
  try {
    await act(async () => root.render(<TelemetryCardPaintContext.Provider value={paint}><EngineRpmDisplay /></TelemetryCardPaintContext.Provider>));
    expect(gear()).toBe('N');
    emit(0);
    expect(gear()).toBe('R');
    visible = false;
    emit(3);
    expect(gear()).toBe('R');
    visible = true;
    listeners.forEach(listener => listener());
    expect(gear()).toBe('3');
    expect(host.textContent).toContain('2400');
  } finally {
    await act(async () => root.unmount()); host.remove();
    expect(listeners.size).toBe(0);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

it('paints RPM and shift-alert updates without a Path2D runtime', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('Path2D', undefined);
  let resize = () => {};
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: (entries: any[]) => void) {}
    observe(target: Element) {
      resize = () => this.callback([{ target, contentRect: { width: 300, height: 18 } }]);
    }
    disconnect() {}
  });
  const context = new Proxy({}, { get: () => () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<EngineRpmDisplay />));
    resize();
    for (const rpm of [0, 4000, 5800, 6900, 7400, 8000]) {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { CurrentEngineRpm: rpm, EngineMaxRpm: 8000, AccelInput: 127, Gear: 3 },
      }));
      expect(host.textContent).toContain(String(rpm));
    }
    expect(host.querySelector('.badge')?.getAttribute('style')).toContain('opacity: 1');
  } finally {
    await act(async () => root.unmount()); host.remove();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
