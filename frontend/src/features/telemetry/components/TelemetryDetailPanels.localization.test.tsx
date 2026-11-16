// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';
import type { TelemetryHistorySample } from '../telemetryHistory';
import TelemetryDetailView from './TelemetryDetailView';

const sampleHistory: TelemetryHistorySample[] = [
  {
    timestampMs: 1000,
    timeSeconds: 1.0,
    suspension: [0.2, 0.25, 0.3, 0.35],
    tireTemp: [85, 86, 82, 83],
    slipRatio: [0.02, 0.03, 0.04, 0.05],
    slipAngle: [0.01, 0.02, 0.03, 0.04],
    combinedSlip: [0.03, 0.04, 0.05, 0.06],
    surfaceRumble: [0.1, 0.1, 0.12, 0.12],
    acceleration: [1.0, 9.8, 2.0],
    pitch: 0.02,
    roll: -0.03,
    yaw: 0.15,
    speedMetersPerSecond: 30,
    rpm: 4500,
    powerWatts: 180000,
    torqueNewtons: 380,
    boost: 100000,
    gear: 3,
    steerInput: 10,
    accelInput: 200,
    brakeInput: 0,
    clutchInput: 0,
    handBrakeInput: 0,
  },
  {
    timestampMs: 1500,
    timeSeconds: 1.5,
    suspension: [0.22, 0.27, 0.32, 0.37],
    tireTemp: [86, 87, 83, 84],
    slipRatio: [0.03, 0.04, 0.05, 0.06],
    slipAngle: [0.02, 0.03, 0.04, 0.05],
    combinedSlip: [0.04, 0.05, 0.06, 0.07],
    surfaceRumble: [0.11, 0.11, 0.13, 0.13],
    acceleration: [1.2, 9.8, 2.5],
    pitch: 0.03,
    roll: -0.02,
    yaw: 0.18,
    speedMetersPerSecond: 34,
    rpm: 5000,
    powerWatts: 195000,
    torqueNewtons: 400,
    boost: 110000,
    gear: 3,
    steerInput: 12,
    accelInput: 220,
    brakeInput: 0,
    clutchInput: 0,
    handBrakeInput: 0,
  },
];

vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../telemetryHistory', async () => {
  const actual = await vi.importActual<typeof import('../telemetryHistory')>('../telemetryHistory');
  return {
    ...actual,
    useTelemetryHistory: () => sampleHistory,
  };
});

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(readFileSync(new URL('../../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
);

describe('TelemetryDetailPanels localization & accessibility', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.mocked(backendFetch).mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderInLanguage(language: (typeof languages)[number], cardId: 'suspension' | 'tires' | 'dynamics') {
    const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    vi.mocked(backendFetch).mockImplementation(async (path) => {
      if (path === '/api/languages') return response(languages.map((code) => ({ code, name: code })));
      if (path === '/api/settings') return response({ language });
      if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
      throw new Error('Unexpected request: ' + path);
    });

    await act(async () =>
      root.render(
        <ToastProvider>
          <SettingsProvider>
            <TelemetryDetailView cardId={cardId} current={null} />
          </SettingsProvider>
        </ToastProvider>,
      ),
    );
  }

  it.each(languages)('localizes suspension & tire detail chart titles, legends, and corner labels in %s', async (language) => {
    const dict = dictionaries[language];
    await renderInLanguage(language, 'suspension');

    expect(host.textContent).toContain(dict['Pitch']);
    expect(host.textContent).toContain(dict['Roll']);
    expect(host.textContent).toContain(dict['Suspension Travel Trend']);

    const suspensionLegends = host.querySelectorAll('.telemetry-detail-view__chart-legend');
    expect(suspensionLegends.length).toBe(1);
    expect(suspensionLegends[0].getAttribute('aria-label')).toBe(dict['Chart legend']);
    for (const corner of ['Front Left', 'Front Right', 'Rear Left', 'Rear Right']) {
      expect(suspensionLegends[0].textContent).toContain(dict[corner]);
    }
    if (language !== 'en-us') {
      expect(suspensionLegends[0].textContent).not.toContain('FL');
      expect(suspensionLegends[0].textContent).not.toContain('FR');
    }

    await renderInLanguage(language, 'tires');
    for (const key of ['Tire Temperature Trend', 'Slip Ratio Trend', 'Slip Angle Trend', 'Combined Slip Trend', 'Surface Rumble Trend']) {
      expect(host.textContent).toContain(dict[key]);
    }
    const tireLegends = host.querySelectorAll('.telemetry-detail-view__chart-legend');
    expect(tireLegends.length).toBe(5);
    for (const legend of tireLegends) {
      expect(legend.getAttribute('aria-label')).toBe(dict['Chart legend']);
    }

    await renderInLanguage(language, 'dynamics');
    for (const key of ['Pitch', 'Roll', 'Yaw', 'Orientation Trend']) {
      expect(host.textContent).toContain(dict[key]);
    }
    const dynamicsLegends = host.querySelectorAll('.telemetry-detail-view__chart-legend');
    expect(dynamicsLegends.length).toBe(6);
    expect(dynamicsLegends[1].textContent).toContain(dict['Yaw']);
  });
});
