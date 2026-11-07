// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import SuspensionBar from './SuspensionBar';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));

it('updates the selected wheel readout and retains its range across a theme change', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<SuspensionBar title="Front Left" isLeft tireIdx={0} />));
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: { IsRaceOn: 1, CarOrdinal: 1, NormalizedSuspensionTravel: [0.42, 0.1, 0.1, 0.1] } }));
    const readouts = () => Array.from(host.querySelectorAll('span')).map(element => element.textContent).filter(Boolean);
    expect(readouts()).toContain('0.42');
    document.documentElement.style.setProperty('--instrument-linear', '1');
    await Promise.resolve();
    expect(readouts()).toContain('0.42');
    telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: { IsRaceOn: 1, CarOrdinal: 1, NormalizedSuspensionTravel: [0.65, 0.1, 0.1, 0.1] } }));
    expect(readouts()).toContain('0.65');
    expect(readouts()).toContain('0.42');
  } finally {
    await act(async () => root.unmount()); host.remove();
    document.documentElement.style.removeProperty('--instrument-linear');
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});


it('paints suspension trace with paired state restoration and gradient reuse', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: any[]) => void) {}
    observe(target: HTMLElement) {
      this.cb([{ target, contentRect: { width: 120, height: 40 } }]);
    }
    disconnect() {}
  });

  const saveCalls: number[] = [];
  const restoreCalls: number[] = [];
  let gradientCreations = 0;
  const dummyGrad = { addColorStop: vi.fn() };

  const context = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'save') return () => saveCalls.push(1);
      if (prop === 'restore') return () => restoreCalls.push(1);
      if (prop === 'createLinearGradient') return () => {
        gradientCreations++;
        return dummyGrad;
      };
      return () => {};
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => root.render(<SuspensionBar title="Front Left" isLeft tireIdx={0} />));

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { IsRaceOn: 1, CarOrdinal: 1, NormalizedSuspensionTravel: [0.35, 0.1, 0.1, 0.1] },
      }));
    });
    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { IsRaceOn: 1, CarOrdinal: 1, NormalizedSuspensionTravel: [0.55, 0.1, 0.1, 0.1] },
      }));
    });

    expect(saveCalls.length).toBeGreaterThan(0);
    expect(saveCalls.length).toBe(restoreCalls.length);
    expect(gradientCreations).toBe(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});


it('renders leading active pulse marker and maintains state isolation under extreme travel', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: any[]) => void) {}
    observe(target: HTMLElement) {
      this.cb([{ target, contentRect: { width: 140, height: 44 } }]);
    }
    disconnect() {}
  });

  const saveCalls: number[] = [];
  const restoreCalls: number[] = [];
  let arcCalls = 0;
  const strokeStyles: string[] = [];

  const context = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'save') return () => saveCalls.push(1);
      if (prop === 'restore') return () => restoreCalls.push(1);
      if (prop === 'arc') return () => { arcCalls++; };
      if (prop === 'createLinearGradient') return () => ({ addColorStop: vi.fn() });
      return () => {};
    },
    set: (_target, prop, value) => {
      if (prop === 'strokeStyle' && typeof value === 'string') strokeStyles.push(value);
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => root.render(<SuspensionBar title="Front Left" isLeft tireIdx={0} />));

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { IsRaceOn: 1, CarOrdinal: 1, NormalizedSuspensionTravel: [0.50, 0.1, 0.1, 0.1] },
      }));
    });
    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', {
        detail: { IsRaceOn: 1, CarOrdinal: 1, NormalizedSuspensionTravel: [0.96, 0.1, 0.1, 0.1] },
      }));
    });

    expect(arcCalls).toBeGreaterThanOrEqual(4);
    expect(saveCalls.length).toBeGreaterThan(0);
    expect(saveCalls.length).toBe(restoreCalls.length);
    expect(strokeStyles.length).toBeGreaterThan(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
