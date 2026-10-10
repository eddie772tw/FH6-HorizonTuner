// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { SettingsProvider } from '../../context/SettingsContext';
import { ToastProvider } from '../../context/ToastContext';
import { backendFetch } from '../../services/backend';
import CompanionTuning from './CompanionTuning';
import type { CompanionIntent, CompanionState } from './companionProtocol';

vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));

const languages = ['en-us', 'ja-jp', 'zh-tw'];
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(languages.map(language => [
  language, JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
]));
function snapshot(): CompanionState {
  return {
    hostOnline: true, revision: 1, commands: [], snapshot: {
      carId: '42', carName: 'Synthetic localization fixture', profileKey: 'synthetic-only',
      profile: { weight: 1200, weight_distribution: 50, maxHp: 250 } as CarParams,
      workflow: { step: 1, goal: 'Road', season: 'Summer' },
      results: { chassis: null, alignment: null, gearing: null },
      engine: { phase: 'idle', sampleCount: 0, state: null },
      readiness: { mechanical: true, engineInputs: true, measuredEngine: false, gearingAvailable: false },
      calculationStatus: 'ready',
    },
  };
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(backendFetch).mockReset();
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it.each(languages)('renders readable Companion labels with the actual SettingsProvider in %s and preserves commands', async language => {
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  vi.mocked(backendFetch).mockImplementation(async path => {
    if (path === '/api/languages') return response(languages.map(code => ({ code, name: code })));
    if (path === '/api/settings') return response({ language });
    if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
    throw new Error('Unexpected request: ' + path);
  });
  const onCommand = vi.fn(async (_command: CompanionIntent) => true);
  const render = async (state: CompanionState | null, disabled = false) => act(async () => root.render(
    <ToastProvider><SettingsProvider><CompanionTuning state={state} disabled={disabled} onCommand={onCommand} /></SettingsProvider></ToastProvider>,
  ));
  const label = (key: string) => dictionaries[language][key];
  await render(null);
  expect(host.querySelector('h2')!.textContent).toBe(label('companion.waiting_title'));
  expect(host.textContent).toContain(label('companion.waiting_desc'));

  const state = snapshot();
  await render(state);
  expect(host.textContent).not.toContain('companion.');
  expect([...host.querySelectorAll('nav button')].map(button => button.textContent)).toEqual(
    ['Setup', 'Chassis', 'Alignment', 'Engine', 'Gearing'].map(section => label('companion.sections.' + section)),
  );
  expect(host.querySelector('nav')!.getAttribute('aria-label')).toBe(label('companion.tuning_sections'));
  const select = host.querySelectorAll<HTMLSelectElement>('.companion-workflow-controls select');
  expect(select[0].selectedOptions[0].textContent).toBe(label('companion.Road'));
  expect(select[1].selectedOptions[0].textContent).toBe(label('companion.Summer'));
  expect(host.textContent).toContain(label('companion.weight'));
  expect(host.textContent).toContain(label('companion.apply_hint'));
  expect(host.querySelector('[role="status"]')!.textContent).toBe(label('companion.measurement_missing'));
  for (const status of ['pending', 'error'] as const) {
    state.snapshot!.calculationStatus = status;
    await render(state);
    expect(host.querySelector('[role="status"]')!.textContent).toBe(label('companion.readiness_' + status));
  }
  state.snapshot!.calculationStatus = 'ready';
  await render(state, true);
  expect([...host.querySelectorAll<HTMLSelectElement>('.companion-workflow-controls select')].every(element => element.disabled)).toBe(true);
  expect(host.querySelector<HTMLInputElement>('.companion-profile-body input')!.disabled).toBe(true);
  expect(onCommand).not.toHaveBeenCalled();
  await render(state);
  for (const [index, value] of [[0, 'Rally'], [1, 'Winter']] as const) {
    await act(async () => {
      select[index].value = value;
      select[index].dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  expect(onCommand.mock.calls.map(call => call[0])).toEqual([
    { kind: 'workflow', goal: 'Rally' }, { kind: 'workflow', season: 'Winter' },
  ]);
  const weight = host.querySelector<HTMLInputElement>('.companion-profile-body input')!;
  const editWeight = async () => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(weight, '1300');
    weight.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await editWeight();
  expect(host.textContent).toContain(label('companion.unsaved_draft'));
  const apply = host.querySelector<HTMLButtonElement>('.companion-profile-body button.btn-primary')!;
  expect(apply.disabled).toBe(false);
  await act(async () => apply.click());
  expect(onCommand).toHaveBeenLastCalledWith({ kind: 'profile', patch: { weight: 1300 } });
  await editWeight();
  state.snapshot!.carId = '43';
  await render(state);
  expect(apply.disabled).toBe(true);
  expect(host.textContent).toContain(label('companion.pc_vehicle_params_changed'));
  await act(async () => apply.click());
  expect(onCommand).toHaveBeenCalledTimes(3);
  if (language === 'en-us') {
    expect(vi.mocked(backendFetch).mock.calls.some(([path]) => path === '/api/languages/en-us')).toBe(false);
  }
});
