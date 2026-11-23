// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassicJdmSettingsCard } from './ClassicJdmSettingsCard';
import {
  CLASSIC_JDM_AUX_GAUGES,
  CLASSIC_JDM_DEFI_THEMES,
  CLASSIC_JDM_TACH_STYLES,
} from './config';

const languages = ['en-us', 'zh-tw', 'ja-jp'] as const;
const dictionaries: Record<(typeof languages)[number], Record<string, string>> = Object.fromEntries(
  languages.map(language => [
    language,
    JSON.parse(readFileSync(new URL('../../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
) as Record<(typeof languages)[number], Record<string, string>>;

const CJK_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff]/;

describe('ClassicJdmSettingsCard localization', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('uses canonical English keys in config arrays with complete trilingual coverage', () => {
    const allLabels = [
      ...CLASSIC_JDM_TACH_STYLES.map(item => item.label),
      ...CLASSIC_JDM_AUX_GAUGES.map(item => item.label),
      ...CLASSIC_JDM_DEFI_THEMES.map(item => item.label),
    ];

    for (const label of allLabels) {
      expect(CJK_PATTERN.test(label)).toBe(false);
      for (const language of languages) {
        expect(dictionaries[language][label]).toBeTypeOf('string');
        expect(dictionaries[language][label].length).toBeGreaterThan(0);
      }
    }
  });

  it.each(languages)('renders localized dropdown options and labels in %s without cross-locale leakage', async (language) => {
    const dict = dictionaries[language];
    const t = (key: string) => dict[key] ?? key;

    await act(async () => {
      root.render(
        <ClassicJdmSettingsCard
          config={{
            classicJdmTachStyle: 'trd',
            classicJdmShowTriple: true,
            classicJdmAux1: 'tire_temp_4w',
            classicJdmAux2: 'tire_temp_rear',
            classicJdmDefiTheme: 'amber',
          }}
          onChange={vi.fn()}
          t={t}
        />,
      );
    });

    const getOptionTexts = (selectId: string) =>
      Array.from(host.querySelectorAll<HTMLOptionElement>(`#${selectId} option`)).map(
        option => option.textContent?.trim() ?? '',
      );

    const tachOptions = getOptionTexts('classic-jdm-tach-style');
    const aux1Options = getOptionTexts('classic-jdm-aux1');
    const aux2Options = getOptionTexts('classic-jdm-aux2');
    const defiThemeOptions = getOptionTexts('classic-jdm-defi-theme');

    expect(tachOptions).toEqual(CLASSIC_JDM_TACH_STYLES.map(style => dict[style.label]));
    expect(aux1Options).toEqual(CLASSIC_JDM_AUX_GAUGES.map(gauge => dict[gauge.label]));
    expect(aux2Options).toEqual(CLASSIC_JDM_AUX_GAUGES.map(gauge => dict[gauge.label]));
    expect(defiThemeOptions).toEqual(CLASSIC_JDM_DEFI_THEMES.map(theme => dict[theme.label]));

    if (language === 'en-us') {
      for (const text of [...tachOptions, ...aux1Options, ...aux2Options, ...defiThemeOptions]) {
        expect(CJK_PATTERN.test(text)).toBe(false);
      }
    } else {
      for (const gauge of CLASSIC_JDM_AUX_GAUGES) {
        expect(dict[gauge.label]).not.toBe(gauge.label);
      }
      for (const theme of CLASSIC_JDM_DEFI_THEMES) {
        expect(dict[theme.label]).not.toBe(theme.label);
      }
    }

    const tripleToggle = host.querySelector<HTMLButtonElement>('#classic-jdm-triple-toggle');
    expect(tripleToggle?.getAttribute('aria-label')).toBe(dict['Triple Aux Gauges']);
    expect(tripleToggle?.getAttribute('aria-pressed')).toBe('true');
    expect(tripleToggle?.textContent?.trim()).toBe(dict['Enabled']);
  });
});
