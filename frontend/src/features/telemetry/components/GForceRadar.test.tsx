// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import GForceRadar from './GForceRadar';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));

type DrawingState = Pick<CanvasRenderingContext2D, 'shadowBlur' | 'shadowColor' | 'strokeStyle' | 'fillStyle' | 'lineWidth' | 'globalAlpha'>;

it.each([false, true])('restores canvas state through resize, markers drawing, and disposal (flat=%s)', async flat => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const originalStyle = document.documentElement.getAttribute('style');
  document.documentElement.style.setProperty('--instrument-flat', flat ? '1' : '0');
  document.documentElement.style.setProperty('--instrument-glow-strength', '1');

  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
    observe() { this.cb([{ contentRect: { width: 170, height: 170 } }]); }
    disconnect() {}
  });

  const stack: DrawingState[] = [];
  const mockCtx = {
    shadowBlur: 2, shadowColor: 'rgba(10, 20, 30, 0.4)', strokeStyle: '#112233', fillStyle: '#445566', lineWidth: 5, globalAlpha: 0.9,
    save() { stack.push(snapshot()); },
    restore() {
      const saved = stack.pop();
      if (saved) Object.assign(mockCtx, saved);
    },
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, strokeRect() {}, fillRect() {},
  };
  function snapshot(): DrawingState {
    const { shadowBlur, shadowColor, strokeStyle, fillStyle, lineWidth, globalAlpha } = mockCtx;
    return { shadowBlur, shadowColor, strokeStyle, fillStyle, lineWidth, globalAlpha };
  }
  const initialState = snapshot();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

  let rafCallback: FrameRequestCallback | null = null;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    rafCallback = cb;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { rafCallback = null; });

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let mounted = true;
  const update = (lat: number, lon: number) =>
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: { IsRaceOn: 1, CarOrdinal: 1, AccelerationX: -lat * 9.81, AccelerationZ: lon * 9.81 } }));

  try {
    await act(async () => root.render(<GForceRadar />));
    expect(snapshot()).toEqual(initialState);

    await act(async () => {
      update(1.2, 0.8);
      update(-0.9, -1.1);
      if (rafCallback) (rafCallback as (time: number) => void)(performance.now() + 300);
    });
    expect(snapshot()).toEqual(initialState);

    await act(async () => root.unmount());
    mounted = false;
    await act(async () => {
      update(1.5, 1.0);
      if (rafCallback) (rafCallback as (time: number) => void)(performance.now() + 600);
    });
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
