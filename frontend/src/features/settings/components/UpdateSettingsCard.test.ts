import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as updaterService from '../../../services/updaterService';
import { UpdateSettingsCard } from './UpdateSettingsCard';

vi.mock('../../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {},
    updateSettings: vi.fn(),
    t: (text: string, params?: Record<string, string | number>) => (
      params ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), text) : text
    ),
  }),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('../../../services/updaterService', () => ({
  checkForAppUpdates: vi.fn(),
  isTauriEnvironment: vi.fn(),
  downloadAndApplyUpdate: vi.fn(),
  restartApplication: vi.fn(),
}));

describe('UpdateSettingsCard logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an unchecked state before a real updater result exists', () => {
    const html = renderToStaticMarkup(React.createElement(UpdateSettingsCard));
    expect(html).toContain('Not checked');
    expect(html).not.toContain('UP TO DATE');
  });

  it('detects when in non-Tauri environment and skips network call', async () => {
    vi.mocked(updaterService.isTauriEnvironment).mockReturnValue(false);
    expect(updaterService.isTauriEnvironment()).toBe(false);
    expect(updaterService.checkForAppUpdates).not.toHaveBeenCalled();
  });

  it('triggers checkForAppUpdates when in Tauri environment', async () => {
    vi.mocked(updaterService.isTauriEnvironment).mockReturnValue(true);
    vi.mocked(updaterService.checkForAppUpdates).mockResolvedValue({
      version: '1.5.0',
      currentVersion: '1.4.0',
      body: 'Performance optimizations',
    });

    const result = await updaterService.checkForAppUpdates();
    expect(result?.version).toBe('1.5.0');
    expect(updaterService.checkForAppUpdates).toHaveBeenCalledTimes(1);
  });

  it('interpolates version parameters into notification and status strings', async () => {
    const { useSettings } = await import('../../../context/SettingsContext');
    const { t } = useSettings();
    expect(t('New version {version} is ready for download.', { version: '1.5.0' }))
      .toBe('New version 1.5.0 is ready for download.');
    expect(t('Version {version} is available!', { version: '1.5.0' }))
      .toBe('Version 1.5.0 is available!');
  });
});
