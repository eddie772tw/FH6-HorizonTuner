// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '../../context/SettingsContext';
import { ToastProvider } from '../../context/ToastContext';
import { telemetryEmitter } from '../../hooks/useTelemetry';
import { backendFetch } from '../../services/backend';
import ArcSteerGauge from './components/ArcSteerGauge';
import EngineRpmDisplay from './components/EngineRpmDisplay';
import TireRadar from './components/TireRadar';
import VehicleDynamicsDisplay from './components/VehicleDynamicsDisplay';
import TelemetryView from './TelemetryView';

const hudPaused = vi.hoisted(() => vi.fn(() => false));
const carState = vi.hoisted(() => ({ carName: '' }));

vi.mock('@platform/hud', () => ({ useHudTelemetryPaused: () => hudPaused() }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../../hooks/useTelemetry', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useTelemetry')>('../../hooks/useTelemetry');
  return {
    ...actual,
    useTelemetry: () => ({ data: { IsRaceOn: 1, EngineIdleRpm: 900 }, isConnected: true }),
    telemetryEmitter: new EventTarget(),
  };
});
vi.mock('../../context/CarParamsContext', () => ({
  useCarParams: () => ({ carName: carState.carName }),
}));
vi.mock('./components/TelemetryDetailView', () => ({
  default: () => <div data-testid="mock-detail-view" />,
}));

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
type LocaleCode = (typeof languages)[number];

const dictionaries = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
) as Record<LocaleCode, Record<string, string>>;

const NEW_DASHBOARD_KEYS = [
  'Unknown Car',
  'HUD Overlay Active',
  'ENGINE & TRANSMISSION',
  'SPEED',
  'STEER',
  'CENTER',
  'LEFT',
  'RIGHT',
  'CLT',
  'THR',
  'BRK',
  'HBK',
  'INPUT WAVEFORM',
  'POWER',
  'TORQUE',
  'RPM SCATTER TRACE',
  'Top Speed',
  'ANG',
  'RAT',
  'Toggle chart rendering for this section',
] as const;

function setupBackend(initialLanguage: LocaleCode) {
  let activeLanguage: LocaleCode = initialLanguage;
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async (path, init) => {
    if (path === '/api/languages') return response(languages.map((code) => ({ code, name: code })));
    if (path === '/api/settings' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body || '{}')) as { language?: LocaleCode };
      if (body.language) activeLanguage = body.language;
      return response({ ok: true, language: activeLanguage });
    }
    if (path === '/api/settings') return response({ language: activeLanguage });
    if (path.startsWith('/api/languages/')) {
      const code = path.slice('/api/languages/'.length) as LocaleCode;
      return response(dictionaries[code]);
    }
    throw new Error('Unexpected request: ' + path);
  });
}

function LanguageSwitchControls() {
  const { updateSettings } = useSettings();
  return (
    <div>
      {languages.map((code) => (
        <button key={code} type="button" data-lang={code} onClick={() => void updateSettings({ language: code })}>
          {code}
        </button>
      ))}
    </div>
  );
}

describe('Live Telemetry Dashboard localization & a11y', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    hudPaused.mockReturnValue(false);
    carState.carName = '';
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: (entries: { target: Element; contentRect: { width: number; height: number } }[]) => void) {}
        observe(target: Element) {
          this.cb([{ target, contentRect: { width: 280, height: 140 } }]);
        }
        disconnect() {}
      },
    );
    const canvasContext = new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'getLineDash') return () => [];
          if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
          return () => {};
        },
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as CanvasRenderingContext2D);
    vi.mocked(backendFetch).mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderWithSettings(language: LocaleCode, children: ReactNode) {
    setupBackend(language);
    await act(async () => {
      root.render(
        <ToastProvider>
          <SettingsProvider>
            <LanguageSwitchControls />
            {children}
          </SettingsProvider>
        </ToastProvider>,
      );
    });
  }

  it('aligns all new dashboard keys and fixes Japanese/Traditional Chinese terminology regressions', () => {
    for (const locale of languages) {
      for (const key of NEW_DASHBOARD_KEYS) {
        expect(dictionaries[locale]).toHaveProperty(key);
        expect(dictionaries[locale][key].trim().length).toBeGreaterThan(0);
      }
    }
    expect(dictionaries['zh-tw']['Boost']).toBe('增壓');
    expect(dictionaries['ja-jp']['Boost']).toBe('ブースト');
    expect(dictionaries['ja-jp']['Driver Inputs & Engine']).toBe('ドライバー入力とエンジン');
    expect(dictionaries['ja-jp']['Driver Inputs & Engine']).not.toContain('駆動入力');
    expect(dictionaries['ja-jp']['Can be toggled in HUD Control Panel']).not.toBe('Can be toggled in HUD Control Panel');
    expect(dictionaries['ja-jp']['Telemetry rendering paused (HUD Overlay is active)']).not.toBe(
      'Telemetry rendering paused (HUD Overlay is active)',
    );
  });

  it.each(languages)('localizes EngineRpmDisplay and TireRadar labels and tooltips in %s', async (locale) => {
    const dict = dictionaries[locale];
    await renderWithSettings(
      locale,
      <>
        <EngineRpmDisplay />
        <TireRadar title={dict['Front Left']} isLeft tireIdx={0} />
      </>,
    );

    const text = host.textContent ?? '';
    expect(text).toContain(dict['ENGINE & TRANSMISSION']);
    expect(text).toContain(dict['GEAR']);
    expect(text).toContain(dict['SPEED']);
    expect(text).toContain(dict['ANG']);
    expect(text).toContain(dict['RAT']);

    const titles = Array.from(host.querySelectorAll('span[title]')).map((el) => el.getAttribute('title'));
    expect(titles).toContain(dict['Slip Angle']);
    expect(titles).toContain(dict['Slip Ratio']);
  });

  it('localizes ArcSteerGauge directions and updates existing readings immediately when language changes', async () => {
    await renderWithSettings('en-us', <ArcSteerGauge />);

    const direction = () => host.querySelector('.telemetry-steer-gauge__direction')?.textContent;
    expect(direction()).toBe(dictionaries['en-us']['STEER']);

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: { IsRaceOn: 1, SteerInput: -63.5 } }));
    });
    expect(direction()).toBe(dictionaries['en-us']['LEFT']);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[data-lang="zh-tw"]')!.click();
    });
    expect(direction()).toBe(dictionaries['zh-tw']['LEFT']);

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: { IsRaceOn: 1, SteerInput: 63.5 } }));
    });
    expect(direction()).toBe(dictionaries['zh-tw']['RIGHT']);

    await act(async () => {
      telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: { IsRaceOn: 1, SteerInput: 0 } }));
    });
    expect(direction()).toBe(dictionaries['zh-tw']['CENTER']);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[data-lang="ja-jp"]')!.click();
    });
    expect(direction()).toBe(dictionaries['ja-jp']['CENTER']);
  });

  it('localizes VehicleDynamicsDisplay Boost/Regen/Top Speed and preserves EV Regen label on language switch', async () => {
    await renderWithSettings('en-us', <VehicleDynamicsDisplay />);

    expect(host.textContent).toContain(dictionaries['en-us']['Boost']);
    expect(host.textContent).toContain(dictionaries['en-us']['Top Speed']);

    await act(async () => {
      telemetryEmitter.dispatchEvent(
        new CustomEvent('update', {
          detail: {
            CarOrdinal: 77,
            IsRaceOn: 1,
            EngineIdleRpm: 0,
            PowerWatts: -45000,
            TorqueNewtons: -120,
            SpeedMetersPerSecond: 40,
          },
        }),
      );
    });
    expect(host.textContent).toContain(dictionaries['en-us']['Regen']);
    expect(host.textContent).toContain(dictionaries['en-us']['ON']);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[data-lang="ja-jp"]')!.click();
    });
    expect(host.textContent).toContain(dictionaries['ja-jp']['Regen']);
    expect(host.textContent).toContain(dictionaries['ja-jp']['Top Speed']);
    expect(host.textContent).not.toContain(dictionaries['ja-jp']['Boost']);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[data-lang="zh-tw"]')!.click();
    });
    expect(host.textContent).toContain(dictionaries['zh-tw']['Regen']);
    expect(host.textContent).toContain(dictionaries['zh-tw']['Top Speed']);
  });

  it.each(languages)('localizes TelemetryView dashboard cards, pedal bars, traces, switches, and HUD pause popover in %s', async (locale) => {
    const dict = dictionaries[locale];
    hudPaused.mockReturnValue(true);
    carState.carName = 'Unknown Car';

    await renderWithSettings(locale, <TelemetryView />);

    const text = host.textContent ?? '';
    expect(text).toContain(dict['Unknown Car']);
    expect(text).toContain(dict['HUD Overlay Active']);
    expect(text).toContain(dict['PAUSED']);
    expect(text).toContain(dict['Telemetry rendering paused (HUD Overlay is active)']);
    expect(text).toContain(dict['Can be toggled in HUD Control Panel']);
    expect(text).toContain(dict['Driver Inputs & Engine']);
    expect(text).toContain(dict['CLT']);
    expect(text).toContain(dict['THR']);
    expect(text).toContain(dict['BRK']);
    expect(text).toContain(dict['HBK']);
    expect(text).toContain(dict['INPUT WAVEFORM']);
    expect(text).toContain(dict['POWER']);
    expect(text).toContain(dict['TORQUE']);
    expect(text).toContain(dict['RPM SCATTER TRACE']);

    if (locale !== 'en-us') {
      expect(text).not.toContain('Unknown Car');
      expect(text).not.toContain('Telemetry rendering paused (HUD Overlay is active)');
      expect(text).not.toContain('Can be toggled in HUD Control Panel');
    }

    const switches = Array.from(host.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
    expect(switches.map((sw) => sw.getAttribute('aria-label'))).toEqual([
      `${dict['Toggle chart rendering for this section']}: ${dict['Live Telemetry Traces']}`,
      `${dict['Toggle chart rendering for this section']}: ${dict['Vehicle Dynamics Overview']}`,
      `${dict['Toggle chart rendering for this section']}: ${dict['Tire Grip & Status']}`,
      `${dict['Toggle chart rendering for this section']}: ${dict['Suspension Travel']}`,
    ]);
  });
});
