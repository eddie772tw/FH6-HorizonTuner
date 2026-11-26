// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import ToastContainer from '../../components/common/ToastContainer';
import DragTestView from './DragTestView';
import { backendFetch } from '../../services/backend';

const languages = ['en-us', 'zh-tw', 'ja-jp'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
);

function createTranslator(language: (typeof languages)[number]) {
  const dict = dictionaries[language];
  return (text: string, params?: Record<string, string | number>): string => {
    let result = dict[text] ?? text;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(`{${key}}`, () => String(value));
      }
    }
    return result;
  };
}

let currentLanguage: (typeof languages)[number] = 'en-us';
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    t: createTranslator(currentLanguage),
    convertSpeed: (v: number) => ({ value: v * 3.6, label: 'km/h' }),
  }),
}));

vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box,
    LineChart: Box,
    Line: ({ name }: { name?: string }) => <div data-testid="recharts-line" data-name={name ?? ''} />,
    XAxis: ({ name }: { name?: string }) => <div data-testid="recharts-xaxis" data-name={name ?? ''} />,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: ({ labelFormatter }: { labelFormatter?: (label: number) => string }) => (
      <div data-testid="recharts-tooltip" data-label={labelFormatter ? labelFormatter(1.2345) : ''} />
    ),
    Legend: () => null,
  };
});

const NEW_KEYS = [
  'RUN CONDITIONS READY',
  'Drag Launch Conditions',
  '1. Bring car to a complete stop (0 km/h).',
  '2. Press throttle (> 5%) to automatically trigger run timing.',
  'Saving data in progress...',
  'RECORDING ({count} pts)',
  'Are you sure you want to delete session "{name}"?',
  'Detected significant path deviation ({meters}m).',
  "Click the 'Start Test' button above.",
  'Time: {seconds}s',
  'Compare Speed ({car})',
  'Compare RPM ({car})',
  'Compare Slip Diff ({car})',
] as const;

const REPAIRED_KEYS = [
  'After RPM',
  'All gear ratios step smoothly. No significant RPM drops detected.',
  'Before RPM',
  'Car Model',
  'Compare RPM',
  'Drag session saved successfully',
  'Drag Test',
  'Drag Test Analysis',
  'Final Drive Ratio',
  'How to perform a Drag Test:',
  'Metrics',
  'RECORDING',
  'Retention',
  'RPM Drop',
  'Shift',
] as const;

const sample = [
  {
    time: 0,
    SpeedMetersPerSecond: 10,
    CurrentEngineRpm: 3000,
    Gear: 1,
    AccelInput: 255,
    BrakeInput: 0,
    TorqueNewtons: 300,
    PowerWatts: 100000,
    TireSlipRatio: [0.01, 0.02, 0.05, 0.06],
  },
];

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

describe('DragTestView localization', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    currentLanguage = 'en-us';
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('defines all Drag Test keys across en-us, zh-tw, and ja-jp and replaces stale mistranslations', () => {
    for (const key of [...NEW_KEYS, ...REPAIRED_KEYS]) {
      for (const language of languages) {
        expect(dictionaries[language]).toHaveProperty(key);
        expect(typeof dictionaries[language][key]).toBe('string');
        expect(dictionaries[language][key].trim().length).toBeGreaterThan(0);
      }
      expect(dictionaries['zh-tw'][key]).not.toBe(key);
      expect(dictionaries['ja-jp'][key]).not.toBe(key);
    }

    expect(dictionaries['ja-jp']['Final Drive Ratio']).toBe('ファイナルドライブ比');
    expect(dictionaries['ja-jp']['Before RPM']).toBe('シフト前回転数');
    expect(dictionaries['ja-jp']['After RPM']).toBe('シフト後回転数');
    expect(dictionaries['ja-jp']['RPM Drop']).toBe('回転数低下');
    expect(dictionaries['ja-jp']['Retention']).toBe('回転数維持率');
    expect(dictionaries['ja-jp']['Compare RPM']).toBe('比較回転数');
    expect(dictionaries['ja-jp']['RECORDING']).toBe('記録中');
    expect(dictionaries['ja-jp']['How to perform a Drag Test:']).not.toContain('線形加速テスト');
    expect(dictionaries['ja-jp']['Shift']).toBe('シフト');
  });

  it.each(languages)('renders localized conditions, recording status, charts, and tables in %s', async (language) => {
    currentLanguage = language;
    const t = createTranslator(language);

    let dragStatus: 'idle' | 'recording' | 'finished' = 'idle';
    let pointsCount = 0;

    const currentAnalysis = {
      car_name: 'Supra RZ',
      drivetrain: 'AWD',
      max_gear: 6,
      max_speed_kmh: 240,
      duration: 8.5,
      launch_slip_percent: 6,
      launch_recommendation: 'Launch grip is balanced.',
      shifts: [
        {
          from_gear: 1,
          to_gear: 2,
          n_before: 7800,
          n_after: 5400,
          rpm_drop: 2400,
          retention: 0.692,
          shift_time: 0.18,
        },
      ],
      shift_recommendations: [],
      final_drive_recommendation: 'Final drive looks optimal.',
      path_valid: false,
      max_deviation_meters: 14.2,
      yaw_variance_rad: 0.02,
      stability_diagnostics: [],
    };

    const compareSessionA = {
      data: sample,
      analysis: {
        ...currentAnalysis,
        car_name: 'GT-R $& Spec',
        drivetrain: 'RWD',
        max_speed_kmh: 235,
        duration: 8.8,
      },
    };

    const compareSessionUnknown = {
      data: sample,
      analysis: {
        ...currentAnalysis,
        car_name: '',
        drivetrain: 'FWD',
      },
    };

    vi.mocked(backendFetch).mockImplementation(async (path, init) => {
      if (path === '/api/drag/status') return json({ status: dragStatus, points_count: pointsCount });
      if (path === '/api/drag/sessions') {
        return json([
          { filename: 'run_$&_1.json', timestamp: 1700000000, car_name: 'GT-R $& Spec', max_speed_kmh: 235 },
          { filename: 'run_unknown.json', timestamp: 1700000100, car_name: '', max_speed_kmh: 210 },
        ]);
      }
      if (path === '/api/drag/sessions/save' && init?.method === 'POST') return json({ message: 'Saved' });
      if (path === '/api/drag/sessions/run_$&_1.json') return json(compareSessionA);
      if (path === '/api/drag/sessions/run_unknown.json') return json(compareSessionUnknown);
      if (path === '/api/drag/data') return json(sample);
      return json(currentAnalysis);
    });

    const render = async (key: string) => {
      await act(async () => root.render(
        <ToastProvider key={key}>
          <ToastContainer />
          <DragTestView />
        </ToastProvider>,
      ));
      await act(async () => {});
    };

    // 1. Idle: launch conditions dialog, guide instruction alignment, literal delete prompt
    await render('idle');
    const readyBadge = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === t('RUN CONDITIONS READY'),
    )!;
    expect(readyBadge).toBeDefined();
    await act(async () => readyBadge.click());

    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(t('Drag Launch Conditions'));
    expect(dialog.textContent).toContain(t('1. Bring car to a complete stop (0 km/h).'));
    expect(dialog.textContent).toContain(t('2. Press throttle (> 5%) to automatically trigger run timing.'));
    expect(host.textContent).toContain(t("Click the 'Start Test' button above."));
    expect(Array.from(host.querySelectorAll('button')).some((btn) => btn.textContent?.trim() === t('Start Test'))).toBe(true);

    const compareSelect = host.querySelector<HTMLSelectElement>('#drag-test-compare-session')!;
    await act(async () => {
      compareSelect.value = 'run_$&_1.json';
      compareSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});

    const deleteTrigger = host.querySelector<HTMLButtonElement>(`button[aria-label="${t('Delete selected session')}"]`)!;
    await act(async () => deleteTrigger.click());
    const expectedDeletePrompt = t('Are you sure you want to delete session "{name}"?').replace(
      '{name}',
      () => 'run_$&_1.json',
    );
    expect(host.querySelector('[id$="-delete-confirm-label"]')?.textContent).toBe(expectedDeletePrompt);

    // 2. Recording: polite status badge with count & hidden decorative REC ring
    dragStatus = 'recording';
    pointsCount = 420;
    await render('recording');
    const statusBanner = host.querySelector('[role="status"][aria-live="polite"]');
    expect(statusBanner?.textContent).toContain(t('RECORDING ({count} pts)', { count: 420 }));
    const recRing = host.querySelector('.pulse-ring');
    expect(recRing?.getAttribute('aria-hidden')).toBe('true');

    // 3. Finished + comparison + charts + shift table + save toast
    dragStatus = 'finished';
    pointsCount = 600;
    await render('finished');

    const pathAlert = host.querySelector('[role="alert"]');
    expect(pathAlert?.textContent).toContain(
      t('Detected significant path deviation ({meters}m).', { meters: 14.2 }),
    );

    await act(async () => {
      const sel = host.querySelector<HTMLSelectElement>('#drag-test-compare-session')!;
      sel.value = 'run_$&_1.json';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});

    expect(host.textContent).toContain(t('Metrics'));
    expect(host.textContent).toContain(t('Car Model'));
    expect(host.textContent).toContain(t('AWD'));
    expect(host.textContent).toContain(t('RWD'));

    expect(host.querySelector('[data-testid="recharts-xaxis"]')?.getAttribute('data-name')).toBe(t('Time'));
    expect(host.querySelector('[data-testid="recharts-tooltip"]')?.getAttribute('data-label')).toBe(
      t('Time: {seconds}s', { seconds: (1.2345).toFixed(3) }),
    );
    const speedLineNames = Array.from(host.querySelectorAll('[data-testid="recharts-line"]')).map((el) =>
      el.getAttribute('data-name'),
    );
    expect(speedLineNames).toContain(t('Compare Speed ({car})').replace('{car}', () => 'GT-R $& Spec'));
    expect(speedLineNames).toContain(t('Compare RPM ({car})').replace('{car}', () => 'GT-R $& Spec'));

    const slipTab = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (btn) => btn.textContent?.trim() === t('Tire Slip'),
    )!;
    await act(async () => slipTab.click());

    expect(host.querySelector('[data-testid="recharts-xaxis"]')?.getAttribute('data-name')).toBe(t('Time'));
    expect(host.querySelector('[data-testid="recharts-tooltip"]')?.getAttribute('data-label')).toBe(
      t('Time: {seconds}s', { seconds: (1.2345).toFixed(3) }),
    );
    const slipLineNames = Array.from(host.querySelectorAll('[data-testid="recharts-line"]')).map((el) =>
      el.getAttribute('data-name'),
    );
    expect(slipLineNames).toContain(t('Compare Slip Diff ({car})').replace('{car}', () => 'GT-R $& Spec'));

    // Blank car_name fallback -> t('Unknown')
    await act(async () => {
      const sel = host.querySelector<HTMLSelectElement>('#drag-test-compare-session')!;
      sel.value = 'run_unknown.json';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});
    const unknownLineNames = Array.from(host.querySelectorAll('[data-testid="recharts-line"]')).map((el) =>
      el.getAttribute('data-name'),
    );
    expect(unknownLineNames).toContain(t('Compare Slip Diff ({car})').replace('{car}', () => t('Unknown')));

    expect(host.textContent).toContain(t('Shift'));
    expect(host.textContent).toContain(t('Before RPM'));
    expect(host.textContent).toContain(t('After RPM'));
    expect(host.textContent).toContain(t('RPM Drop'));
    expect(host.textContent).toContain(t('Retention'));
    expect(host.textContent).toContain(t('Final Drive Ratio'));
    if (language === 'ja-jp') {
      expect(host.textContent).toContain('シフト');
      expect(host.textContent).toContain('シフト前回転数');
      expect(host.textContent).toContain('シフト後回転数');
      expect(host.textContent).toContain('回転数低下');
      expect(host.textContent).toContain('回転数維持率');
      expect(host.textContent).toContain('ファイナルドライブ比');
    }

    const saveBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === t('Save Test'),
    )!;
    await act(async () => saveBtn.click());
    await act(async () => {});
    const toastText = host.querySelector('[role="status"]:not([aria-live="polite"])')?.textContent
      ?? host.textContent
      ?? '';
    expect(toastText).toContain(t('Drag session saved successfully'));
    if (language !== 'en-us') {
      expect(toastText).not.toContain('Drag session saved successfully');
    }
  });
});
