// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '../../context/SettingsContext';
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

  type ToolbarProps = Omit<React.ComponentProps<typeof ManualRecordingToolbar>, 't'>;
  function Toolbar(props: ToolbarProps) {
    const { t } = useSettings();
    return <ManualRecordingToolbar {...props} t={t} />;
  }
  const label = (key: string) => dictionaries[language][key] ?? key;

  // 1. Test isRecording + manualMode (parameterized badge)
  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <Toolbar
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
          />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const recordingBadge = host.querySelector('.badge');
  expect(recordingBadge).not.toBeNull();
  expect(recordingBadge?.textContent).toBe(label('Manual Recording ({count} samples)').replace('{count}', '42'));

  expect(host.querySelector('[role="status"]')?.textContent).toBe(label('Manual Recording'));

  // 2. Test auto recording mode
  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <Toolbar
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
          />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const autoBadge = host.querySelector('.badge');
  expect(autoBadge?.textContent).toBe(label('Auto Recording ({count} samples)').replace('{count}', '128'));

  const saveButton = host.querySelector('button[title="' + label('Save current recording to backend') + '"]');
  expect(saveButton?.textContent).toBe(label('Save Current'));

  // 3. Test idle & buttons accessibility (Save Current and Clear Buffer aria-labels)
  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <Toolbar
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
          />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const idleBadge = host.querySelector('.badge');
  expect(idleBadge?.textContent).toBe(label('Idle'));

  // Arm Route button text for time_trial mode
  const armBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(label('Arm Route')));
  expect(armBtn).toBeDefined();

  // Clear Buffer button aria-label and title
  const clearBtn = host.querySelector('button[title="' + label('Clear recording buffer') + '"]');
  expect(clearBtn).not.toBeNull();
  expect(clearBtn?.getAttribute('title')).toBe(label('Clear recording buffer'));
  expect(clearBtn?.textContent).toBe(label('Clear Buffer'));
});
