// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';
import TuningTelemetryCaptureView from './TuningTelemetryCaptureView';

const mockCaptureState = {
  status: 'idle',
  metadata: {
    label: 'Test Capture',
    notes: 'Test notes',
    purpose: '',
    gameBuild: '',
    installedParts: '',
    tireType: '',
    surface: '',
    weather: '',
    eventType: '',
    track: '',
    shareCode: '',
    driverAssists: '',
  },
  sampleCount: 0,
  activeCapture: null,
  revision: 0,
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  setMetadata: vi.fn(),
};

vi.mock('../TuneSessionProvider', () => ({
  useTuneSession: () => ({
    capture: mockCaptureState,
  }),
}));

vi.mock('../../../hooks/useFileSave', () => ({
  useFileSave: () => ({
    save: vi.fn(),
    isSaving: false,
  }),
}));

vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));

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
  mockCaptureState.status = 'idle';
  mockCaptureState.sampleCount = 0;
  mockCaptureState.activeCapture = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function CaptureViewWrapper(props: { onBack: () => void }) {
  const { t } = useSettings();
  return <TuningTelemetryCaptureView t={t} onBack={props.onBack} />;
}

it.each(languages)('renders parameterized badge and accessible button labels in %s', async language => {
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async path => {
    if (path === '/api/languages') return response(languages.map(code => ({ code, name: code })));
    if (path === '/api/settings') return response({ language });
    if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
    throw new Error('Unexpected request: ' + path);
  });

  const label = (key: string) => dictionaries[language][key] ?? key;

  // 1. Test capturing status with 42 samples
  mockCaptureState.status = 'capturing';
  mockCaptureState.sampleCount = 42;

  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <CaptureViewWrapper onBack={() => {}} />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const badge = host.querySelector('.badge[role="status"]');
  expect(badge).not.toBeNull();
  expect(badge?.getAttribute('aria-live')).toBe('polite');
  expect(badge?.textContent).toBe(label('Capturing · {count} samples').replace('{count}', '42'));

  // Stop button should have accessible label in capturing state
  const stopBtn = host.querySelector('button[aria-label="' + label('Stop Capture') + '"]');
  expect(stopBtn).not.toBeNull();
  expect(stopBtn?.textContent).toBe(label('Stop Capture'));

  // Clear button aria-label
  const clearBtn = host.querySelector('button[aria-label="' + label('Clear capture buffer') + '"]');
  expect(clearBtn).not.toBeNull();
  expect(clearBtn?.textContent).toBe(label('Clear'));

  // Back button aria-label
  const backBtn = host.querySelector('button[aria-label="' + label('Back to Developer Tuning') + '"]');
  expect(backBtn).not.toBeNull();
  expect(backBtn?.textContent).toBe(label('Back to Developer Tuning'));

  // 2. Test invalidated status
  mockCaptureState.status = 'invalidated';
  mockCaptureState.sampleCount = 88;

  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <CaptureViewWrapper onBack={() => {}} />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const invalidatedBadge = host.querySelector('.badge[role="status"]');
  expect(invalidatedBadge?.textContent).toBe(label('Invalidated · {count} samples').replace('{count}', '88'));

  // 3. Test idle status & Start button
  mockCaptureState.status = 'idle';
  mockCaptureState.sampleCount = 0;

  await act(async () => {
    root.render(
      <ToastProvider>
        <SettingsProvider>
          <CaptureViewWrapper onBack={() => {}} />
        </SettingsProvider>
      </ToastProvider>
    );
  });

  const idleBadge = host.querySelector('.badge[role="status"]');
  expect(idleBadge?.textContent).toBe(label('Idle · {count} samples').replace('{count}', '0'));

  const startBtn = host.querySelector('button[aria-label="' + label('Start Capture') + '"]');
  expect(startBtn).not.toBeNull();
  expect(startBtn?.textContent).toBe(label('Start Capture'));

  // Download buttons
  const downloadJsonBtn = host.querySelector('button[aria-label="' + label('Download JSON') + '"]');
  expect(downloadJsonBtn).not.toBeNull();
  expect(downloadJsonBtn?.textContent).toBe(label('Download JSON'));

  const downloadCsvBtn = host.querySelector('button[aria-label="' + label('Download CSV') + '"]');
  expect(downloadCsvBtn).not.toBeNull();
  expect(downloadCsvBtn?.textContent).toBe(label('Download CSV'));
});
