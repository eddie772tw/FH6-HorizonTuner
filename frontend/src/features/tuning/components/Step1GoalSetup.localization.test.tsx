// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../../context/SettingsContext';
import { ToastProvider } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';
import { Step1GoalSetup } from './Step1GoalSetup';

vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));
const languages = ['en-us', 'ja-jp', 'zh-tw'];
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(languages.map(language => [
  language, JSON.parse(readFileSync(new URL('../../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
]));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(backendFetch).mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it.each(languages)('uses readable tire quantity and unit names with the real SettingsProvider in %s', async language => {
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async path => {
    if (path === '/api/languages') return response(languages.map(code => ({ code, name: code })));
    if (path === '/api/settings') return response({ language });
    if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
    throw new Error('Unexpected request: ' + path);
  });
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
