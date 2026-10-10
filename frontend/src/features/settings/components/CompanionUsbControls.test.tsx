// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';
import CompanionUsbControls from './CompanionUsbControls';

vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));

const reasons = ['Creating…', 'Scanning…', 'Connecting…', 'Choose a USB device', 'Device not ready'];
const locales = [
  { language: 'en-us', expected: ['Creating…', 'Scanning…', 'Connecting…', 'Choose a USB device', 'Device not ready'] },
  { language: 'ja-jp', expected: ['作成中…', 'スキャン中…', '接続中…', 'USB デバイスを選択', '端末の準備ができていません'] },
  { language: 'zh-tw', expected: ['建立中…', '掃描中…', '連線中…', '選擇 USB 裝置', '裝置尚未就緒'] },
];
const dictionaries = Object.fromEntries(locales.map(({ language }) => [
  language,
  JSON.parse(readFileSync(new URL('../../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
]));

function Harness({ showControls }: { showControls: boolean }) {
  const { t } = useSettings();
  return <>
    {reasons.map(reason => <output key={reason}>{t(reason)}</output>)}
    {showControls && <CompanionUsbControls />}
  </>;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(backendFetch).mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it.each(locales)('translates disabled USB reasons through the real SettingsProvider in $language', async ({ language, expected }) => {
  let resolveScan!: (response: Response) => void;
  let resolveConnect!: (response: Response) => void;
  const scan = new Promise<Response>(resolve => { resolveScan = resolve; });
  const connect = new Promise<Response>(resolve => { resolveConnect = resolve; });
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async path => {
    if (path === '/api/languages') return response(locales.map(item => ({ code: item.language, name: item.language })));
    if (path === '/api/settings') return response({ language });
    if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
    if (path === '/api/companion/usb/devices') return scan;
    if (path === '/api/companion/usb/connect') return connect;
    throw new Error('Unexpected request: ' + path);
  });
  const render = async (showControls: boolean) => act(async () => root.render(
    <ToastProvider><SettingsProvider><Harness showControls={showControls} /></SettingsProvider></ToastProvider>,
  ));

  await render(false);
  expect([...host.querySelectorAll('output')].map(output => output.textContent)).toEqual(expected);
  await render(true);
  const button = host.querySelector<HTMLButtonElement>('button.btn-primary')!;
  expect(button.disabled).toBe(true);
  expect(button.parentElement!.title).toBe(expected[1]);

  await act(async () => resolveScan(response({ devices: [
    { serial: 'READY_A', state: 'device' },
    { serial: 'READY_B', state: 'device' },
    { serial: 'OFFLINE', state: 'offline' },
  ] })));
  expect(button.disabled).toBe(true);
  expect(button.parentElement!.title).toBe(expected[3]);
  const select = host.querySelector('select')!;
  const selectDevice = async (serial: string) => act(async () => {
    select.value = serial;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await selectDevice('OFFLINE');
  expect(button.disabled).toBe(true);
  expect(button.parentElement!.title).toBe(expected[4]);
  await act(async () => button.click());
  expect(vi.mocked(backendFetch).mock.calls.some(([path]) => path === '/api/companion/usb/connect')).toBe(false);

  await selectDevice('READY_B');
  expect(button.disabled).toBe(false);
  expect(button.parentElement!.title).toBe('');
  await act(async () => button.click());
  expect(button.disabled).toBe(true);
  expect(select.disabled).toBe(true);
  expect(button.parentElement!.title).toBe(expected[2]);
  const request = vi.mocked(backendFetch).mock.calls.find(([path]) => path === '/api/companion/usb/connect')!;
  expect(JSON.parse(request[1]!.body as string)).toEqual({ serial: 'READY_B' });
  await act(async () => resolveConnect(response({
    serial: 'READY_B', backend_port: 8001, reverse_local: 'tcp:8001', reverse_remote: 'tcp:8001', launched: true,
  })));
  expect(button.disabled).toBe(false);
  expect(button.parentElement!.title).toBe('');
});