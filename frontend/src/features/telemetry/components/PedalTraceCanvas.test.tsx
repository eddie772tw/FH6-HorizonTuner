// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import PedalTraceCanvas from './PedalTraceCanvas';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));

it('renders pedal trace canvas and preserves paired context state across telemetry frames', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: any[]) => void) {}
    observe(target: HTMLElement) {
      this.cb([{ target, contentRect: { width: 300, height: 140 } }]);
    }
    disconnect() {}
  });

  const saveCalls: number[] = [];
  const restoreCalls: number[] = [];
  let capturedLineCap = '';
  let capturedLineJoin = '';

  const mockCtx = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'save') return () => saveCalls.push(1);
      if (prop === 'restore') return () => restoreCalls.push(1);
      if (prop === 'lineCap') return capturedLineCap;
      if (prop === 'lineJoin') return capturedLineJoin;
      return () => {};
    },
    set: (_target, prop, value) => {
      if (prop === 'lineCap') capturedLineCap = String(value);
      if (prop === 'lineJoin') capturedLineJoin = String(value);
      return true;
    },
  });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => root.render(<PedalTraceCanvas />));

    expect(saveCalls.length).toBeGreaterThan(0);
    expect(saveCalls.length).toBe(restoreCalls.length);

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { IsRaceOn: 1, CarOrdinal: 1, AccelInput: 200, BrakeInput: 50 },
      }));
    });

    expect(capturedLineCap).toBe('round');
    expect(capturedLineJoin).toBe('round');
    expect(saveCalls.length).toBe(restoreCalls.length);

    const labels = Array.from(host.querySelectorAll('span')).map(s => s.textContent);
    expect(labels).toContain('THROTTLE');
    expect(labels).toContain('BRAKE');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
