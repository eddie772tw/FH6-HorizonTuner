// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';
import { defaultThemeSettings } from './themeSettings';
import { coreThemeEntries } from './themeCatalog';
import { applyThemeEarly } from '../app/applyThemeEarly';
import ThemeView from '../features/theme/ThemeView';

vi.mock('../services/backend', () => ({ backendFetch: vi.fn(async () => ({ json: async () => ({}) })) }));
vi.mock('./SettingsContext', () => ({ useSettings: () => ({ t: (value: string) => value }) }));
vi.mock('../hooks/useFileSave', () => ({ useFileSave: () => ({ save: vi.fn(), isSaving: false }) }));
let host: HTMLDivElement;
let root: Root;
let theme: ReturnType<typeof useTheme>;
function Probe() { theme = useTheme(); return null; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  for (const name of ['data-bs-theme', 'data-bs-core', 'data-design-system']) document.documentElement.removeAttribute(name);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.getElementById('custom-theme-css')?.remove(); });
async function mount(panel = false) {
  await act(async () => root.render(<ThemeProvider><Probe />{panel && <ThemeView show onClose={() => {}} />}</ThemeProvider>));
}

it.each(coreThemeEntries.flatMap(([core, definition]) =>
  (['light', 'dark'] as const).map(mode => ({ core, system: definition.designSystem, mode })),
))('resolves saved $core / $mode consistently before first paint and after React mounts', async ({ core, system, mode }) => {
  const saved = { ...defaultThemeSettings, halfmoonCore: core, mode, primaryColor: '#123456' };
  localStorage.setItem('themeSettings', JSON.stringify(saved));
  applyThemeEarly();
  expect(document.documentElement.dataset.designSystem).toBe(system);
  expect(document.documentElement.getAttribute('data-bs-core')).toBe(core);
  expect(document.documentElement.getAttribute('data-bs-theme')).toBe(mode);
  await mount();
  expect(document.documentElement.dataset.designSystem).toBe(system);
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#123456');
  expect(theme.themeSettings).toEqual(saved);
});

it('switches systems, preserves custom accents and derives the system on legacy JSON import', async () => {
  await mount();
  await act(async () => theme.updateThemeSettings({ halfmoonCore: 'swiss', primaryColor: '#e30613' }));
  expect(document.documentElement.dataset.designSystem).toBe('swiss');
  await act(async () => theme.updateThemeSettings({ halfmoonCore: 'modern' }));
  expect(document.documentElement.dataset.designSystem).toBe('halfmoon');
  expect(theme.themeSettings.primaryColor).toBe('#e30613');
  await act(async () => {
    expect(theme.importThemeJSON(JSON.stringify({ halfmoonCore: 'swiss', designSystem: 'halfmoon', mode: 'light' }))).toBe(true);
  });
  expect(document.documentElement.dataset.designSystem).toBe('swiss');
  expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  expect(JSON.parse(theme.exportThemeJSON())).toMatchObject({ schemaVersion: 2, halfmoonCore: 'swiss', primaryColor: '#e30613' });
  expect(JSON.parse(theme.exportThemeJSON())).not.toHaveProperty('designSystem');
});

it('groups cores by system, nests presets under colors and keeps saved CSS active while advanced tools are folded', async () => {
  localStorage.setItem('themeSettings', JSON.stringify({ ...defaultThemeSettings, customCSS: '.card { border-width: 2px; }' }));
  await mount(true);
  expect(document.querySelector('[aria-labelledby="theme-system-halfmoon"]')?.querySelectorAll('button').length).toBe(3);
  expect(document.querySelector('[aria-labelledby="theme-system-swiss"]')?.querySelectorAll('button').length).toBe(3);
  expect(document.querySelector('[aria-labelledby="theme-system-rhine"]')?.querySelectorAll('button').length).toBe(1);
  expect(document.querySelector('.theme-colors .theme-presets')).not.toBeNull();
  expect(document.querySelector<HTMLDetailsElement>('.theme-advanced')?.open).toBe(false);
  expect(document.getElementById('custom-theme-css')?.textContent).toBe('.card { border-width: 2px; }');
  await act(async () => (document.querySelector('#preset-swiss-signal') as HTMLButtonElement).click());
  expect(theme.themeSettings).toMatchObject({ halfmoonCore: 'default', primaryColor: '#e30613', secondaryColor: '#f59e0b', accentColor: '#2563eb' });
  expect((document.getElementById('color-primary-text') as HTMLInputElement).value).toBe('#e30613');
  for (const preview of document.querySelectorAll<HTMLElement>('.theme-core-preview')) {
    expect(preview.style.getPropertyValue('--primary')).toBe('#e30613');
    expect(preview.style.getPropertyValue('--bs-primary-hsl')).toBe(document.documentElement.style.getPropertyValue('--bs-primary-hsl'));
  }
});

it.each(['swiss-editorial', 'swiss-contrast', 'rhine-lab'] as const)('selects %s through the grouped UI and preserves colors on export/import', async core => {
  localStorage.setItem('themeSettings', JSON.stringify({ ...defaultThemeSettings, mode: 'light', primaryColor: '#123456' }));
  await mount(true);
  await act(async () => (document.getElementById(`theme-core-${core}`) as HTMLButtonElement).click());
  expect(document.getElementById(`theme-core-${core}`)?.getAttribute('aria-pressed')).toBe('true');
  expect(theme.themeSettings).toMatchObject({ halfmoonCore: core, mode: 'light', primaryColor: '#123456' });
  const exported = theme.exportThemeJSON();
  await act(async () => theme.updateThemeSettings({ halfmoonCore: 'elegant', mode: 'dark' }));
  await act(async () => { expect(theme.importThemeJSON(exported)).toBe(true); });
  expect(document.documentElement.dataset.designSystem).toBe(core === 'rhine-lab' ? 'rhine' : 'swiss');
  expect(document.documentElement.getAttribute('data-bs-core')).toBe(core);
  expect(theme.themeSettings).toMatchObject({ halfmoonCore: core, mode: 'light', primaryColor: '#123456' });
  expect(JSON.parse(localStorage.getItem('themeSettings')!)).toEqual(theme.themeSettings);
});

it('allows incomplete HEX drafts without saving them, then applies a complete color', async () => {
  await mount(true);
  const input = document.getElementById('color-primary-text') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setValue.call(input, '#12'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(input.value).toBe('#12');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(theme.themeSettings.primaryColor).toBe(defaultThemeSettings.primaryColor);
  await act(async () => { setValue.call(input, '#123456'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(theme.themeSettings.primaryColor).toBe('#123456');
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#123456');
});
