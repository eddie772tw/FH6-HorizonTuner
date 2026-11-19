// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanionApp from './CompanionApp';

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map(language => [
    language,
    JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
);

let activeLang: (typeof languages)[number] = 'en-us';
let mockDesktopOnline = false;

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { language: activeLang },
    t: (text: string, params?: Record<string, string | number>) => {
      let result = activeLang === 'en-us' ? text : (dictionaries[activeLang][text] ?? text);
      if (params) {
        Object.entries(params).forEach(([key, val]) => {
          result = result.replace(`{${key}}`, String(val));
        });
      }
      return result;
    },
  }),
}));

vi.mock('./useCompanionSession', () => ({
  useCompanionSession: () => ({
    state: { hostOnline: mockDesktopOnline },
    backendOnline: false,
    error: null,
    notice: null,
    commandBusy: false,
    send: vi.fn(),
  }),
}));

vi.mock('./CompanionTelemetry', () => ({
  default: () => <div data-testid="mock-telemetry" />,
}));

vi.mock('./CompanionTuning', () => ({
  default: () => <div data-testid="mock-tuning" />,
}));

const EXPECTED_STATUS = {
  'en-us': {
    bothConnected: {
      label: 'Connected',
      accessibleLabel: 'Desktop frontend and Companion backend connected',
    },
    desktopOffline: {
      label: 'Desktop frontend offline',
      accessibleLabel: 'Companion backend connected, desktop frontend offline',
    },
    backendOffline: {
      label: 'Companion backend offline',
      accessibleLabel: 'Desktop frontend connected, Companion backend offline',
    },
    bothDisconnected: {
      label: 'Disconnected',
      accessibleLabel: 'Desktop frontend and Companion backend disconnected',
    },
    tuningTab: 'Tuning',
    connectionTab: 'Connection',
    desktopOfflineDiag: 'Offline',
    desktopOnlineDiag: 'Online',
  },
  'zh-tw': {
    bothConnected: {
      label: '已連線',
      accessibleLabel: '桌面前端與 Companion 後端皆已連線',
    },
    desktopOffline: {
      label: '桌面前端未連線',
      accessibleLabel: 'Companion 後端已連線，桌面前端未連線',
    },
    backendOffline: {
      label: 'Companion 後端未連線',
      accessibleLabel: '桌面前端已連線，Companion 後端未連線',
    },
    bothDisconnected: {
      label: '未連線',
      accessibleLabel: '桌面前端與 Companion 後端皆未連線',
    },
    tuningTab: '調校',
    connectionTab: '連線',
    desktopOfflineDiag: '離線',
    desktopOnlineDiag: '線上',
  },
  'ja-jp': {
    bothConnected: {
      label: '接続済み',
      accessibleLabel: 'デスクトップフロントエンドと Companion バックエンドの両方が接続されています',
    },
    desktopOffline: {
      label: 'デスクトップフロントエンド未接続',
      accessibleLabel: 'Companion バックエンドは接続済み、デスクトップフロントエンドは未接続です',
    },
    backendOffline: {
      label: 'Companion バックエンド未接続',
      accessibleLabel: 'デスクトップフロントエンドは接続済み、Companion バックエンドは未接続です',
    },
    bothDisconnected: {
      label: '未接続',
      accessibleLabel: 'デスクトップフロントエンドと Companion バックエンドの両方が未接続です',
    },
    tuningTab: 'チューニング',
    connectionTab: '接続',
    desktopOfflineDiag: 'オフライン',
    desktopOnlineDiag: 'オンライン',
  },
} as const;

describe('CompanionApp connection status localization & accessibility', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    activeLang = 'en-us';
    mockDesktopOnline = false;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it.each(languages)(
    'localizes tabs, connection status badge, and accessible labels without CJK/English leaks in %s',
    async (language) => {
      activeLang = language;
      const expected = EXPECTED_STATUS[language];

      const renderApp = async (desktopOnline: boolean, nativeState: 'CONNECTED' | 'DISCONNECTED') => {
        mockDesktopOnline = desktopOnline;
        await act(async () => {
          root.render(<CompanionApp />);
        });
        await act(async () => {
          window.dispatchEvent(new CustomEvent('companion-native-connection', {
            detail: { state: nativeState, host: '127.0.0.1', port: '8001', error: null, mode: 'LAN', paired: false },
          }));
        });
      };

      await renderApp(false, 'DISCONNECTED');

      const navButtons = Array.from(host.querySelectorAll('nav.companion-tabs button.nav-link'));
      expect(navButtons).toHaveLength(3);
      expect(navButtons[1]?.textContent?.trim()).toBe(expected.tuningTab);

      const connectionTab = navButtons[2] as HTMLButtonElement;
      expect(connectionTab.getAttribute('aria-label')).toBe(
        `${expected.connectionTab}, ${expected.bothDisconnected.accessibleLabel}`,
      );

      await act(async () => {
        connectionTab.click();
      });

      const assertBadgeState = (target: { label: string; accessibleLabel: string }) => {
        const badge = host.querySelector('.companion-connection-status .badge');
        expect(badge?.textContent?.trim()).toBe(target.label);
        expect(badge?.getAttribute('aria-label')).toBe(target.accessibleLabel);
        expect(connectionTab.getAttribute('aria-label')).toBe(
          `${expected.connectionTab}, ${target.accessibleLabel}`,
        );
      };

      assertBadgeState(expected.bothDisconnected);
      expect(host.querySelector('.companion-diagnostics')?.textContent).toContain(expected.desktopOfflineDiag);

      await renderApp(true, 'DISCONNECTED');
      assertBadgeState(expected.backendOffline);
      expect(host.querySelector('.companion-diagnostics')?.textContent).toContain(expected.desktopOnlineDiag);

      await renderApp(false, 'CONNECTED');
      assertBadgeState(expected.desktopOffline);

      await renderApp(true, 'CONNECTED');
      assertBadgeState(expected.bothConnected);
    },
  );
});
