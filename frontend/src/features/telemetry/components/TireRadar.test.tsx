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
