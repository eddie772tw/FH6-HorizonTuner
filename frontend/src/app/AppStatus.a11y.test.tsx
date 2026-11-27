// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStatus } from './AppStatus';

vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: { language: 'en-us' }, t: (s: string) => s }) }));
vi.mock('../hooks/useTelemetry', () => ({ useTelemetry: () => ({ isConnected: true }) }));
vi.mock('../features/onboarding/useTelemetryHealth', () => ({
  useTelemetryHealth: () => ({ state: 'active', label: 'Data Out receiving', detail: '', datagramsReceived: 1, validFrames: 1, hasObservedPacket: true, lastPacketAt: null, errors: [] }),
}));
vi.mock('../services/backend', () => ({ PREFERRED_BACKEND_PORT: 8001, getBackendPort: () => 8002 }));
vi.mock('../features/onboarding/DataOutGuide', () => ({ default: () => null, localizeTelemetryHealth: () => ({ label: 'Data Out receiving', detail: '' }) }));

describe('AppStatus accessibility & narrow-viewport popover placement', () => {
  let host: HTMLDivElement, root: Root;
  const renderStatus = () => act(async () => { root.render(<AppStatus onOpenMcp={vi.fn()} />); });
  const escape = () => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.localStorage.setItem('fh6-data-out-guide/v1', 'completed');
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.localStorage.clear(); vi.restoreAllMocks(); });

  it('exposes dialog semantics, live-region status, modal-safe Escape, outside dismiss, and focus restoration', async () => {
    await renderStatus();
    const dataOutBtn = host.querySelector<HTMLButtonElement>('button[title*="Backend connected"]')!;
    expect(dataOutBtn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(dataOutBtn.getAttribute('aria-expanded')).toBe('false');
    await act(async () => dataOutBtn.click());
    expect(dataOutBtn.getAttribute('aria-expanded')).toBe('true');

    const mcpBtn = host.querySelector<HTMLButtonElement>('button[aria-controls]')!;
    const dlg = host.querySelector<HTMLDivElement>('.popover[role="dialog"]')!;
    expect(mcpBtn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(mcpBtn.getAttribute('aria-controls')).toBe(dlg.id);
    expect(document.getElementById(dlg.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('MCP Endpoint Notice');
    expect(document.getElementById(dlg.getAttribute('aria-describedby') ?? '')?.textContent).toContain('dynamic port');
    expect(host.querySelector('.visually-hidden[role="status"][aria-live="polite"]')?.textContent).toContain('8002');

    await act(async () => dlg.querySelector<HTMLButtonElement>('button.btn-close')!.click());
    expect([host.querySelector('.popover[role="dialog"]'), mcpBtn.getAttribute('aria-expanded'), document.activeElement]).toEqual([null, 'false', mcpBtn]);

    await act(async () => mcpBtn.click());
    const modal = Object.assign(document.createElement('div'), { role: 'dialog' });
    modal.setAttribute('aria-modal', 'true'); document.body.append(modal);
    host.querySelector<HTMLButtonElement>('.popover button.btn-close')!.focus();
    await escape();
    expect(host.querySelector('.popover[role="dialog"]')).not.toBeNull();
    modal.setAttribute('aria-hidden', 'true');
    await escape();
    expect([host.querySelector('.popover[role="dialog"]'), document.activeElement]).toEqual([null, mcpBtn]);
    modal.remove();

    await act(async () => mcpBtn.click());
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('.popover[role="dialog"]')).toBeNull();
  });

  it('clamps horizontal placement inside 320px viewports', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(320);
    await renderStatus();
    const wrap = host.querySelector<HTMLDivElement>('.position-relative')!;
    wrap.getBoundingClientRect = () => ({ left: 16, right: 100, width: 84, top: 8, bottom: 38, height: 30, x: 16, y: 8, toJSON: () => ({}) });
    await act(async () => window.dispatchEvent(new Event('resize')));
    const left = parseFloat(host.querySelector<HTMLDivElement>('.popover[role="dialog"]')!.style.left);
    expect(left + 16).toBeGreaterThanOrEqual(8);
    expect(left + 16 + 304).toBeLessThanOrEqual(312);
  });
});
