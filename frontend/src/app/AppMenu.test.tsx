// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppMenu } from './AppMenu';

vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ t: (k: string) => k }) }));
vi.mock('../services/backend', () => ({
  backendFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ active_connections: 0, paired_devices_count: 0 }) }),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it('supports ARIA menu semantics, arrow navigation, and Escape dismissal', async () => {
  const onOpen = vi.fn();
  await act(async () => { root.render(<AppMenu onOpen={onOpen} />); });

  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');

  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('[role="menu"]')).not.toBeNull();
  expect(host.querySelectorAll('[role="separator"]').length).toBe(2);

  const items = host.querySelectorAll<HTMLElement>('[role="menuitem"]');
  expect(items.length).toBeGreaterThanOrEqual(5);
  expect(document.activeElement).toBe(items[0]);

  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  expect(document.activeElement).toBe(items[1]);

  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  expect(document.activeElement).toBe(items[items.length - 1]);

  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
});
