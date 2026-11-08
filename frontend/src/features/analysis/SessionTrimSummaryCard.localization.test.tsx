// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SessionTrimSummaryCard from './SessionTrimSummaryCard';
import type { SessionTrimSummaryCardProps } from './SessionTrimSummaryCard';

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map(language => [
    language,
    JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ])
);

function createTranslator(lang: 'en-us' | 'ja-jp' | 'zh-tw') {
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

describe('SessionTrimSummaryCard localization & accessibility', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it.each(languages)('renders translated card headers and labels in %s', async (lang) => {
    const t = createTranslator(lang);
    const root = createRoot(container);

    const props: SessionTrimSummaryCardProps = {
      metadata: {
        recording_mode: 'circuit',
        lap_time_source: 'game',
        trim_analysis: {
          head_trim_seconds: 1.2,
          tail_trim_seconds: 2.5,
          raw_sample_count: 500,
          trimmed_sample_count: 480,
        },
      },
      showRawData: false,
      onToggleRawData: () => {},
      exportRawData: false,
      onToggleExportRawData: () => {},
      t,
    };

    await act(async () => {
      root.render(<SessionTrimSummaryCard {...props} />);
    });

    // Header & Section title
    expect(container.textContent).toContain(t('Session Analysis & Trimming'));
    expect(container.textContent).toContain(t('Circuit'));
    expect(container.textContent).toContain(t('In-Game Timing'));
    expect(container.textContent).toContain(t('Trimmed View'));
    expect(container.textContent).toContain(t('Export Raw Data Without Trimming'));
    expect(container.textContent).toContain(t('Lead-in Trim'));
    expect(container.textContent).toContain(t('Post-Stop Trim'));
    expect(container.textContent).toContain(t('Valid Samples'));

    // Accessible valid sample ratio label
    const sampleRatioEl = container.querySelector('[aria-label]');
    expect(sampleRatioEl).not.toBeNull();
    expect(sampleRatioEl?.getAttribute('aria-label')).toBe(
      t('{valid} of {total} samples valid', { valid: 480, total: 500 })
    );

    // Switch accessibility
    const switchInput = container.querySelector('#rawViewToggle') as HTMLInputElement | null;
    expect(switchInput).not.toBeNull();
    expect(switchInput?.getAttribute('role')).toBe('switch');
    expect(switchInput?.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      root.unmount();
    });
  });

  it.each(languages)('translates various recording modes and calculated timing source in %s', async (lang) => {
    const t = createTranslator(lang);
    const root = createRoot(container);

    const props: SessionTrimSummaryCardProps = {
      metadata: {
        recording_mode: 'time_trial',
        lap_time_source: 'calculated',
        route_name: 'Sprint Alpha',
        trim_analysis: {
          head_trim_seconds: 0.5,
          tail_trim_seconds: 0.8,
          raw_sample_count: 300,
          trimmed_sample_count: 290,
        },
      },
      showRawData: true,
      onToggleRawData: () => {},
      exportRawData: true,
      onToggleExportRawData: () => {},
      t,
    };

    await act(async () => {
      root.render(<SessionTrimSummaryCard {...props} />);
    });

    expect(container.textContent).toContain(t('Time Trial'));
    expect(container.textContent).toContain(t('Calculated Timing'));
    expect(container.textContent).toContain(t('Raw View (Untrimmed)'));
    expect(container.textContent).toContain('Sprint Alpha');

    const switchInput = container.querySelector('#rawViewToggle') as HTMLInputElement | null;
    expect(switchInput?.getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      root.unmount();
    });
  });
});
