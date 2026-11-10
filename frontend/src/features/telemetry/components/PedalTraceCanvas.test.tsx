// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import PedalTraceCanvas from './PedalTraceCanvas';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));

type DrawingState = Pick<CanvasRenderingContext2D,
  'shadowBlur' | 'shadowColor' | 'strokeStyle' | 'fillStyle' | 'lineWidth' | 'lineCap' | 'lineJoin'
> & { lineDash: number[] };

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
  let lineDash = [2, 3];
  const mockCtx = {
    shadowBlur: 3,
    shadowColor: 'rgba(20, 30, 40, 0.5)',
    strokeStyle: '#123456',
    fillStyle: '#654321',
    lineWidth: 7,
    lineCap: 'square' as CanvasLineCap,
    lineJoin: 'bevel' as CanvasLineJoin,
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
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fill() {},
  };
  function snapshot(): DrawingState {
    const { shadowBlur, shadowColor, strokeStyle, fillStyle, lineWidth, lineCap, lineJoin } = mockCtx;
    return { shadowBlur, shadowColor, strokeStyle, fillStyle, lineWidth, lineCap, lineJoin, lineDash: mockCtx.getLineDash() };
  }
  const initialState = snapshot();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let mounted = true;
  const update = () => telemetryEmitter.dispatchEvent(new CustomEvent('update', {
    detail: { IsRaceOn: 1, CarOrdinal: 1, AccelInput: 200, BrakeInput: 50 },
  }));
  try {
    // observe() calls back immediately: mounting must not depend on a later draw initialization.
    await act(async () => root.render(<PedalTraceCanvas />));
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
