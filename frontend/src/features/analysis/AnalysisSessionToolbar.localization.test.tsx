// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AnalysisSessionToolbar from './AnalysisSessionToolbar';
import type { AnalysisSessionToolbarProps } from './AnalysisSessionToolbar';

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

describe('AnalysisSessionToolbar localization & accessibility', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it.each(languages)('renders parameterized status and translated buttons in %s', async (lang) => {
    const t = createTranslator(lang);
    const root = createRoot(container);

    const defaultProps: AnalysisSessionToolbarProps = {
      t,
      isRecording: false,
      recordingCount: 0,
      activeSessionLength: 120,
      selectedFilename: 'session_20261107.csv',
      savedSessions: [
        {
          filename: 'session_20261107.csv',
          session_id: 'session-1',
          car_name: 'Porsche 911 GT3',
          total_laps: 5,
          best_lap_time: 84.32,
          size: 1024,
          mtime: 1700000000,
        },
      ],
      lapsList: [
        {
          lap_number: 1,
          lap_time: 84.32,
          start_distance: 0,
          end_distance: 4000,
          max_speed_kmh: 245,
          avg_speed_kmh: 180,
          is_estimated: false,
        },
      ],
      primaryLap: 1,
      compareLap: -1,
      isSavedSelection: true,
      motecActionMsg: null,
      isExporting: false,
      fileInputRef: { current: null },
      onSelectSession: () => {},
      onSelectPrimaryLap: () => {},
      onSelectCompareLap: () => {},
      onOpenInMoTec: () => {},
      onExportMoTec: () => {},
      onImportFile: () => {},
      onOpenImport: () => {},
      onDownloadTemplate: () => {},
      onOpenChannelMapping: () => {},
      onDeleteSession: () => {},
      onCloseMessage: () => {},
      onLatestAnalysis: () => {},
    };

    await act(async () => {
      root.render(<AnalysisSessionToolbar {...defaultProps} />);
    });

    const statusContainer = container.querySelector('.analysis-toolbar__status');
    expect(statusContainer).not.toBeNull();
    expect(statusContainer?.getAttribute('role')).toBe('status');
    expect(statusContainer?.getAttribute('aria-live')).toBe('polite');

    // Verify Idle parameterized status
    const expectedIdle = t('Idle ({count} samples)', { count: 120 });
    expect(statusContainer?.textContent).toContain(expectedIdle);

    // Verify Loaded session parameterized string
    const expectedLoaded = t('Loaded Session: {filename}', { filename: 'session_20261107.csv' });
    expect(statusContainer?.textContent).toContain(expectedLoaded);

    // Verify select elements accessibility and localized option labels
    const sessionSelect = container.querySelector('select[aria-label="' + t('Select Session') + '"]');
    expect(sessionSelect).not.toBeNull();
    expect(sessionSelect?.textContent).toContain(
      t('{car} ({laps} Laps | Best: {best})', { car: 'Porsche 911 GT3', laps: 5, best: '84.32s' })
    );

    const primaryLapSelect = container.querySelector('select[aria-label="' + t('Primary Lap') + '"]');
    expect(primaryLapSelect).not.toBeNull();
    expect(primaryLapSelect?.textContent).toContain(
      t('Lap {lap} ({time} | Max: {maxSpeed})', { lap: 1, time: '84.32s', maxSpeed: '245 km/h' })
    );

    const compareLapSelect = container.querySelector('select[aria-label="' + t('Compare Lap') + '"]');
    expect(compareLapSelect).not.toBeNull();
    expect(compareLapSelect?.textContent).toContain(
      t('vs Lap {lap} ({time})', { lap: 1, time: '84.32s' })
    );

    // Verify action buttons translation
    const motecLdBtn = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === t('MoTeC .ld Export (Experimental)')
    );
    expect(motecLdBtn).toBeDefined();

    const csvExportBtn = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === t('CSV Export')
    );
    expect(csvExportBtn).toBeDefined();

    const motecImportBtn = container.querySelector('button[aria-label="' + t('MoTeC CSV Import') + '"]');
    expect(motecImportBtn).not.toBeNull();

    const channelMappingBtn = container.querySelector('button[aria-label="' + t('Channel Mapping') + '"]');
    expect(channelMappingBtn).not.toBeNull();

    const deleteBtn = container.querySelector('button[aria-label="' + t('Delete selected session') + '"]');
    expect(deleteBtn).not.toBeNull();

    // Now re-render with recording active
    await act(async () => {
      root.render(<AnalysisSessionToolbar {...defaultProps} isRecording={true} recordingCount={42} />);
    });

    const expectedRecording = t('Recording... ({count} samples)', { count: 42 });
    expect(statusContainer?.textContent).toContain(expectedRecording);

    // Verify estimated and missing values avoid raw unit concatenation (e.g. Unknowns / Unknownkm/h)
    await act(async () => {
      root.render(
        <AnalysisSessionToolbar
          {...defaultProps}
          savedSessions={[
            {
              filename: 'session_empty.csv',
              session_id: 'session-empty',
              car_name: 'Mazda MX-5',
              total_laps: 0,
              best_lap_time: 0,
              size: 512,
              mtime: 1700000100,
            },
          ]}
          lapsList={[
            {
              lap_number: 2,
              lap_time: 91.5,
              start_distance: 0,
              end_distance: 3500,
              max_speed_kmh: null,
              avg_speed_kmh: null,
              is_estimated: true,
            },
            {
              lap_number: 3,
              lap_time: null,
              start_distance: 3500,
              end_distance: 4000,
              max_speed_kmh: null,
              avg_speed_kmh: null,
              is_estimated: true,
            },
          ]}
        />
      );
    });

    expect(sessionSelect?.textContent).toContain(
      t('{car} ({laps} Laps | Best: {best})', { car: 'Mazda MX-5', laps: 0, best: t('Unknown') })
    );
    expect(primaryLapSelect?.textContent).toContain(
      t('Lap {lap} ({time} | Max: {maxSpeed})', {
        lap: 2,
        time: `${t('Estimated')} 91.50s`,
        maxSpeed: t('Unknown'),
      })
    );
    expect(primaryLapSelect?.textContent).toContain(
      t('Lap {lap} ({time} | Max: {maxSpeed})', {
        lap: 3,
        time: t('Unknown'),
        maxSpeed: t('Unknown'),
      })
    );
    expect(compareLapSelect?.textContent).toContain(
      t('vs Lap {lap} ({time})', { lap: 2, time: `${t('Estimated')} 91.50s` })
    );
    expect(sessionSelect?.textContent).not.toContain(`${t('Unknown')}s`);
    expect(primaryLapSelect?.textContent).not.toContain(`${t('Unknown')}s`);
    expect(primaryLapSelect?.textContent).not.toContain(`${t('Unknown')}km/h`);

    for (const invalid of [0, -1, Number.NaN, Infinity, -Infinity]) {
      await act(async () => root.render(
        <AnalysisSessionToolbar {...defaultProps}
          savedSessions={[{ ...defaultProps.savedSessions[0], best_lap_time: invalid }]}
          lapsList={[{ ...defaultProps.lapsList[0], lap_time: invalid, max_speed_kmh: -1, is_estimated: true }]} />
      ));
      expect(sessionSelect?.textContent).toContain(t('Unknown'));
      expect(primaryLapSelect?.textContent).toContain(t('Lap {lap} ({time} | Max: {maxSpeed})', {
        lap: 1, time: t('Unknown'), maxSpeed: t('Unknown'),
      }));
      expect(compareLapSelect?.textContent).toContain(t('vs Lap {lap} ({time})', { lap: 1, time: t('Unknown') }));
    }
    await act(async () => root.unmount());
  });
});
