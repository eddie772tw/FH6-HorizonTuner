// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DiagnosticConsole from './DiagnosticConsole';
import { backendFetch } from '../services/backend';

const t = (s: string) => s;
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ t }) }));
vi.mock('../hooks/useFileSave', () => ({ useFileSave: () => ({ save: vi.fn(), isSaving: false }) }));
vi.mock('../services/backend', () => ({ backendFetch: vi.fn() }));
const sampleLogs = [
  { timestamp: '01:00:00', level: 'ERROR', logger: 'udp', message: 'Packet timeout' },
  { timestamp: '01:00:01', level: 'INFO', logger: 'app', message: 'Ready' },
];
let host: HTMLDivElement, root: Root, deleteOk = true;
function TestHarness() {
  const [open, setOpen] = useState(false);
  return <><button id="open-console" onClick={() => setOpen(true)}>Open</button><DiagnosticConsole show={open} onClose={() => setOpen(false)} /></>;
}
beforeEach(async () => {
  vi.useFakeTimers(); deleteOk = true; Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.mocked(backendFetch).mockImplementation(async (_url, init) => ({
    ok: init?.method === 'DELETE' ? deleteOk : true,
    json: async () => ({ logs: init?.method === 'DELETE' ? [] : sampleLogs }),
  } as Response));
  host = document.createElement('div'); host.id = 'root'; document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<TestHarness />));
  const trigger = document.getElementById('open-console')!; trigger.focus();
  await act(async () => trigger.click()); await act(async () => vi.advanceTimersByTimeAsync(32));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('exposes labeled dialog, keyboard-scrollable log region, and theme-adaptive log colors', () => {
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h5')!.id);
  expect(document.querySelector('.offcanvas-backdrop')?.getAttribute('aria-hidden')).toBe('true');
  const logRegion = dialog.querySelector<HTMLElement>('pre[role="region"]')!;
  expect(logRegion.getAttribute('tabindex')).toBe('0');
  expect(logRegion.getAttribute('aria-label')).toBe('Show Logs');
  const rows = Array.from(logRegion.children) as HTMLElement[];
  expect(rows[0].style.color).toBe('var(--bs-danger-text-emphasis)');
  expect(rows[1].style.color).toBe('var(--text-primary)');
  expect(rows[0].querySelector('.badge')?.className).toContain('text-body');
});

it('uses non-blocking inline clear confirmation with Escape cancel, success focus, and inline error fallback', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm'), alertSpy = vi.spyOn(window, 'alert');
  const btn = (label: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(label))!;
  await act(async () => btn('Clear Logs').click());
  expect(confirmSpy).not.toHaveBeenCalled(); expect(document.activeElement).toBe(btn('Cancel'));
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-hidden')).toBe('false');
  expect(document.activeElement).toBe(btn('Clear Logs'));
  deleteOk = false;
  await act(async () => btn('Clear Logs').click()); await act(async () => btn('Confirm Clear').click());
  await act(async () => vi.advanceTimersByTimeAsync(1100));
  expect(alertSpy).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Failed to clear logs on server.');
  deleteOk = true;
  await act(async () => btn('Clear Logs').click()); await act(async () => btn('Confirm Clear').click());
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(document.activeElement).toBe(document.querySelector('pre[role="region"]'));
  expect(btn('Clear Logs').disabled).toBe(true);
});
