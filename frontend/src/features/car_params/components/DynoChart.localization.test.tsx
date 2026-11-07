// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynoChart } from './DynoChart';
import type { CarParams } from '../../../context/CarParamsContext';

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

describe('DynoChart localization & accessibility', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const dummyCarParams: CarParams = {
    weight: 1400,
    aeroEfficiency: 0,
    dyno_curve: {},
    isElectric: false,
    weight_distribution: 50,
    drivetrain: 'RWD',
    induction: 'NA',
    maxHp: 400,
    maxHpRpm: 7000,
    maxTorque: 450,
    maxTorqueRpm: 5000,
    frontTireWidth: 245,
    frontTireAspect: 40,
    frontTireRim: 18,
    rearTireWidth: 275,
    rearTireAspect: 35,
    rearTireRim: 18,
    adjustability: {
      gears: 6,
      gearbox: 'Full',
      suspension: 'Race',
      arb: 'Adjustable',
      aero: 'Adjustable',
      brakes: 'Adjustable',
      diff: 'Adjustable',
    },
    dyno_quality: undefined,
  };

  it.each(languages)('renders accessible gear selector and localized gear options in %s', async lang => {
    const t = createTranslator(lang);
    const updateSettings = vi.fn();

    await act(async () => {
      root.render(
        <DynoChart
          t={t}
          settings={{
            dyno_recording: true,
            dyno_test_gear: 4,
            dyno_filter_slip: true,
            dyno_filter_transients: true,
          }}
          updateSettings={updateSettings}
          carParams={dummyCarParams}
          telemetryData={{ Gear: 4, CurrentEngineRpm: 4500, AccelInput: 255 }}
          testState="ready"
          runDuration={null}
          recommendedGear={{ gear: 4, ratio: 1.05 }}
          showClearConfirm={false}
          setShowClearConfirm={vi.fn()}
          clearDynoCurve={vi.fn()}
          dynoData={[]}
          getPowerLabel={() => 'HP'}
          getTorqueLabel={() => 'N·m'}
        />
      );
    });

    const expectedAriaLabel = dictionaries[lang]['Target Test Gear'] ?? 'Target Test Gear';
    const gearSelect = container.querySelector<HTMLSelectElement>(`select[aria-label="${expectedAriaLabel}"]`);
    expect(gearSelect).not.toBeNull();

    const options = Array.from(gearSelect!.querySelectorAll('option'));
    expect(options).toHaveLength(11); // 0 (Free run) + 10 gears

    // Option 0: Any gear
    const anyGearLabel = dictionaries[lang]['Any Gear (Free Run)'] ?? 'Any Gear (Free Run)';
    expect(options[0].textContent).toBe(anyGearLabel);

    // Option 1 & 4
    if (lang === 'zh-tw') {
      expect(options[1].textContent).toBe('1 檔');
      expect(options[4].textContent).toBe('4 檔');
    } else if (lang === 'ja-jp') {
      expect(options[1].textContent).toBe('1速');
      expect(options[4].textContent).toBe('4速');
      // Verify prevention of the previous mistranslation: "1 ファイル"
      expect(options[1].textContent).not.toContain('ファイル');
    } else {
      expect(options[1].textContent).toBe('Gear 1');
      expect(options[4].textContent).toBe('Gear 4');
    }

    // Recommended gear parameterization test
    const expectedRecPrefix = dictionaries[lang]['Recommended Test Gear: {gear} (Ratio: {ratio}, closest to 1.00)'] ?? '';
    if (expectedRecPrefix) {
      expect(container.textContent).toContain('1.05');
    }
  });

  it.each(languages)('interpolates run duration parameters in completed state in %s', async lang => {
    const t = createTranslator(lang);

    await act(async () => {
      root.render(
        <DynoChart
          t={t}
          settings={{
            dyno_recording: true,
            dyno_test_gear: 4,
            dyno_filter_slip: true,
            dyno_filter_transients: true,
          }}
          updateSettings={vi.fn()}
          carParams={dummyCarParams}
          telemetryData={{ Gear: 4, CurrentEngineRpm: 7200, AccelInput: 255 }}
          testState="completed"
          runDuration={5.5}
          recommendedGear={null}
          showClearConfirm={false}
          setShowClearConfirm={vi.fn()}
          clearDynoCurve={vi.fn()}
          dynoData={[]}
          getPowerLabel={() => 'HP'}
          getTorqueLabel={() => 'N·m'}
        />
      );
    });

    // 5.5s is optimal (between 3.0 and 12.0)
    expect(container.textContent).toContain('5.5');
    if (lang === 'zh-tw') {
      expect(container.textContent).toContain('拉轉時間極佳 (5.5 秒)');
    } else if (lang === 'ja-jp') {
      expect(container.textContent).toContain('プル時間が最適です (5.5 秒)');
    } else {
      expect(container.textContent).toContain('Run duration optimal (5.5s)');
    }
  });
});
