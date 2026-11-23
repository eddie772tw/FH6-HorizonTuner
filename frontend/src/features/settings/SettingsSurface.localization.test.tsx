// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../context/SettingsContext';
import { ToastProvider } from '../../context/ToastContext';
import { backendFetch } from '../../services/backend';
import { SettingsSurface } from './SettingsSurface';
import { DiscordPresenceStatusCard } from './components/DiscordPresenceStatusCard';
import AnalysisSessionVisuals from '../analysis/AnalysisSessionVisuals';

vi.mock('../../services/backend', () => ({
  backendFetch: vi.fn(),
  backendHttpUrl: vi.fn((path: string) => path),
}));

vi.mock('../analysis/TrackMapCanvas', () => ({
  default: () => <div data-testid="mock-track-map" />,
}));

vi.mock('../analysis/LapDeltaCanvas', () => ({
  default: () => <div data-testid="mock-lap-delta" />,
}));

vi.mock('../analysis/SessionHealthDebrief', () => ({
  default: () => <div data-testid="mock-debrief" />,
}));

const languages = ['en-us', 'zh-tw', 'ja-jp'] as const;
type LocaleCode = (typeof languages)[number];

const dictionaries: Record<LocaleCode, Record<string, string>> = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ])
) as Record<LocaleCode, Record<string, string>>;

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('SettingsSurface localization & accessibility', () => {
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
    'localizes General units, Telemetry port, Discord Rich Presence, Updates badge, and Data & Storage in %s',
    async (language) => {
      vi.mocked(backendFetch).mockImplementation(async (path) => {
        if (path === '/api/languages') return jsonResponse(languages.map((code) => ({ code, name: code })));
        if (path === '/api/settings') return jsonResponse({ language });
        if (path.startsWith('/api/languages/')) {
          return jsonResponse(dictionaries[path.slice('/api/languages/'.length) as LocaleCode]);
        }
        if (path === '/api/diagnostics/discord-presence') {
          return jsonResponse({
            configured: true,
            state: 'waiting_for_telemetry',
            lastError: 'IPC pipe busy',
            lastTelemetryAt: null,
            lastAttemptAt: 1732300000,
            connectionAttempts: 3,
            updatesSent: 12,
            reconnects: 1,
          });
        }
        if (path === '/api/settings/storage-overview') {
          return jsonResponse({
            format: 'fh6-settings/v2',
            schema_version: 2,
            data_root: 'Application data directory',
            total_bytes: 4096,
            entries: [{ relative_path: 'settings.json', bytes: 1024 }],
            last_backup: null,
            capabilities: {
              settings_backup_recovery: 'available',
              settings_export: 'not_available',
              settings_restore: 'not_available',
              sqlite_migration: 'not_planned',
            },
          });
        }
        throw new Error('Unexpected request: ' + path);
      });

      await act(async () => {
        root.render(
          <ToastProvider>
            <SettingsProvider>
              <SettingsSurface />
            </SettingsProvider>
          </ToastProvider>
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      const expected = {
        'en-us': {
          intro: 'Adjust display language, UDP telemetry options, and unit conversions for the tuning tool. All changes are saved automatically.',
          metric: 'Metric',
          imperial: 'Imperial',
          telemetryPort: 'Telemetry Port',
          portDesc: 'Port to listen for Forza UDP telemetry packets across all network adapters and loopback (Default: 8000).',
          discordTitle: 'Discord Rich Presence',
          presenceStatus: 'Presence Status',
          discordState: 'Waiting for telemetry',
          updates: 'Updates: 12',
          attempts: 'Attempts: 3',
          reconnects: 'Reconnects: 1',
          ipcError: 'Last IPC error',
          storageTitle: 'Data & Storage',
          dataRoot: 'Application data directory',
          notAvailable: 'Not available',
          notPlanned: 'Not planned',
        },
        'zh-tw': {
          intro: '調整調校工具的顯示語言、UDP 遙測選項與單位換算。所有變更都會自動儲存。',
          metric: '公制',
          imperial: '英制',
          telemetryPort: '遙測連接埠',
          portDesc: '在所有網路介面卡與本機迴路 (loopback) 監聽 Forza UDP 遙測封包的連接埠（預設：8000）。',
          discordTitle: 'Discord 動態狀態 (Rich Presence)',
          presenceStatus: '動態狀態',
          discordState: '等待遙測數據',
          updates: '更新次數：12',
          attempts: '連線嘗試：3',
          reconnects: '重新連線：1',
          ipcError: '最近一次 IPC 錯誤',
          storageTitle: '資料與儲存空間',
          dataRoot: '應用程式資料目錄',
          notAvailable: '不可用',
          notPlanned: '暫無規劃',
        },
        'ja-jp': {
          intro: 'チューニングツールの表示言語、UDP テレメトリ設定、単位変換を調整します。変更はすべて自動的に保存されます。',
          metric: 'メートル法',
          imperial: 'インペリアル',
          telemetryPort: 'テレメトリポート',
          portDesc: 'すべてのネットワークアダプターおよびループバックで Forza UDP テレメトリパケットを待ち受けるポート（デフォルト：8000）。',
          discordTitle: 'Discord リッチプレゼンス',
          presenceStatus: 'プレゼンス状態',
          discordState: 'テレメトリ待機中',
          updates: '更新回数: 12',
          attempts: '接続試行: 3',
          reconnects: '再接続: 1',
          ipcError: '直前の IPC エラー',
          storageTitle: 'データとストレージ',
          dataRoot: 'アプリケーションデータディレクトリ',
          notAvailable: '利用不可',
          notPlanned: '予定なし',
        },
      }[language];

      const text = host.textContent ?? '';
      expect(text).toContain(expected.intro);
      expect(text).toContain(expected.telemetryPort);
      expect(text).toContain(expected.portDesc);
      expect(text).toContain(expected.discordTitle);
      expect(text).toContain(expected.presenceStatus);
      expect(text).toContain(expected.updates);
      expect(text).toContain(expected.attempts);
      expect(text).toContain(expected.reconnects);
      expect(text).toContain(expected.ipcError);
      expect(text).toContain(expected.storageTitle);
      expect(text).toContain(expected.dataRoot);
      expect(text).toContain(expected.notAvailable);
      expect(text).toContain(expected.notPlanned);

      const unitSelect = host.querySelector('#settings-unit-general') as HTMLSelectElement | null;
      expect(unitSelect).not.toBeNull();
      const optionTexts = Array.from(unitSelect!.options).map((opt) => opt.textContent);
      expect(optionTexts).toEqual([expected.metric, expected.imperial]);

      const statusBadges = Array.from(host.querySelectorAll('[role="status"][aria-live="polite"]')).map((el) => el.textContent);
      expect(statusBadges).toContain(expected.discordState);
      expect(statusBadges.length).toBeGreaterThanOrEqual(2);

      const alertEl = host.querySelector('[role="alert"]');
      expect(alertEl?.textContent).toContain('IPC pipe busy');

      expect(text).not.toContain('not_available');
      expect(text).not.toContain('not_planned');
      if (language !== 'en-us') {
        expect(text).not.toContain('not available');
        expect(text).not.toContain('not planned');
        expect(text).not.toContain('Application data directory');
        expect(text).not.toContain('Telemetry Port');
      }
    }
  );

  it.each([
    ['unavailable', 'zh-tw', '無法取得'],
    ['missing_application_id', 'ja-jp', 'アプリケーション ID 未設定'],
    ['error', 'zh-tw', '無法連線至 Discord'],
  ] as const)(
    'maps Discord status "%s" accurately in %s',
    async (state, language, expectedLabel) => {
      vi.mocked(backendFetch).mockImplementation(async (path) => {
        if (path === '/api/languages') return jsonResponse(languages.map((code) => ({ code, name: code })));
        if (path === '/api/settings') return jsonResponse({ language });
        if (path.startsWith('/api/languages/')) {
          return jsonResponse(dictionaries[path.slice('/api/languages/'.length) as LocaleCode]);
        }
        if (path === '/api/diagnostics/discord-presence') {
          return jsonResponse({
            configured: false,
            state,
            lastError: null,
            lastTelemetryAt: null,
            lastAttemptAt: null,
            connectionAttempts: 0,
            updatesSent: 0,
            reconnects: 0,
          });
        }
        throw new Error('Unexpected request: ' + path);
      });

      await act(async () => {
        root.render(
          <ToastProvider>
            <SettingsProvider>
              <DiscordPresenceStatusCard />
            </SettingsProvider>
          </ToastProvider>
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      const badge = host.querySelector('[role="status"]');
      expect(badge?.textContent).toBe(expectedLabel);
    }
  );

  it.each(languages)(
    'disambiguates AnalysisSessionVisuals metric selector from Metric unit system in %s',
    async (language) => {
      const dict = dictionaries[language];
      const t = (key: string) => (language === 'en-us' ? key : (dict[key] ?? key));

      await act(async () => {
        root.render(
          <AnalysisSessionVisuals
            isLoading={false}
            activeSession={[{
              time: 0,
              PositionX: 1,
              PositionZ: 2,
              SpeedMetersPerSecond: 30,
              CurrentEngineRpm: 4000,
              Gear: 3,
              AccelInput: 100,
              BrakeInput: 0,
              AccelerationX: 0,
              AccelerationZ: 0,
              TireSlipAngle: [0, 0, 0, 0],
              TireSlipRatio: [0, 0, 0, 0],
              TireTemp: [180, 180, 180, 180],
              SuspTravel: [0.5, 0.5, 0.5, 0.5],
            }]}
            compareSessionData={[]}
            primaryLap={1}
            compareLap={-1}
            selectedMetric="speed"
            onSelectMetric={vi.fn()}
            activeCanvasData={[]}
            baseCanvasData={[]}
            isRecording={false}
            isSavedSession={true}
            fallbackDebrief={{} as never}
            t={t}
          />
        );
      });

      const labelText = host.querySelector('label')?.textContent ?? '';
      if (language === 'en-us') {
        expect(labelText).toContain('Analysis Metric:');
      } else {
        expect(labelText).toContain('分析指標:');
        expect(labelText).not.toContain('公制');
        expect(labelText).not.toContain('メートル法');
      }
    }
  );

  it('aligns Up to Date and Last Checked across all three locale dictionaries', () => {
    for (const key of ['Up to Date', 'Last Checked']) {
      expect(dictionaries['en-us'][key]).toBe(key);
      expect(dictionaries['zh-tw'][key]).toBeTruthy();
      expect(dictionaries['zh-tw'][key]).not.toBe(key);
      expect(dictionaries['ja-jp'][key]).toBeTruthy();
      expect(dictionaries['ja-jp'][key]).not.toBe(key);
    }
  });
});
