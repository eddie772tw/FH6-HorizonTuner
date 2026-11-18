// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AnalysisSessionToolbar, { type AnalysisSessionToolbarProps } from './AnalysisSessionToolbar';

const t = (s: string) => s;
let host: HTMLDivElement, root: Root, onDeleteSession: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
const renderToolbar = async (overrides: Partial<AnalysisSessionToolbarProps> = {}) => {
  const props: AnalysisSessionToolbarProps = {
    t, isRecording: false, recordingCount: 0, activeSessionLength: 42,
    selectedFilename: 'session_1.csv', savedSessions: [], lapsList: [], primaryLap: 0, compareLap: -1,
    isSavedSelection: true, motecActionMsg: null, fileInputRef: { current: null },
    onSelectSession: vi.fn(), onSelectPrimaryLap: vi.fn(), onSelectCompareLap: vi.fn(),
    onOpenInMoTec: vi.fn(), onExportMoTec: vi.fn(), onImportFile: vi.fn(), onOpenImport: vi.fn(),
    onDownloadTemplate: vi.fn(), onDeleteSession, onCloseMessage: vi.fn(), onLatestAnalysis: vi.fn(),
    ...overrides,
  };
  await act(async () => root.render(<AnalysisSessionToolbar {...props} />));
};
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  onDeleteSession = vi.fn().mockResolvedValue(true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await renderToolbar();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const button = (name: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === name)!;

it('confirms session deletion inline with Escape cancellation and focus management', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Delete selected session"]')!;
  await act(async () => trigger.click());
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(onDeleteSession).not.toHaveBeenCalled();
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(trigger.disabled).toBe(true);
  const group = host.querySelector('[role="group"]')!;
  expect(document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent).toContain('session_1.csv');
  expect(document.activeElement).toBe(button('Cancel'));

  const outside = document.createElement('button'); document.body.append(outside); outside.focus();
  const outsideEsc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => outside.dispatchEvent(outsideEsc));
  expect(outsideEsc.defaultPrevented).toBe(false); expect(host.querySelector('[role="group"]')).not.toBeNull(); outside.remove();
  await act(async () => button('Cancel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="group"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
});

it('guards async deletion, announces failure or completion, and focuses session selector after removal', async () => {
  let finish!: (ok: boolean) => void;
  onDeleteSession.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="Delete selected session"]')!;
  const confirmBtn = () => host.querySelector<HTMLButtonElement>('[role="group"] button.btn-danger')!;
  await act(async () => trigger().click());
  await act(async () => confirmBtn().click());
  expect(confirmBtn().getAttribute('aria-busy')).toBe('true');
  await act(async () => confirmBtn().click());
  expect(onDeleteSession).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Failed to delete session.');
  expect(document.activeElement).toBe(trigger());
  onDeleteSession.mockImplementation(async () => { await renderToolbar({ selectedFilename: 'current', isSavedSelection: false }); return true; });
  await act(async () => trigger().click()); await act(async () => confirmBtn().click());
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Session deleted.');
  expect(document.activeElement).toBe(host.querySelector('select[aria-label="Select Session"]'));
});
