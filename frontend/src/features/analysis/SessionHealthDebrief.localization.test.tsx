// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionHealthDebrief from './SessionHealthDebrief';
import * as SettingsContextModule from '../../context/SettingsContext';
import type { SessionDebriefData } from './sessionDebriefMath';

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map(language => [
    language,
    JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ])
);

function createTranslator(lang: (typeof languages)[number]) {
  const dict = dictionaries[lang];
  return (text: string, params?: Record<string, string | number>): string => {
    let result = dict[text] ?? text;
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        result = result.replace(`{${key}}`, String(val));
      });
    }
    return result;
  };
}

describe('SessionHealthDebrief localization & accessibility', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it.each(languages)('localizes corner labels, statuses, and signal metrics in %s', async (lang) => {
    const t = createTranslator(lang);
    vi.spyOn(SettingsContextModule, 'useSettings').mockReturnValue({ t } as ReturnType<typeof SettingsContextModule.useSettings>);

    const debrief: SessionDebriefData = {
      total_samples: 1200,
      valid_laps: 3,
      tire_thermals: { fl_avg: 85.4, fr_avg: 87.2, rl_avg: 81.0, rr_avg: 82.1, status: 'Optimal' },
      suspension: { peak_travel_pct: 94.5, bottom_out_count: 2, status: 'Occasional Bottoming' },
      handling_balance: { understeer_pct: 64.2, oversteer_pct: 18.5, tendency: 'Understeer Biased' },
    };

    await act(async () => {
      root.render(<SessionHealthDebrief debrief={debrief} />);
    });

    const text = container.textContent ?? '';
    expect(text).toContain(t('Tire Thermal Balance'));
    expect(text).toContain(t('Optimal'));
    expect(text).toContain(t('Front Left'));
    expect(text).toContain(t('Front Right'));
    expect(text).toContain(t('Rear Left'));
    expect(text).toContain(t('Rear Right'));
    expect(text).not.toMatch(/\b(FL|FR|RL|RR)\b/);

    expect(text).toContain(t('Suspension Utilization'));
    expect(text).toContain(t('Occasional Bottoming'));
    expect(text).toContain(t('Peak Travel'));
    expect(text).toContain(t('Bottom-out Count'));

    expect(text).toContain(t('Cornering Balance'));
    expect(text).toContain(t('Understeer Biased'));
    expect(text).toContain(t('Understeer'));
    expect(text).toContain(t('Oversteer'));

    expect(text).toContain(t('Signal Integrity'));
    expect(text).toContain(t('Valid Laps'));
    expect(text).toContain(t('Total Samples'));

    const decorativeBar = container.querySelector('[aria-hidden="true"]');
    expect(decorativeBar).not.toBeNull();
  });

  it.each(languages)('maps no_data status and renders polite loading status in %s', async (lang) => {
    const t = createTranslator(lang);
    vi.spyOn(SettingsContextModule, 'useSettings').mockReturnValue({ t } as ReturnType<typeof SettingsContextModule.useSettings>);

    const emptyDebrief: SessionDebriefData = {
      total_samples: 0,
      valid_laps: 0,
      tire_thermals: { fl_avg: null, fr_avg: null, rl_avg: null, rr_avg: null, status: 'no_data' },
      suspension: { peak_travel_pct: null, bottom_out_count: null, status: 'no_data' },
      handling_balance: { understeer_pct: null, oversteer_pct: null, tendency: 'no_data' },
    };

    await act(async () => {
      root.render(<SessionHealthDebrief debrief={emptyDebrief} />);
    });

    const text = container.textContent ?? '';
    expect(text).not.toContain('no_data');
    expect(text).toContain(t('No Data'));
    expect(text).toContain(t('Unknown'));

    await act(async () => {
      root.render(<SessionHealthDebrief debrief={emptyDebrief} isLoading={true} />);
    });

    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute('aria-live')).toBe('polite');
    expect(statusEl?.textContent).toContain(t('Analyzing Session Dynamics...'));
  });
});
