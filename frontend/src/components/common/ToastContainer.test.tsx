// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from './ToastContainer';
import * as ToastContextModule from '../../context/ToastContext';
import * as SettingsContextModule from '../../context/SettingsContext';

describe('ToastContainer accessibility & interaction', () => {
  let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
  const removeToast = vi.fn();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.spyOn(SettingsContextModule, 'useSettings').mockReturnValue({ t: (key: string) => key } as any);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('assigns polite status to info/success and assertive alert to danger/warning', async () => {
    vi.spyOn(ToastContextModule, 'useToast').mockReturnValue({
      toasts: [
        { id: '1', type: 'info', title: 'System', message: 'Ready' },
        { id: '2', type: 'danger', title: 'Error', message: 'Failed' },
      ],
      removeToast, addToast: vi.fn(), clearToasts: vi.fn(),
    });

    await act(async () => root.render(<ToastContainer />));
    const infoToast = host.querySelector('#toast-title-1')?.closest('.toast');
    const dangerToast = host.querySelector('#toast-title-2')?.closest('.toast');

    expect(infoToast?.getAttribute('role')).toBe('status');
    expect(infoToast?.getAttribute('aria-live')).toBe('polite');
    expect(dangerToast?.getAttribute('role')).toBe('alert');
    expect(dangerToast?.getAttribute('aria-live')).toBe('assertive');

    const container = host.querySelector('.toast-container');
    expect(container?.getAttribute('role')).toBe('region');
    expect(container?.getAttribute('aria-label')).toBe('Notifications');
    expect(infoToast?.querySelector('button.btn-close')?.getAttribute('aria-label')).toBe('Close System');
  });

  it('removes toast when Escape key is pressed inside it', async () => {
    vi.spyOn(ToastContextModule, 'useToast').mockReturnValue({
      toasts: [{ id: 'esc-1', type: 'info', message: 'Press ESC' }],
      removeToast, addToast: vi.fn(), clearToasts: vi.fn(),
    });

    await act(async () => root.render(<ToastContainer />));
    const toast = host.querySelector('.toast');
    await act(async () => {
      toast?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(removeToast).toHaveBeenCalledWith('esc-1');
  });
});
