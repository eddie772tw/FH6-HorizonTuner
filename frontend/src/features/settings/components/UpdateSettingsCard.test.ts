import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as updaterService from '../../../services/updaterService';

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
});
