// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import ArcSteerGauge from './ArcSteerGauge';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({
  useSettings: () => ({ t: (key: string) => key }),
}));

it('renders steering gauge, updates angle text, and paints without errors', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: any[]) => void) {}
    observe(target: HTMLElement) {
      this.cb([{ target, contentRect: { width: 200, height: 200 } }]);
    }
    disconnect() {}
  });

  const saveCalls: number[] = [];
  const restoreCalls: number[] = [];
  const context = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'save') return () => saveCalls.push(1);
      if (prop === 'restore') return () => restoreCalls.push(1);
      return () => {};
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => root.render(<ArcSteerGauge />));

    const readout = host.querySelector('.telemetry-steer-gauge__readout');
    expect(readout).not.toBeNull();
    expect(readout?.textContent).toContain('0.0°');

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { IsRaceOn: 1, SteerInput: 63.5 },
      }));
    });

    const dirText = host.querySelector('.telemetry-steer-gauge__direction')?.textContent;
    expect(dirText).toBe('RIGHT');
    expect(readout?.textContent).toContain('22.5°');

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { IsRaceOn: 1, SteerInput: 0 },
      }));
    });
    expect(host.querySelector('.telemetry-steer-gauge__direction')?.textContent).toBe('CENTER');
    expect(readout?.textContent).toContain('0.0°');

    expect(saveCalls.length).toBeGreaterThan(0);
    expect(saveCalls.length).toBe(restoreCalls.length);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
