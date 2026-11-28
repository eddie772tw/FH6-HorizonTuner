// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManualRecordingToolbar, type ManualRecordingToolbarProps } from './ManualRecordingToolbar';
import { SessionTrimSummaryCard } from './SessionTrimSummaryCard';

const t = (text: string, params?: Record<string, string | number>) =>
  params ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), text) : text;
let host: HTMLDivElement, root: Root, onClear: ReturnType<typeof vi.fn<() => void>>;
const renderToolbar = (overrides: Partial<ManualRecordingToolbarProps> = {}) => act(async () =>
  root.render(<ManualRecordingToolbar mode="circuit" onModeChange={vi.fn()} isRecording={false} recordingCount={0}
    manualMode={false} armed={false} canStart onStartManual={vi.fn()} onStopManual={vi.fn()} onClear={onClear} onSave={vi.fn()} t={t} {...overrides} />));
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); onClear = vi.fn(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const button = (label: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label)!;

it('exposes mode aria-pressed, live status, light-theme contrast, and disabled tooltips', async () => {
  await renderToolbar({ mode: 'time_trial', canStart: false });
  expect(host.querySelector('.bg-dark-subtle')).toBeNull();
  expect(button('Time Trial').getAttribute('aria-pressed')).toBe('true');
  expect(button('Circuit Race').getAttribute('aria-pressed')).toBe('false');
  expect(button('Arm Route').parentElement?.getAttribute('title')).toBe('Select Route');
  expect(button('Arm Route').parentElement?.style.cursor).toBe('not-allowed');
  expect(button('Arm Route').style.pointerEvents).toBe('none');
  const live = host.querySelector('.visually-hidden[role="status"]')!;
  expect(live.getAttribute('aria-live')).toBe('polite');
  expect(live.getAttribute('aria-atomic')).toBe('true');

  await renderToolbar({ mode: 'roaming', armed: true });
  expect(host.querySelector('[role="group"]')?.getAttribute('title')).toBe('Armed & Awaiting Gate Crossing');
  expect(button('Arm Route').parentElement?.getAttribute('title')).toBe('Armed & Awaiting Gate Crossing');
  await renderToolbar({ isRecording: true, recordingCount: 128, manualMode: false });
  expect(live.textContent).toBe('Auto Recording');
  expect(button('Save Current').className).toContain('btn-warning');
  expect(button('Save Current').className).not.toContain('btn-outline-warning');
  expect(button('Clear Buffer').parentElement?.getAttribute('title')).toBe('Cannot clear while capturing');
});

it('confirms Clear Buffer inline with Escape dismissal, focus restoration, and recording guard', async () => {
  await renderToolbar();
  const clearTrigger = button('Clear Buffer');
  await act(async () => clearTrigger.click());
  expect(onClear).not.toHaveBeenCalled();
  expect(clearTrigger.getAttribute('aria-expanded')).toBe('true');
  const group = document.getElementById(clearTrigger.getAttribute('aria-controls')!)!;
  expect(document.activeElement).toBe(button('Cancel'));
  const outside = document.createElement('button'); document.body.append(outside); outside.focus();
  await act(async () => outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.getElementById(group.id)).not.toBeNull(); outside.remove();
  await act(async () => button('Cancel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(clearTrigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(clearTrigger);

  await act(async () => clearTrigger.click());
  await act(async () => host.querySelector<HTMLButtonElement>('button.btn-danger')!.click());
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(clearTrigger);
  await act(async () => clearTrigger.click());
  await renderToolbar({ isRecording: true });
  expect(host.querySelector(`#${CSS.escape(group.id)}`)).toBeNull();
});

it('renders semantic heading, flex-wrap controls, and accessible badges in SessionTrimSummaryCard', async () => {
  await act(async () => root.render(<SessionTrimSummaryCard metadata={{ recording_mode: 'time_trial', route_name: 'Sprint Alpha',
    trim_analysis: { raw_sample_count: 100, trimmed_sample_count: 90 } }} showRawData={false} onToggleRawData={vi.fn()}
    exportRawData={false} onToggleExportRawData={vi.fn()} t={t} />));
  expect(host.querySelector('h3')?.textContent).toBe('Session Analysis & Trimming');
  expect(host.querySelector('.card-header')?.className).toContain('flex-wrap');
  expect(host.querySelectorAll('.badge.text-bg-secondary, .badge.text-bg-info')).toHaveLength(2);
  expect(host.querySelector<HTMLInputElement>('#rawViewToggle')?.style.cursor).toBe('pointer');
  expect(host.querySelector<HTMLInputElement>('#exportRawCheckbox')?.style.cursor).toBe('pointer');
});
