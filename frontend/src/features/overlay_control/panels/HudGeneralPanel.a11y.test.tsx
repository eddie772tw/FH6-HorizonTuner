// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_HUD_CONFIG } from '../hudConfig';
import { deriveHudCapabilities } from '../hudCapabilities';
import { HudGeneralPanel } from './HudGeneralPanel';

const t = (s: string) => s;
let host: HTMLDivElement, root: Root, onResetHudConfig: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
const renderPanel = async (disabled = false) => {
  const caps = deriveHudCapabilities({ nativeAvailable: false, hudStyle: 'simple' });
  await act(async () => root.render(
    <HudGeneralPanel config={DEFAULT_HUD_CONFIG} monitors={[]}
      appUnits={{ speed: 'kmh', boostPressure: 'bar', torque: 'nm', power: 'hp', temperature: 'C' }}
      busy={false} capabilities={caps} audioDevices={[]} loadingAudioDevices={false}
      onMonitorChange={vi.fn()} onAudioDeviceChange={vi.fn()} onRefreshAudioDevices={vi.fn()}
      onReloadHud={vi.fn()} onResetHudConfig={onResetHudConfig} onConfigPatch={vi.fn()} disabled={disabled} t={t} />,
  ));
};

beforeEach(async () => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  onResetHudConfig = vi.fn().mockResolvedValue(true); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
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

  await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(host.querySelector('[role="group"]')).toBeNull();
  expect(document.activeElement).toBe(btn('Reset HUD Settings'));

  await act(async () => btn('Reset HUD Settings').click());
  await act(async () => btn('Reset HUD Settings').click());
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(onResetHudConfig).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="status"]')?.textContent).toBe('HUD settings synchronized');
  expect(document.activeElement).toBe(btn('Reset HUD Settings'));
});

const resetButton = () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Reset HUD Settings')!;

it('leaves Escape and focus to controls outside the confirmation, including other tabs and dialogs', async () => {
  await act(async () => resetButton().click());
  const outside = document.createElement('button');
  document.body.append(outside);
  try {
    outside.focus();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => outside.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(host.querySelector('[role="group"]')).not.toBeNull();
    expect(document.activeElement).toBe(outside);
  } finally {
    outside.remove();
  }
});

it('announces completion only after persistence succeeds and prevents duplicate resets while saving', async () => {
  let finish!: (saved: boolean) => void;
  onResetHudConfig.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => resetButton().click());
  await act(async () => resetButton().click());
  expect(host.querySelector('[role="status"]')?.textContent).toBe('');
  expect(host.querySelector('[role="group"]')).not.toBeNull();
  await act(async () => resetButton().click());
  expect(onResetHudConfig).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  expect(host.querySelector('[role="status"]')?.textContent).toBe('');
  expect(host.querySelector('[role="group"]')).not.toBeNull();
  onResetHudConfig.mockResolvedValue(true);
  await act(async () => resetButton().click());
  expect(host.querySelector('[role="group"]')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).not.toBe('');
});

it('drops disabled confirmations without moving focus away from another control', async () => {
  await act(async () => resetButton().click());
  const outside = document.createElement('button');
  document.body.append(outside);
  try {
    outside.focus();
    await renderPanel(true);
    expect(host.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  } finally {
    outside.remove();
  }
});

it('keeps rejected resets retryable and reports that attention is needed', async () => {
  onResetHudConfig.mockRejectedValue(new Error('reset failed'));
  await act(async () => resetButton().click());
  await act(async () => resetButton().click());
  expect(host.querySelector('[role="group"]')).not.toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Needs attention');
  expect(host.querySelector('fieldset')?.disabled).toBe(false);
});

it('does not reclaim focus when a reset finishes after focus moved to another dialog', async () => {
  let finish!: (saved: boolean) => void;
  onResetHudConfig.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => resetButton().click());
  await act(async () => resetButton().click());
  const outside = document.createElement('button');
  document.body.append(outside);
  try {
    outside.focus();
    await act(async () => finish(true));
    expect(document.activeElement).toBe(outside);
  } finally {
    outside.remove();
  }
});
