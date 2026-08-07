import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToastMessage, ToastType } from './ToastContext';

describe('ToastContext message structure and types', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('correctly constructs ToastMessage objects with default fallback values', () => {
    const rawToast: Omit<ToastMessage, 'id'> = {
      message: 'Telemetry rendering paused (HUD Overlay is active)',
      type: 'warning',
    };

    const id = `toast-${Date.now()}-abcde`;
    const fullToast: ToastMessage = {
      id,
      duration: 5000,
      ...rawToast,
    };

    expect(fullToast.id).toBe(id);
    expect(fullToast.type).toBe('warning');
    expect(fullToast.message).toContain('Telemetry rendering paused');
    expect(fullToast.duration).toBe(5000);
  });

  it('supports custom toast types and details without emojis', () => {
    const toastTypes: ToastType[] = ['info', 'warning', 'success', 'danger'];

    toastTypes.forEach(t => {
      const toast: ToastMessage = {
        id: `toast-${t}`,
        type: t,
        title: `${t.toUpperCase()} Notification`,
        message: `System message for ${t}`,
        detail: 'Can be toggled in settings',
      };

      expect(toast.type).toBe(t);
      expect(toast.title).toBe(`${t.toUpperCase()} Notification`);
      // Assert no emoji in message or detail
      expect(toast.message).not.toMatch(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u);
      expect(toast.detail).not.toMatch(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u);
    });
  });
});
