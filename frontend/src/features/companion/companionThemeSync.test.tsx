// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';
import { defaultThemeSettings } from '../../context/themeSettings';
import { coreThemeEntries } from '../../context/themeCatalog';
import { backendFetch } from '../../services/backend';
import { useCompanionSession } from './useCompanionSession';
import { readCompanionThemeBootstrap, receiveCompanionTheme, COMPANION_THEME_CACHE } from './companionTheme';
import CompanionTuning from './CompanionTuning';
import type { CompanionState } from './companionProtocol';
import type { CarParams } from '../../context/CarParamsContext';

vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (value: string) => value }) }));
const fetcher = vi.mocked(backendFetch);
const visual = { schemaVersion: 1 as const, mode: 'light' as const, halfmoonCore: 'swiss' as const, primaryColor: '#123456', secondaryColor: '#abcdef', accentColor: '#987654' };
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const initial: CompanionState = {
  hostOnline: true, revision: 7, commands: [],
  snapshot: {
    carId: '123', carName: 'Test car', profileKey: 'profile-1',
    profile: { weight: 1400, weight_distribution: 50, drivetrain: 'RWD', induction: 'NA', maxHp: 250, maxTorque: 300 } as CarParams,
    workflow: { step: 3, goal: 'Road', season: 'Summer' }, results: { chassis: null, alignment: null, gearing: null },
    engine: { phase: 'collecting', sampleCount: 41, state: null },
    readiness: { mechanical: true, engineInputs: true, measuredEngine: false, gearingAvailable: false },
  },
};
let host: HTMLDivElement, root: Root;
let theme: ReturnType<typeof useTheme>, session: ReturnType<typeof useCompanionSession>;
function Probe({ polling = false }: { polling?: boolean }) {
  theme = useTheme();
  return polling ? <SessionProbe /> : <section className="companion-content"><CompanionTuning state={initial} disabled={false} onCommand={async () => true} /></section>;
}
function SessionProbe() { session = useCompanionSession(); return null; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); fetcher.mockReset(); localStorage.clear();
  delete window.HorizonTunerCompanionTheme;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); delete window.HorizonTunerCompanionTheme; });
async function mount(polling = false) { await act(async () => root.render(<ThemeProvider receiveOnly initialTheme={readCompanionThemeBootstrap().theme}><Probe polling={polling} /></ThemeProvider>)); }
async function tick(ms = 1000) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

it('uses the same validated origin-scoped bootstrap for first paint and React, rejects stale host/cache data', async () => {
  const generation = '11111111-1111-4111-8111-111111111111';
  const update = vi.fn();
  window.HorizonTunerCompanionTheme = { themeBootstrap: () => JSON.stringify({ origin: location.origin, generation, visualTheme: visual }), updateVisualTheme: update };
  const bootstrap = readCompanionThemeBootstrap();
  expect(bootstrap).toEqual({ theme: { ...visual, customCSS: '' }, generation });
  await mount();
  expect(theme.themeSettings).toEqual(bootstrap.theme);
  await act(async () => { receiveCompanionTheme(visual, theme.receiveThemeSettings, generation); });
  expect(update).toHaveBeenCalledWith(JSON.stringify(visual), generation);
  window.HorizonTunerCompanionTheme.themeBootstrap = () => JSON.stringify({ origin: 'http://other-host:8002', generation, visualTheme: visual });
  expect(readCompanionThemeBootstrap().theme).toEqual(defaultThemeSettings);
  delete window.HorizonTunerCompanionTheme;
  localStorage.setItem(COMPANION_THEME_CACHE, '{');
  expect(readCompanionThemeBootstrap().theme).toEqual(defaultThemeSettings);
  localStorage.setItem(COMPANION_THEME_CACHE, JSON.stringify(visual));
  expect(readCompanionThemeBootstrap().theme).toEqual({ ...visual, customCSS: '' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('receives rapid changes without settings POST or remounting a dirty draft, navigation, measurement or eligibility', async () => {
  await mount();
  const weight = host.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(weight, '1555');
    weight.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const nav = host.querySelector<HTMLButtonElement>('.companion-section-nav button:nth-child(4)')!;
  await act(async () => nav.click());
  const measurement = host.querySelector('#companion-engine');
  const disabledSteps = Array.from(host.querySelectorAll('select option:disabled')).map(option => option.textContent);
  for (const [halfmoonCore] of coreThemeEntries) for (const mode of ['light', 'dark'] as const) {
    await act(async () => { receiveCompanionTheme({ ...visual, halfmoonCore, mode }, theme.receiveThemeSettings); });
    expect(host.querySelector('input')).toBe(weight);
    expect(weight.value).toBe('1555');
    expect(host.textContent).toContain('companion.unsaved_draft');
    expect(nav.getAttribute('aria-current')).toBe('location');
    expect(host.querySelector('#companion-engine')).toBe(measurement);
    expect(measurement?.textContent).toContain('collecting');
    expect(measurement?.textContent).toContain('41');
    expect(Array.from(host.querySelectorAll('select option:disabled')).map(option => option.textContent)).toEqual(disabledSteps);
  }
  await act(async () => { receiveCompanionTheme({}, theme.receiveThemeSettings); theme.updateThemeSettings({ mode: 'light' }); });
  expect(theme.themeSettings.mode).toBe('dark');
  expect(fetcher).not.toHaveBeenCalled();
});

it('refreshes theme with unchanged tuning revision and offline desktop, retains it across failed poll and reconnect', async () => {
  fetcher.mockResolvedValueOnce(response({ ...initial, hostOnline: false, visualTheme: visual }));
  fetcher.mockRejectedValueOnce(new Error('offline'));
  fetcher.mockResolvedValueOnce(response({ ...initial, visualTheme: { ...visual, halfmoonCore: 'rhine-lab' } }));
  await mount(true);
  expect(theme.themeSettings.halfmoonCore).toBe('swiss');
  expect(session.state?.revision).toBe(7);
  await tick();
  expect(session.backendOnline).toBe(false);
  expect(theme.themeSettings.halfmoonCore).toBe('swiss');
  await tick();
  expect(session.backendOnline).toBe(true);
  expect(theme.themeSettings.halfmoonCore).toBe('rhine-lab');
});

it('keeps receiving workflow visuals during a busy command, even when command response omits theme', async () => {
  fetcher.mockResolvedValueOnce(response({ ...initial, visualTheme: visual }));
  fetcher.mockImplementationOnce(async (_path, options) => {
    const command = JSON.parse(String(options?.body));
    return response({ ...initial, commands: [{ id: command.id, status: 'pending' }] });
  });
  fetcher.mockImplementationOnce(async () => response({ ...initial, visualTheme: { ...visual, halfmoonCore: 'elegant' }, commands: [] }));
  await mount(true);
  let pending: Promise<boolean>;
  await act(async () => { pending = session.send({ kind: 'workflow', goal: 'Road' }); });
  expect(session.commandBusy).toBe(true);
  expect(theme.themeSettings.halfmoonCore).toBe('swiss');
  await tick(300);
  expect(theme.themeSettings.halfmoonCore).toBe('elegant');
  await act(async () => root.unmount());
  await pending!;
});

it('ignores late poll callbacks after disposal', async () => {
  let resolve!: (value: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(true);
  await act(async () => root.unmount());
  await act(async () => resolve(response({ ...initial, visualTheme: visual })));
  expect(localStorage.getItem(COMPANION_THEME_CACHE)).toBeNull();
});
