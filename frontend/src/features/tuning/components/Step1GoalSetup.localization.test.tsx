// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarParams } from '../../../context/CarParamsContext';
import { SettingsProvider } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';
import { Step1GoalSetup } from './Step1GoalSetup';

vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../TuneSessionProvider', () => ({
  useTuneSession: () => ({ result: { chassis: { diff: { centerRear: 65 } } } }),
}));
const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(languages.map(language => [
  language, JSON.parse(readFileSync(new URL('../../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
]));
const emptyProfile: CarParams = {
  weight: 0,
  weight_distribution: undefined as unknown as number,
  drivetrain: 'AWD',
  induction: 'NA',
  maxHp: 0,
  maxTorque: 0,
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
const mockLanguageBackend = (language: string) => {
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async path => {
    if (path === '/api/languages') return response(languages.map(code => ({ code, name: code })));
    if (path === '/api/settings') return response({ language });
    if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
    throw new Error('Unexpected request: ' + path);
  });
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(backendFetch).mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it.each(languages)('uses readable tire quantity and unit names with the real SettingsProvider in %s', async language => {
  mockLanguageBackend(language);
  await act(async () => root.render(<ToastProvider><SettingsProvider>
    <Step1GoalSetup measuredEngineInputs selectedRaceGoal="Road" setSelectedRaceGoal={() => {}} season="Summer"
      setSeason={() => {}} carParams={null} updateParam={() => {}} hasCoreParams={false}
      onOpenUnitSettings={() => {}} onProceed={async () => {}} />
  </SettingsProvider></ToastProvider>));
  for (const axle of ['front', 'rear']) {
    for (const [field, quantity, unit] of [['Width', 'tire width (mm)', 'mm'], ['Aspect', 'tire aspect (%)', '%'], ['Rim', 'rim (in)', 'in']]) {
      const source = `${axle === 'front' ? 'Front' : 'Rear'} ${quantity}`;
      const label = host.querySelector(`#step1-${axle}Tire${field}`)!.getAttribute('aria-label');
      expect(label).toBe(language === 'en-us' ? source : dictionaries[language][source]);
      expect(label).not.toContain('companion.');
      if (language === 'en-us') expect(label).toContain(unit);
    }
  }
});

describe('Step1GoalSetup localization', () => {
  it.each(languages)('localizes Step 1 heading, placeholders, labels, and NA option in %s', async language => {
    mockLanguageBackend(language);
    await act(async () => root.render(<ToastProvider><SettingsProvider>
      <Step1GoalSetup measuredEngineInputs selectedRaceGoal="Drift" setSelectedRaceGoal={() => {}} season="Summer"
        setSeason={() => {}} carParams={emptyProfile} updateParam={() => {}} hasCoreParams={false}
        onOpenUnitSettings={() => {}} onProceed={async () => {}} />
    </SettingsProvider></ToastProvider>));

    const dict = dictionaries[language];
    const heading = host.querySelector('h3')?.textContent?.trim();
    const text = host.textContent ?? '';
    expect(heading).toBe(dict['Step 1: Define tuning goals & check parameters']);

    const expectedPrefix = language === 'en-us' ? 'e.g. ' : language === 'zh-tw' ? '例如：' : '例: ';
    expect(host.querySelector('#step1-weight')?.getAttribute('placeholder')).toBe(`${expectedPrefix}1350`);
    expect(host.querySelector('#step1-weight_distribution')?.getAttribute('placeholder')).toBe(`${expectedPrefix}52.0`);
    expect(host.querySelector('#step1-maxHp')?.getAttribute('placeholder')).toBe(`${expectedPrefix}450`);
    expect(host.querySelector('#step1-maxTorque')?.getAttribute('placeholder')).toBe(`${expectedPrefix}520`);

    const naOption = host.querySelector('#step1-induction option[value="NA"]')?.textContent?.trim();
    expect(naOption).toBe(dict['Naturally Aspirated (NA)']);

    for (const key of [
      'Goal & Environment',
      'Setup Prior',
      'Current Season:',
      'Core Physics & Drivetrain',
      'Vehicle Specs',
      'Weight Distribution',
      'Drivetrain',
      'Gears Count',
      'Induction Type',
      'Max Power',
      'Front Spring Range',
      'Rear Spring Range',
      'Front Height Range',
      'Rear Height Range',
      'Auto',
      'Front Tire (Width mm / % R in)',
      'Rear Tire (Width mm / % R in)',
    ]) {
      expect(text).toContain(dict[key]);
    }

    if (language === 'zh-tw') {
      expect(heading).not.toContain('Step 1:');
      expect(text).toContain('前後配重');
      expect(text).toContain('最大輸出');
      expect(text).not.toContain('Weight Distribution');
      expect(text).not.toContain('Max Power');
      expect(text).not.toContain('Goal & Environment');
      expect(text).not.toContain('Setup Prior');
      expect(text).not.toContain('Vehicle Specs');
    } else if (language === 'ja-jp') {
      expect(heading).not.toContain('Step 1:');
      expect(text).toContain('ギア数');
      expect(text).toContain('駆動方式');
      expect(text).toContain('フロントスプリング範囲');
      expect(text).toContain('リア車高範囲');
      expect(text).not.toContain('屋台の数');
      expect(text).not.toContain('ドライブの種類');
      expect(text).not.toContain('フロントスプリング領域');
      expect(text).not.toContain('リア車高領域');
      expect(text).not.toContain('Weight Distribution');
      expect(text).not.toContain('Max Power');
      expect(text).not.toContain('Goal & Environment');
      expect(text).not.toContain('Setup Prior');
      expect(text).not.toContain('Vehicle Specs');
    }
  });

  it('localizes Rally surface, EV switch, and Road AWD split subcomponents in ja-jp', async () => {
    mockLanguageBackend('ja-jp');
    await act(async () => root.render(<ToastProvider><SettingsProvider>
      <Step1GoalSetup measuredEngineInputs selectedRaceGoal="Rally" setSelectedRaceGoal={() => {}} season="Summer"
        setSeason={() => {}} carParams={{ ...emptyProfile, isElectric: true }} updateParam={() => {}} hasCoreParams
        onOpenUnitSettings={() => {}} onProceed={async () => {}} />
    </SettingsProvider></ToastProvider>));
    const rallyEvText = host.textContent ?? '';
    expect(rallyEvText).toContain('ラリー路面プロファイル');
    expect(rallyEvText).toContain('混合路面ラリー');
    expect(rallyEvText).toContain('クロスカントリー / 悪路');
    expect(rallyEvText).toContain('EV パワートレイン');
    expect(rallyEvText).toContain('EV はギア別の個別計測とギア比計算を使用します。ステップ 3 でゲーム内の現在のギア比を入力してください。');

    await act(async () => root.render(<ToastProvider><SettingsProvider>
      <Step1GoalSetup measuredEngineInputs selectedRaceGoal="Road" setSelectedRaceGoal={() => {}} season="Summer"
        setSeason={() => {}} carParams={{ ...emptyProfile, isElectric: false, roadAwdRearPercent: 65 }} updateParam={() => {}} hasCoreParams
        onOpenUnitSettings={() => {}} onProceed={async () => {}} />
    </SettingsProvider></ToastProvider>));
    const roadText = host.textContent ?? '';
    expect(roadText).toContain('ロード AWD トルク配分を上書き');
    expect(roadText).toContain('後輪へのトルク配分 (%)');
  });
});
