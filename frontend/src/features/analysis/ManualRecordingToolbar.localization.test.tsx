// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../context/SettingsContext';
import { ToastProvider } from '../../context/ToastContext';
import { backendFetch } from '../../services/backend';
import { ManualRecordingToolbar } from './ManualRecordingToolbar';

vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const baseLangDir = existsSync(resolve(process.cwd(), 'lang'))
  ? resolve(process.cwd(), 'lang')
  : resolve(process.cwd(), '../lang');

const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map(language => [
    language,
    JSON.parse(readFileSync(resolve(baseLangDir, `${language}.json`), 'utf8')),
  ])
);

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

it.each(languages)('renders parameterized badge and accessible button labels in %s', async language => {
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async path => {
    if (path === '/api/languages') return response(languages.map(code => ({ code, name: code })));
    if (path === '/api/settings') return response({ language });
    if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
    throw new Error('Unexpected request: ' + path);
  });

  const translate = (key: string, params?: Record<string, string | number>): string => {
    let result = language === 'en-us' ? key : (dictionaries[language][key] ?? key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  };

  // 1. Test isRecording + manualMode (parameterized badge)
  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <ManualRecordingToolbar
            mode="circuit"
            onModeChange={() => {}}
            isRecording={true}
            recordingCount={42}
            manualMode={true}
            armed={false}
            onStartManual={() => {}}
            onStopManual={() => {}}
            onClear={() => {}}
            onSave={() => {}}
            t={translate}
          />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const recordingBadge = host.querySelector('span[role="status"]');
  expect(recordingBadge).not.toBeNull();
  expect(recordingBadge?.textContent).toBe(translate('Manual Recording ({count} samples)', { count: 42 }));

  // 2. Test auto recording mode
  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <ManualRecordingToolbar
            mode="circuit"
            onModeChange={() => {}}
            isRecording={true}
            recordingCount={128}
            manualMode={false}
            armed={false}
            onStartManual={() => {}}
            onStopManual={() => {}}
            onClear={() => {}}
            onSave={() => {}}
            t={translate}
          />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const autoBadge = host.querySelector('span[role="status"]');
  expect(autoBadge?.textContent).toBe(translate('Auto Recording ({count} samples)', { count: 128 }));

  // 3. Test idle & buttons accessibility (Save Current and Clear Buffer aria-labels)
  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <ManualRecordingToolbar
            mode="time_trial"
            onModeChange={() => {}}
            isRecording={false}
            recordingCount={0}
            manualMode={false}
            armed={false}
            onStartManual={() => {}}
            onStopManual={() => {}}
            onClear={() => {}}
            onSave={() => {}}
            t={translate}
          />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const idleBadge = host.querySelector('span[role="status"]');
  expect(idleBadge?.textContent).toBe(translate('Idle'));

  // Arm Route button text for time_trial mode
  const armBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(translate('Arm Route')));
  expect(armBtn).toBeDefined();

  // Clear Buffer button aria-label and title
  const clearBtn = host.querySelector('button[aria-label="' + translate('Clear recording buffer') + '"]');
  expect(clearBtn).not.toBeNull();
  expect(clearBtn?.getAttribute('title')).toBe(translate('Clear recording buffer'));
  expect(clearBtn?.textContent).toBe(translate('Clear Buffer'));
});
