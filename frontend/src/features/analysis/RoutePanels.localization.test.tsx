// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import ToastContainer from '../../components/common/ToastContainer';
import { AnalysisRouteSection, type AnalysisRouteSectionProps } from './AnalysisRouteSection';
import { RoamingRoutePanel } from './RoamingRoutePanel';
import type { CustomRoute } from './routeTriggerMath';

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
    let result = language === 'en-us' ? (dict[text] ?? text) : (dict[text] ?? text);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(`{${key}}`, String(value));
      }
    }
    return result;
  };
}

let currentLanguage: (typeof languages)[number] = 'en-us';
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ t: createTranslator(currentLanguage) }),
}));

const REQUIRED_KEYS = [
  'Free Roam Point-to-Point Route Configuration',
  'Time Trial Closed Circuit Gate Configuration',
  'Import Route',
  'Export Route',
  'Select Route',
  '+ Create New Route',
  'Route Name',
  'e.g. Mountain Pass Run',
  'e.g. Goliath Sprint Lap',
  'Start Gate (Departure)',
  'Finish Gate (Arrival)',
  'Capture Live',
  'Capture Live - {gate}',
  'Radius',
  'Timing Gate (Start / Finish Sphere)',
  'Capture Current Car Position',
  'Trigger Radius',
  'Save Route',
  'Delete',
  'Cancel',
  'Disarm Route',
  'Arm Route for Timing',
  'No live telemetry position available',
  'Untitled Free Roam Route',
  'Untitled Time Trial',
  'Invalid route configuration',
  'Route name is required',
  'Invalid route mode',
  'Start coordinates (X, Y, Z) are required and must be finite numbers',
  'Start radius must be between 5.0m and 50.0m',
  'End coordinates (X, Y, Z) are required for roaming mode',
  'End radius must be between 5.0m and 50.0m',
  'Are you sure you want to delete this route?',
  'Are you sure you want to delete route "{name}"?',
  'Delete {name}',
  'Route deleted.',
  'Failed to delete route.',
] as const;

describe('Analysis route panels localization', () => {
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

  it('defines all route panel keys across en-us, zh-tw, and ja-jp without untranslated English placeholders', () => {
    for (const key of REQUIRED_KEYS) {
      for (const language of languages) {
        expect(dictionaries[language]).toHaveProperty(key);
        expect(typeof dictionaries[language][key]).toBe('string');
        expect(dictionaries[language][key].trim().length).toBeGreaterThan(0);
      }
      expect(dictionaries['zh-tw'][key]).not.toBe(key);
      expect(dictionaries['ja-jp'][key]).not.toBe(key);
    }
  });

  it.each(languages)('renders localized roaming and time-trial route panels, validation errors, and delete flows in %s', async (language) => {
    currentLanguage = language;
    const t = createTranslator(language);

    const roamingRoute: CustomRoute = {
      route_id: 'roam-1',
      name: 'Mountain Pass',
      mode: 'roaming',
      start_x: 10,
      start_y: 5,
      start_z: 20,
      start_radius: 15,
      end_x: 100,
      end_y: 12,
      end_z: -50,
      end_radius: 20,
    };
    const timeTrialRoute: CustomRoute = {
      route_id: 'tt-1',
      name: 'Goliath Sprint',
      mode: 'time_trial',
      start_x: 120,
      start_y: 8,
      start_z: -45,
      start_radius: 18,
    };

    const baseProps: Omit<AnalysisRouteSectionProps, 'activeMode'> = {
      routes: [roamingRoute, timeTrialRoute],
      selectedRouteId: null,
      isArmed: false,
      isRecording: false,
      armedRouteId: null,
      liveTelemetry: null,
      onSelectRoute: vi.fn(),
      onSaveRoute: vi.fn(async () => true),
      onDeleteRoute: vi.fn(async () => true),
      onArmRoute: vi.fn(async () => true),
      onDisarmRoute: vi.fn(async () => true),
      onImportRoutes: vi.fn(async () => undefined),
      onExportRoute: vi.fn(),
      t,
    };

    await act(async () => root.render(
      <ToastProvider key="roaming-capture">
        <ToastContainer />
        <AnalysisRouteSection {...baseProps} activeMode="roaming" selectedRouteId="roam-1" isArmed={false} />
      </ToastProvider>,
    ));

    expect(host.querySelector('h6')?.textContent).toBe(t('Free Roam Point-to-Point Route Configuration'));
    expect(host.querySelector('label[for$="-select"]')?.textContent).toBe(t('Select Route'));
    expect(host.querySelector('option[value=""]')?.textContent).toBe(t('+ Create New Route'));
    expect(host.querySelector('label[for$="-name"]')?.textContent).toBe(t('Route Name'));
    expect(host.querySelector('input[id$="-name"]')?.getAttribute('placeholder')).toBe(t('e.g. Mountain Pass Run'));
    expect(host.textContent).toContain(t('Import Route'));
    expect(host.textContent).toContain(t('Export Route'));
    expect(host.textContent).toContain(t('Start Gate (Departure)'));
    expect(host.textContent).toContain(t('Finish Gate (Arrival)'));
    expect(host.textContent).toContain(t('Radius'));
    expect(host.textContent).toContain(t('Save Route'));
    expect(host.textContent).toContain(t('Arm Route for Timing'));

    const captureButtons = Array.from(host.querySelectorAll('button')).filter(
      (btn) => btn.textContent?.trim() === t('Capture Live'),
    );
    expect(captureButtons.map((btn) => btn.getAttribute('aria-label'))).toEqual([
      t('Capture Live - {gate}', { gate: t('Start Gate (Departure)') }),
      t('Capture Live - {gate}', { gate: t('Finish Gate (Arrival)') }),
    ]);

    await act(async () => captureButtons[0].click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(t('No live telemetry position available'));
    if (language !== 'en-us') {
      expect(host.querySelector('[role="alert"]')?.textContent).not.toContain('No live telemetry position available');
    }

    await act(async () => root.render(
      <ToastProvider key="roaming-armed">
        <ToastContainer />
        <AnalysisRouteSection {...baseProps} activeMode="roaming" selectedRouteId="roam-1" isArmed={true} armedRouteId="roam-1" />
      </ToastProvider>,
    ));
    expect(host.textContent).toContain(t('Disarm Route'));

    const invalidRadiusRoute: CustomRoute = { ...roamingRoute, route_id: 'roam-invalid', start_radius: 1 };
    await act(async () => root.render(
      <ToastProvider key="roaming-invalid-radius">
        <ToastContainer />
        <RoamingRoutePanel
          {...baseProps}
          routes={[invalidRadiusRoute]}
          selectedRouteId="roam-invalid"
          armedRouteId={null}
          onArmRoute={vi.fn(async () => true)}
        />
      </ToastProvider>,
    ));
    const saveButton = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === t('Save Route'),
    )!;
    await act(async () => saveButton.click());
    const validationAlert = host.querySelector('[role="alert"]')?.textContent ?? '';
    expect(validationAlert).toContain(t('Start radius must be between 5.0m and 50.0m'));
    if (language !== 'en-us') {
      expect(validationAlert).not.toContain('Start radius must be between 5.0m and 50.0m');
    }

    let deleteOk = true;
    const onDeleteRoute = vi.fn(async () => deleteOk);
    await act(async () => root.render(
      <ToastProvider key="tt-delete-ok">
        <ToastContainer />
        <AnalysisRouteSection
          {...baseProps}
          activeMode="time_trial"
          selectedRouteId="tt-1"
          onDeleteRoute={onDeleteRoute}
        />
      </ToastProvider>,
    ));

    expect(host.querySelector('h6')?.textContent).toBe(t('Time Trial Closed Circuit Gate Configuration'));
    expect(host.querySelector('label[for$="-select"]')?.textContent).toBe(t('Select Route'));
    expect(host.querySelector('input[id$="-name"]')?.getAttribute('placeholder')).toBe(t('e.g. Goliath Sprint Lap'));
    expect(host.textContent).toContain(t('Timing Gate (Start / Finish Sphere)'));
    expect(host.textContent).toContain(t('Capture Current Car Position'));
    expect(host.textContent).toContain(t('Trigger Radius'));

    const deleteTrigger = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('Delete {name}', { name: 'Goliath Sprint' })}"]`,
    );
    expect(deleteTrigger).not.toBeNull();
    await act(async () => deleteTrigger!.click());

    const confirmText = t('Are you sure you want to delete route "{name}"?', { name: 'Goliath Sprint' });
    expect(host.textContent).toContain(confirmText);
    if (language === 'ja-jp') {
      expect(deleteTrigger!.getAttribute('aria-label')).toBe('Goliath Sprint を削除');
      expect(confirmText).toBe('ルート「Goliath Sprint」を削除してもよろしいですか？');
    }

    const confirmButton = host.querySelector<HTMLButtonElement>('[role="group"] button.btn-danger')!;
    await act(async () => confirmButton.click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain(t('Route deleted.'));

    deleteOk = false;
    await act(async () => root.render(
      <ToastProvider key="tt-delete-fail">
        <ToastContainer />
        <AnalysisRouteSection
          {...baseProps}
          activeMode="time_trial"
          selectedRouteId="tt-1"
          onDeleteRoute={onDeleteRoute}
        />
      </ToastProvider>,
    ));
    await act(async () => host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('Delete {name}', { name: 'Goliath Sprint' })}"]`,
    )!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[role="group"] button.btn-danger')!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(t('Failed to delete route.'));
  });
});
