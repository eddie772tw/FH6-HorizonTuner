// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import type { CarParams } from '../../../context/CarParamsContext';
import type { ChassisTuningResult, StaticTireAlignResult, Season } from '../../../domain/tuning/types';
import { backendFetch } from '../../../services/backend';
import { Step2ChassisTuner } from './Step2ChassisTuner';

vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));

const languages = ['en-us', 'zh-tw', 'ja-jp'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(readFileSync(new URL('../../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
);

const sampleCarParams: CarParams = {
  weight: 1350,
  weight_distribution: 54,
  drivetrain: 'AWD',
  induction: 'Turbo',
  maxHp: 520,
  maxTorque: 600,
  maxHpRpm: 7200,
  maxTorqueRpm: 4800,
  aeroEfficiency: 0.5,
  dyno_curve: {},
  adjustability: {
    gears: 6,
    gearbox: 'Full',
    suspension: 'Race',
    arb: 'Adjustable',
    aero: 'Fixed',
    brakes: 'Adjustable',
    diff: 'Adjustable',
  },
};

const sampleChassis: ChassisTuningResult = {
  arb: { front: 26.4, rear: 29.8 },
  springs: { front: 142.5, rear: 128.0, heightF: 12.2, heightR: 12.8 },
  damping: { reboundF: 10.4, reboundR: 9.6, bumpF: 6.4, bumpR: 5.9 },
  diff: { accelF: 35, decelF: 10, accelR: 70, decelR: 25, centerRear: 65 },
};

const sampleAlignment: StaticTireAlignResult = {
  pcF: 28.5,
  pcR: 28.0,
  targetPhot: 32.5,
  seasonBias: -0.5,
  camber: { front: -1.4, rear: -0.9 },
  toe: { front: '0.0', rear: '-0.1' },
  caster: 6.2,
  hwF: 98,
  hwR: 103,
};

function mockBackendForLanguage(language: string) {
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async (path) => {
    if (path === '/api/languages') return response(languages.map((code) => ({ code, name: code })));
    if (path === '/api/settings') return response({ language });
    if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
    throw new Error('Unexpected request: ' + path);
  });
}

describe('Step2ChassisTuner localization', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.mocked(backendFetch).mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it.each(languages)('localizes Step 2 heading, summary, cards, badge, and AWD split in %s', async (language) => {
    mockBackendForLanguage(language);

    await act(async () => {
      root.render(
        <ToastProvider>
          <SettingsProvider>
            <Step2ChassisTuner
              selectedRaceGoal="Rally"
              season="Winter"
              carParams={sampleCarParams}
              chassis={sampleChassis}
              alignment={sampleAlignment}
              saveCarParams={async () => {}}
            />
          </SettingsProvider>
        </ToastProvider>,
      );
    });

    const heading = host.querySelector('h3')?.textContent?.trim();
    const text = host.textContent ?? '';
    const dict = dictionaries[language];

    expect(heading).toBe(dict['Step 2: Chassis, suspension & tire recommendations']);

    if (language === 'en-us') {
      expect(text).toContain('Calculated for Rally / Off-Road profile · 1350 kg (54% front) AWD · Season: Winter');
      expect(text).toContain('65% Rear');
    } else if (language === 'zh-tw') {
      expect(heading).toBe('步驟 2：底盤、懸吊與輪胎建議');
      expect(text).toContain('依據 拉力／越野 目標計算 · 1350 kg（前配重 54%）AWD (四驅) · 季節：冬季');
      expect(text).toContain('後軸 65%');
      expect(text).not.toContain('Step 2:');
      expect(text).not.toContain('% F)');
      expect(text).not.toContain('Tires & Wheel Alignment');
      expect(text).not.toContain('Suspension Platform');
      expect(text).not.toContain('Damping & Differential');
      expect(text).not.toContain('Center Rear Split');
    } else {
      expect(heading).toBe('ステップ 2: シャシー・サスペンション・タイヤ推奨設定');
      expect(text).toContain('ラリー / オフロード プロファイル基準 · 1350 kg（フロント荷重 54%）AWD（四輪駆動） · 季節：冬');
      expect(text).toContain('リア 65%');
      expect(text).not.toContain('Step 2:');
      expect(text).not.toContain('% F)');
      expect(text).not.toContain('Tires & Wheel Alignment');
      expect(text).not.toContain('Front Cold Pressure');
      expect(text).not.toContain('Suspension Platform');
      expect(text).not.toContain('Damping & Differential');
      expect(text).not.toContain('Center Rear Split');
    }
  });

  it('uses accurate Japanese racing discipline labels instead of literal machine translations', async () => {
    mockBackendForLanguage('ja-jp');

    const cases: Array<{ goal: string; season: Season; expectedGoal: string }> = [
      { goal: 'Road', season: 'Summer', expectedGoal: 'ロード / サーキット' },
      { goal: 'Drift', season: 'Autumn', expectedGoal: 'ドリフト' },
      { goal: 'Rally', season: 'Winter', expectedGoal: 'ラリー / オフロード' },
      { goal: 'Drag', season: 'Spring', expectedGoal: 'ドラッグ' },
    ];

    for (const { goal, season, expectedGoal } of cases) {
      await act(async () => {
        root.render(
          <ToastProvider>
            <SettingsProvider>
              <Step2ChassisTuner
                selectedRaceGoal={goal}
                season={season}
                carParams={sampleCarParams}
                chassis={sampleChassis}
                alignment={sampleAlignment}
                saveCarParams={async () => {}}
              />
            </SettingsProvider>
          </ToastProvider>,
        );
      });
      const text = host.textContent ?? '';
      expect(text).toContain(expectedGoal);
      expect(text).not.toContain('フリック');
      expect(text).not.toContain('引く');
      expect(text).not.toContain('高速道路');
      expect(text).not.toContain('直線加速度');
    }

    expect(dictionaries['ja-jp']['Road']).toBe('ロード');
    expect(dictionaries['ja-jp']['Rally']).toBe('ラリー');
    expect(dictionaries['ja-jp']['Drift']).toBe('ドリフト');
    expect(dictionaries['ja-jp']['Drag']).toBe('ドラッグ');
  });
});
