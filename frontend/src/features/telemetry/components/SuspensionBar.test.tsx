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
    const readouts = () => Array.from(host.querySelectorAll('span')).map(element => element.innerText).filter(Boolean);
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
