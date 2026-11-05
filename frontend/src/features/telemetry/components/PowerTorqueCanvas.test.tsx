// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import PowerTorqueCanvas from './PowerTorqueCanvas';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({
  useSettings: () => ({ convertPower: (v: number) => ({ value: v / 745.7, label: 'HP' }), convertTorque: (v: number) => ({ value: v * 0.737, label: 'LB-FT' }), t: (s: string) => s }),
}));

type DrawingState = Pick<CanvasRenderingContext2D, 'shadowBlur' | 'shadowColor' | 'strokeStyle' | 'fillStyle' | 'lineWidth' | 'globalAlpha'> & { lineDash: number[] };

it.each([false, true])('restores canvas state through synchronous resize, updates and disposal (flat=%s)', async flat => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const originalStyle = document.documentElement.getAttribute('style');
  document.documentElement.style.setProperty('--instrument-flat', flat ? '1' : '0');
  document.documentElement.style.setProperty('--instrument-glow-strength', '1');
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
    observe() { this.cb([{ contentRect: { width: 300, height: 140 } }]); }
    disconnect() {}
  });

  const stack: DrawingState[] = [];
  let lineDash = [3, 3];
  const mockCtx = {
    shadowBlur: 2, shadowColor: 'rgba(10, 20, 30, 0.4)', strokeStyle: '#112233', fillStyle: '#445566', lineWidth: 5, globalAlpha: 0.9,
    save() { stack.push(snapshot()); },
    restore() {
      const saved = stack.pop();
      if (saved) {
        const { lineDash: savedDash, ...savedStyles } = saved;
        Object.assign(mockCtx, savedStyles);
        lineDash = savedDash;
      }
    },
    setLineDash(segments: number[]) { lineDash = [...segments]; },
    getLineDash() { return [...lineDash]; },
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, strokeRect() {}, fillRect() {},
  };
  function snapshot(): DrawingState {
    const { shadowBlur, shadowColor, strokeStyle, fillStyle, lineWidth, globalAlpha } = mockCtx;
    return { shadowBlur, shadowColor, strokeStyle, fillStyle, lineWidth, globalAlpha, lineDash: mockCtx.getLineDash() };
  }
  const initialState = snapshot();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let mounted = true;
  const update = () => telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: { IsRaceOn: 1, CarOrdinal: 1, CurrentEngineRpm: 5200, PowerWatts: 250000, TorqueNewtons: 400 } }));
  try {
    await act(async () => root.render(<PowerTorqueCanvas />));
    expect(snapshot()).toEqual(initialState);
    await act(async () => { update(); });
    expect(snapshot()).toEqual(initialState);
    await act(async () => root.unmount());
    mounted = false;
    await act(async () => { update(); });
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
