// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DataOutGuide from './DataOutGuide';
import type { TelemetryHealth } from './telemetryHealth';

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { language: 'en' }, t: (text: string) => text }),
}));
vi.mock('./DataOutDestination', () => ({ DataOutDestination: () => <div /> }));

const mockHealth: TelemetryHealth = {
  state: 'active', label: 'Data Out receiving', detail: 'Telemetry active',
  datagramsReceived: 5, validFrames: 5, hasObservedPacket: true, lastPacketAt: 123456, errors: [],
};

let host: HTMLDivElement, root: Root;
function TestHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="trigger-btn" onClick={() => setOpen(true)}>Open Guide</button>
      <DataOutGuide health={mockHealth} open={open} onClose={() => setOpen(false)} />
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

it('renders dialog with accessible labels, description, and status role', async () => {
  await act(async () => root.render(<TestHarness />));
  const trigger = document.getElementById('trigger-btn')!;
  trigger.focus();
  await act(async () => trigger.click());

  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.getAttribute('aria-labelledby')).toBe('data-out-guide-title');
  expect(dialog.getAttribute('aria-describedby')).toBe('data-out-guide-desc');
  expect(document.getElementById('data-out-guide-desc')).not.toBeNull();
  expect(dialog.querySelector('[role="status"]')?.textContent).toBe('Data Out receiving');
});

it('restores focus to the trigger button when dismissed with Escape', async () => {
  await act(async () => root.render(<TestHarness />));
  const trigger = document.getElementById('trigger-btn')!;
  trigger.focus();
  expect(document.activeElement).toBe(trigger);

  await act(async () => trigger.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
