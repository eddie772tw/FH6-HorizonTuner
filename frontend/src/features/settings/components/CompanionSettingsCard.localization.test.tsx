// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';
import { CompanionSettingsCard } from './CompanionSettingsCard';
import CompanionApp from '../../companion/CompanionApp';

vi.mock('../../../services/backend', () => ({
  backendFetch: vi.fn(),
  backendHttpUrl: vi.fn((path: string) => path),
}));

vi.mock('../../companion/useCompanionSession', () => ({
  useCompanionSession: () => ({
    online: true,
    error: null,
    state: null,
    send: vi.fn(),
    commandBusy: false,
    token: 'test-token',
  }),
}));

vi.mock('../../companion/CompanionTelemetry', () => ({
  default: () => <div data-testid="mock-telemetry" />,
}));

vi.mock('../../companion/CompanionTuning', () => ({
  default: () => <div data-testid="mock-tuning" />,
}));

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(readFileSync(new URL('../../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ])
);

describe('Companion localization & accessibility', () => {
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

  it.each(languages)(
    'renders parameterized activeCount status badge in %s without raw DEVICE(S) CONNECTED leak',
    async (language) => {
      const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
      vi.mocked(backendFetch).mockImplementation(async (path) => {
        if (path === '/api/languages') return response(languages.map((code) => ({ code, name: code })));
        if (path === '/api/settings') return response({ language });
        if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
        if (path === '/api/companion/status') return response({ active_connections: 2, port: 5300 });
        if (path === '/api/companion/usb/devices') return response({ devices: [] });
        throw new Error('Unexpected request: ' + path);
      });

      await act(async () => {
        root.render(
          <ToastProvider>
            <SettingsProvider>
              <CompanionSettingsCard />
            </SettingsProvider>
          </ToastProvider>
        );
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const badge = host.querySelector('.badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).not.toContain('DEVICE(S) CONNECTED');

      if (language === 'en-us') {
        expect(badge?.textContent).toBe('2 Companion device(s) connected');
      } else if (language === 'zh-tw') {
        expect(badge?.textContent).toBe('已連接 2 台 Companion 裝置');
      } else if (language === 'ja-jp') {
        expect(badge?.textContent).toBe('2 台の Companion デバイスが接続されています');
      }
    }
  );

  it.each(languages)(
    'renders localized accessibility labels on CompanionApp shell in %s',
    async (language) => {
      const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
      vi.mocked(backendFetch).mockImplementation(async (path) => {
        if (path === '/api/languages') return response(languages.map((code) => ({ code, name: code })));
        if (path === '/api/settings') return response({ language });
        if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
        throw new Error('Unexpected request: ' + path);
      });

      await act(async () => {
        root.render(
          <ToastProvider>
            <SettingsProvider>
              <CompanionApp />
            </SettingsProvider>
          </ToastProvider>
        );
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const main = host.querySelector('main.companion-app');
      const tabsNav = host.querySelector('nav.companion-tabs');

      expect(main).not.toBeNull();
      expect(tabsNav).not.toBeNull();

      if (language === 'en-us') {
        expect(main?.getAttribute('aria-label')).toBe('HorizonTuner Companion');
        expect(tabsNav?.getAttribute('aria-label')).toBe('Companion sections');
      } else if (language === 'zh-tw') {
        expect(main?.getAttribute('aria-label')).toBe('HorizonTuner Companion');
        expect(tabsNav?.getAttribute('aria-label')).toBe('Companion 區段');
      } else if (language === 'ja-jp') {
        expect(main?.getAttribute('aria-label')).toBe('HorizonTuner Companion');
        expect(tabsNav?.getAttribute('aria-label')).toBe('Companion セクション');
      }
    }
  );
});
