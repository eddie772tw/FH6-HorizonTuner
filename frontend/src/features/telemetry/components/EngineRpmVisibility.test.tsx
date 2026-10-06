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
