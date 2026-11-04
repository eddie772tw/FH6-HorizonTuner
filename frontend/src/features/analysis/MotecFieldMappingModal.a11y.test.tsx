// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MotecFieldMappingModal from './MotecFieldMappingModal';

let host: HTMLDivElement, root: Root;
function TestHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="trigger-btn" onClick={() => setOpen(true)}>Open Mapping</button>
      <MotecFieldMappingModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onDownloadTemplate={vi.fn()}
        t={text => text}
      />
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

it('renders dialog with accessible labels, description, and scrollable table region', async () => {
  await act(async () => root.render(<TestHarness />));
  const trigger = document.getElementById('trigger-btn')!;
  await act(async () => trigger.click());

  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.getAttribute('aria-labelledby')).toBe('motec-mapping-title');
  expect(dialog.getAttribute('aria-describedby')).toBe('motec-mapping-desc');
  expect(document.getElementById('motec-mapping-desc')).not.toBeNull();

  const tableRegion = dialog.querySelector('[role="region"]')!;
  expect(tableRegion).not.toBeNull();
  expect(tableRegion.getAttribute('tabindex')).toBe('0');
  expect(tableRegion.getAttribute('aria-label')).toBe('MoTeC Channel Mapping Table');
});

it('restores focus to trigger on Escape key and supports backdrop click', async () => {
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
