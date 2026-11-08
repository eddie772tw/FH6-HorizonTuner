// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpdateModal } from './UpdateModal';
import type { UpdateInfo } from '../../services/updaterService';

vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));

const mockUpdate: UpdateInfo = {
  version: 'v1.5.0', currentVersion: 'v1.4.2', date: '2026-11-06', body: 'Improvements.',
};

let host: HTMLDivElement, root: Root;
function TestHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="trigger-btn" onClick={() => setOpen(true)}>Check Updates</button>
      <UpdateModal updateInfo={mockUpdate} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('renders dialog with accessible labels, description, and scrollable release notes region', async () => {
  await act(async () => root.render(<TestHarness />));
  const trigger = document.getElementById('trigger-btn')!;
  await act(async () => trigger.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.getAttribute('aria-labelledby')).toBe('update-modal-title');
  expect(dialog.getAttribute('aria-describedby')).toBe('update-modal-desc');
  expect(document.getElementById('update-modal-desc')).not.toBeNull();

  const notesRegion = dialog.querySelector('[role="region"]')!;
  expect(notesRegion).not.toBeNull();
  expect(notesRegion.getAttribute('tabindex')).toBe('0');
  expect(notesRegion.getAttribute('aria-labelledby')).toBe('release-notes-label');
});

it('restores focus to trigger on Escape key and supports backdrop dismissal', async () => {
  await act(async () => root.render(<TestHarness />));
  const trigger = document.getElementById('trigger-btn')!;
  trigger.focus();
  await act(async () => trigger.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();

  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  await act(async () => trigger.click());
  const backdrop = document.querySelector('.modal-backdrop') as HTMLElement;
  expect(backdrop).not.toBeNull();
  await act(async () => backdrop.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
