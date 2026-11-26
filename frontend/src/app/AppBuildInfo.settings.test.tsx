// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppBuildInfo } from './AppBuildInfo';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import { backendFetch } from '../services/backend';
import { checkForAppUpdates } from '../services/updaterService';

vi.mock('../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../services/updaterService', () => ({
  checkForAppUpdates: vi.fn(async () => null),
  isTauriEnvironment: () => true,
}));

let root: ReturnType<typeof createRoot>;
let settingsState: ReturnType<typeof useSettings>;
function SettingsProbe() { settingsState = useSettings(); return null; }
const mount = () => root.render(<StrictMode><ToastProvider><SettingsProvider>
  <SettingsProbe /><AppBuildInfo />
</SettingsProvider></ToastProvider></StrictMode>);
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  vi.clearAllMocks();
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); });

it.each([true, false])('waits for saved OTA preference (%s) and preserves explicit false settings', async preference => {
  let finish!: (value: Response) => void;
  vi.mocked(backendFetch).mockImplementation((path, options) => {
    if (path === '/api/settings' && !options?.method) return new Promise(resolve => { finish = resolve; });
    return Promise.resolve(response([]));
  });
  await act(async () => mount());
  expect(checkForAppUpdates).not.toHaveBeenCalled();
  await act(async () => finish(response({
    language: 'en-us', auto_check_updates: preference, mcp_enabled: false, mcp_allow_live: false,
    forward_telemetry_enabled: true, forward_telemetry_host: '127.0.0.7', forward_telemetry_port: 5301,
  })));
  expect(settingsState.settings).toMatchObject({ mcp_enabled: false, mcp_allow_live: false,
    forward_telemetry_enabled: true, forward_telemetry_host: '127.0.0.7', forward_telemetry_port: 5301 });
  expect(checkForAppUpdates).toHaveBeenCalledTimes(preference ? 1 : 0);
  await act(async () => { await settingsState.updateSettings({ auto_check_updates: !preference }); });
  expect(checkForAppUpdates).toHaveBeenCalledTimes(preference ? 1 : 0);
});

it('keeps an explicit WIP HUD preference until the backend saves it', async () => {
  localStorage.setItem('fh6_show_wip_huds', 'false');
  const writes: unknown[] = [];
  vi.mocked(backendFetch).mockImplementation(async (path, options) => {
    if (path === '/api/settings' && options?.method === 'POST') {
      writes.push(JSON.parse(String(options.body)));
      return response({});
    }
    return path === '/api/settings' ? response({ language: 'en-us' }) : response([]);
  });
  await act(async () => mount());
  expect(writes).toEqual([{ wip_hud_enabled: false }]);
  expect(settingsState.settings.wip_hud_enabled).toBe(false);
  expect(localStorage.getItem('fh6_show_wip_huds')).toBeNull();
});
