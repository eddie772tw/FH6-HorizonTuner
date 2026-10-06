// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppDialog } from './AppDialog';

vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ t: (text: string) => text }) }));
let host: HTMLDivElement, root: Root;
let close = vi.fn<() => void>();
let reduced = false;
function Example() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open</button>{open && <AppDialog title="Settings" onClose={() => { close(); setOpen(false); }}><input aria-label="Draft" /></AppDialog>}</>;
}
beforeEach(async () => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  reduced = false;
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ transitionProperty: 'transform, opacity', transitionDuration: '160ms, 0.2s', transitionDelay: '0s, 50ms' } as CSSStyleDeclaration);
  host = document.createElement('div'); host.id = 'root'; host.inert = false; document.body.append(host); root = createRoot(host); close = vi.fn();
  await act(async () => root.render(<Example />));
  const trigger = host.querySelector('button')!; trigger.focus();
  await act(async () => trigger.click());
  await act(async () => vi.advanceTimersByTime(40));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('finishes closing once without transitionend, retaining focus isolation through exit', async () => {
  const dialog = document.querySelector('[role="dialog"]')!;
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await act(async () => (dialog.querySelector('button') as HTMLButtonElement).click());
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  expect(host.inert).toBe(true);
  await act(async () => vi.advanceTimersByTime(285));
  expect(close).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('button'));
  expect(host.inert).toBe(false);
});

it('finishes once when transform ends before the fallback timer', async () => {
  const dialog = document.querySelector('[role="dialog"]')!;
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await act(async () => dialog.dispatchEvent(Object.assign(new Event('transitionend', { bubbles: true }), { propertyName: 'transform' })));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(close).toHaveBeenCalledOnce();
  expect(host.inert).toBe(false);
});

it.each(['reduced motion', 'zero duration'])('closes immediately with %s', async kind => {
  reduced = kind === 'reduced motion';
  if (!reduced) vi.mocked(window.getComputedStyle).mockReturnValue({ transitionProperty: 'none', transitionDuration: '0s', transitionDelay: '0s' } as CSSStyleDeclaration);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(close).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
