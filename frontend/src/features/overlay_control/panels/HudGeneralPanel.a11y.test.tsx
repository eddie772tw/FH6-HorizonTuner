// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_HUD_CONFIG } from '../hudConfig';
import { deriveHudCapabilities } from '../hudCapabilities';
import { HudGeneralPanel } from './HudGeneralPanel';

const t = (s: string) => s;
let host: HTMLDivElement, root: Root, onResetHudConfig: ReturnType<typeof vi.fn<() => void>>;
const renderPanel = async () => {
  const caps = deriveHudCapabilities({ nativeAvailable: false, hudStyle: 'simple' });
  await act(async () => root.render(
    <HudGeneralPanel config={DEFAULT_HUD_CONFIG} monitors={[]}
      appUnits={{ speed: 'kmh', boostPressure: 'bar', torque: 'nm', power: 'hp', temperature: 'C' }}
      busy={false} capabilities={caps} audioDevices={[]} loadingAudioDevices={false}
      onMonitorChange={vi.fn()} onAudioDeviceChange={vi.fn()} onRefreshAudioDevices={vi.fn()}
      onReloadHud={vi.fn()} onResetHudConfig={onResetHudConfig} onConfigPatch={vi.fn()} disabled={false} t={t} />,
  ));
};

beforeEach(async () => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  onResetHudConfig = vi.fn(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await renderPanel();
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it('links monitor capability descriptions and uses accessible inline confirmation for HUD reset', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  const monitorSelect = host.querySelector<HTMLSelectElement>('select[id$="-monitor"]')!;
  const describedIds = (monitorSelect.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  expect(describedIds.length).toBe(2);
  expect(describedIds.every(id => Boolean(document.getElementById(id)?.textContent))).toBe(true);

  const btn = (label: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label)!;
  const resetBtn = btn('Reset HUD Settings');
  expect(document.getElementById(resetBtn.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Reset all HUD elements');

  await act(async () => resetBtn.click());
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(onResetHudConfig).not.toHaveBeenCalled();
  const group = host.querySelector('[role="group"]')!;
  expect(document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Are you sure you want to reset all HUD settings?');
  expect(document.activeElement).toBe(btn('Cancel'));

  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(host.querySelector('[role="group"]')).toBeNull();
  expect(document.activeElement).toBe(btn('Reset HUD Settings'));

  await act(async () => btn('Reset HUD Settings').click());
  await act(async () => btn('Reset HUD Settings').click());
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(onResetHudConfig).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Reset all HUD elements');
  expect(document.activeElement).toBe(btn('Reset HUD Settings'));
});
