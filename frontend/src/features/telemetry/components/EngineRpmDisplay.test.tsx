// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import EngineRpmDisplay from './EngineRpmDisplay';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({
  useSettings: () => ({ convertSpeed: (v: number) => ({ value: v * 3.6, label: 'km/h' }), t: (s: string) => s }),
}));

type DrawingState = Pick<CanvasRenderingContext2D, 'shadowBlur' | 'shadowColor' | 'fillStyle' | 'globalAlpha'>;

it.each([false, true])('guards canvas state across resize, telemetry paints and unmount (flat=%s)', async flat => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const originalStyle = document.documentElement.getAttribute('style');
  document.documentElement.style.setProperty('--instrument-flat', flat ? '1' : '0');
  document.documentElement.style.setProperty('--instrument-glow-strength', '1');
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
    observe() { this.cb([{ contentRect: { width: 320, height: 18 } }]); }
    disconnect() {}
  });

  const stack: DrawingState[] = [];
  const mockCtx = {
    shadowBlur: 3, shadowColor: 'rgba(20, 30, 40, 0.5)', fillStyle: '#123456', globalAlpha: 0.85,
    save() { stack.push(snapshot()); },
    restore() {
      const saved = stack.pop();
      if (saved) Object.assign(mockCtx, saved);
    },
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
  };
  function snapshot(): DrawingState {
    const { shadowBlur, shadowColor, fillStyle, globalAlpha } = mockCtx;
    return { shadowBlur, shadowColor, fillStyle, globalAlpha };
  }
  const initialState = snapshot();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let mounted = true;
  const emitRpm = (rpm: number, alert: boolean) => telemetryEmitter.dispatchEvent(new CustomEvent('update', {
    detail: { IsRaceOn: 1, CurrentEngineRpm: rpm, EngineMaxRpm: 8000, AccelInput: alert ? 127 : 50, Gear: 4, SpeedMetersPerSecond: 28 },
  }));

  try {
    await act(async () => root.render(<EngineRpmDisplay />));
    expect(snapshot()).toEqual(initialState);
    await act(async () => { emitRpm(4200, false); });
    expect(snapshot()).toEqual(initialState);
    await act(async () => { emitRpm(7600, true); });
    expect(snapshot()).toEqual(initialState);
    await act(async () => root.unmount());
    mounted = false;
    await act(async () => { emitRpm(6000, false); });
    expect(snapshot()).toEqual(initialState);
  } finally {
    if (mounted) await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalStyle === null) document.documentElement.removeAttribute('style');
    else document.documentElement.setAttribute('style', originalStyle);
  }
});
