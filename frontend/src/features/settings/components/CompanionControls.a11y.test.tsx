// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as QRCode from 'qrcode';
import { SettingsProvider } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';
import CompanionLanControls from './CompanionLanControls';
import CompanionUsbControls from './CompanionUsbControls';
vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,stub') }));
let host: HTMLDivElement, root: Root, pending: Record<string, (r: Response) => void>;
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const render = (ui: ReactNode) => act(async () => root.render(<ToastProvider><SettingsProvider>{ui}</SettingsProvider></ToastProvider>));
const pick = (el: HTMLSelectElement, val: string) => act(async () => { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); });
const busyOf = (b: HTMLButtonElement) => [b.getAttribute('aria-busy'), Boolean(b.querySelector('.spinner-border[aria-hidden="true"]'))];
const descOf = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby') ?? '');
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); pending = {};
  vi.mocked(backendFetch).mockImplementation(async (p) => p === '/api/languages' ? json([{ code: 'en-us', name: 'English' }])
    : p === '/api/settings' ? json({ language: 'en-us', companion_usb_enabled: true })
    : p.startsWith('/api/languages/') ? json({}) : new Promise<Response>((r) => { pending[p] = r; }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { vi.useRealTimers(); await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it('separates LAN pairing live announcements from 1Hz timer ticks and hardens async/warning states', async () => {
  vi.useFakeTimers(); vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('qr fail'));
  await render(<CompanionLanControls />);
  const genBtn = host.querySelector<HTMLButtonElement>('button')!;
  await act(async () => genBtn.click());
  expect([...busyOf(genBtn), genBtn.disabled, genBtn.parentElement!.title, genBtn.parentElement!.style.cursor]).toEqual(['true', true, true, 'Creating…', 'not-allowed']);
  await act(async () => pending['/api/companion/lan/pairing'](json({ token: '842195', host_name: 'FH6-RIG', lan_ips: ['192.168.1.24'], port: 8001, expires_in_secs: 300 })));
  expect(host.querySelector('.companion-lan-pairing')?.hasAttribute('role')).toBe(false);
  const timer = host.querySelector('[role="timer"]')!, live = host.querySelector('.visually-hidden[role="status"]')!;
  expect([timer.getAttribute('aria-live'), timer.textContent, live.getAttribute('aria-live'), live.textContent]).toEqual(['off', 'Expires in 5:00', 'polite', 'Pairing code: 842195 · Expires in 5:00']);
  expect(host.querySelector('.companion-lan-pairing [role="status"]')?.className).toContain('text-warning-emphasis');
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect([timer.textContent, live.textContent]).toEqual(['Expires in 4:55', 'Pairing code: 842195 · Expires in 5:00']);
  await act(async () => { await vi.advanceTimersByTimeAsync(295000); });
  expect(host.querySelector('p.text-warning-emphasis[role="status"]')?.textContent).toContain('Pairing code expired');
});
it('hardens USB async busy indicators, disabled tooltips, select labelling, and warning contrast', async () => {
  await render(<CompanionUsbControls />);
  const refresh = host.querySelector<HTMLButtonElement>('button.btn-outline-secondary')!, stop = host.querySelector<HTMLButtonElement>('button.btn-outline-danger')!, connect = host.querySelector<HTMLButtonElement>('button.btn-primary')!;
  expect(stop.parentElement!.title).toContain('Terminate background ADB process');
  await act(async () => refresh.click());
  expect([...busyOf(refresh), stop.disabled, stop.parentElement!.title, stop.parentElement!.style.cursor]).toEqual(['true', true, true, 'Scanning…', 'not-allowed']);
  await act(async () => pending['/api/companion/usb/devices'](json({ devices: [{ serial: 'A1', state: 'device', model: 'Pixel' }, { serial: 'B2', state: 'unauthorized', model: 'Tab' }, { serial: 'C3', state: 'offline' }] })));
  const select = host.querySelector<HTMLSelectElement>('select')!;
  expect([Boolean(select.id), host.querySelector(`label[for="${select.id}"]`)?.textContent, select.getAttribute('aria-label')]).toEqual([true, 'USB device', 'USB device']);
  await pick(select, 'B2');
  expect([descOf(select)?.getAttribute('role'), descOf(select)?.className.includes('text-warning-emphasis')]).toEqual(['status', true]);
  await pick(select, 'C3');
  expect(descOf(select)?.textContent).toContain('Reconnect');
  await pick(select, 'A1');
  expect(select.hasAttribute('aria-describedby')).toBe(false);
  await act(async () => connect.click());
  expect(busyOf(connect)).toEqual(['true', true]);
  await act(async () => pending['/api/companion/usb/connect'](json({ serial: 'A1', backend_port: 8001, reverse_local: 'tcp:8001', reverse_remote: 'tcp:8001', launched: true })));
  await act(async () => stop.click());
  expect([...busyOf(stop), refresh.parentElement!.title, stop.parentElement!.title]).toEqual(['true', true, 'Stopping…', 'Stopping…']);
  await act(async () => pending['/api/companion/usb/kill'](json({ ok: true })));
});
