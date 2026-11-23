// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../context/ThemeContext';
import { defaultThemeSettings } from '../../context/themeSettings';
import ThemeView from './ThemeView';
let mockSaving = false;
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn(async () => ({ json: async () => ({}) })) }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (v: string) => v }) }));
vi.mock('../../hooks/useFileSave', () => ({ useFileSave: () => ({ save: vi.fn(), isSaving: mockSaving }) }));
let host: HTMLDivElement, root: Root;
const setInput = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const btn = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === label)!;
const mount = async (onClose = vi.fn()) => {
  await act(async () => root.render(<ThemeProvider><ThemeView show onClose={onClose} /></ThemeProvider>));
  await act(async () => vi.advanceTimersByTime(40));
  return onClose;
};
beforeEach(() => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  mockSaving = false; localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  document.getElementById('custom-theme-css')?.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it('exposes dialog landmarks, disambiguates color inputs, and cancels dirty HEX drafts on Escape without closing the drawer', async () => {
  const onClose = await mount();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(document.querySelector('.offcanvas-backdrop')?.getAttribute('aria-hidden')).toBe('true');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Theme Customization');
  expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Personalize');
  const picker = document.getElementById('color-primary-picker') as HTMLInputElement;
  const text = document.getElementById('color-primary-text') as HTMLInputElement;
  expect(picker.getAttribute('aria-label')).toBe(`Primary Color (${defaultThemeSettings.primaryColor.toUpperCase()})`);
  expect(document.getElementById(text.getAttribute('aria-describedby') ?? '')?.textContent).toContain('six-digit HEX');
  text.focus();
  await act(async () => setInput(text, '#12'));
  expect(text.getAttribute('aria-invalid')).toBe('true');
  await act(async () => { text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  expect(text.value).toBe(defaultThemeSettings.primaryColor);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => { text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('labels Custom CSS editor, marks invalid syntax, restores focus after actions disable, and exposes export busy state', async () => {
  mockSaving = true; await mount();
  document.querySelector<HTMLDetailsElement>('.theme-advanced')!.open = true;
  const editor = document.getElementById('custom-css-editor') as HTMLTextAreaElement;
  expect(document.getElementById(editor.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Custom CSS & Style Editor');
  expect(btn('Export Theme JSON').getAttribute('aria-busy')).toBe('true');
  expect(btn('Export Theme JSON').querySelector('.spinner-border[aria-hidden="true"]')).not.toBeNull();
  await act(async () => setInput(editor, '.card {'));
  expect(editor.getAttribute('aria-invalid')).toBe('true');
  expect(editor.classList.contains('is-invalid')).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toBeTruthy();
  for (const label of ['Cancel', 'Insert Starter CSS', 'Apply', 'Clear Current']) {
    await act(async () => btn(label).click()); expect(document.activeElement).toBe(editor);
  }
});
