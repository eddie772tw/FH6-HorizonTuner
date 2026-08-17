import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTauriEnvironment, checkForAppUpdates, downloadAndApplyUpdate, restartApplication } from './updaterService';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

describe('updaterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).__TAURI_INTERNALS__;
    delete (globalThis as any).__TAURI__;
  });

  describe('isTauriEnvironment', () => {
    it('returns false when Tauri global is not defined', () => {
      expect(isTauriEnvironment()).toBe(false);
    });

    it('returns true when __TAURI_INTERNALS__ is present in global', () => {
      (globalThis as any).__TAURI_INTERNALS__ = {};
      expect(isTauriEnvironment()).toBe(true);
    });

    it('returns true when __TAURI__ is present in global', () => {
      (globalThis as any).__TAURI__ = {};
      expect(isTauriEnvironment()).toBe(true);
    });
  });

  describe('checkForAppUpdates', () => {
    it('returns null if not in Tauri environment', async () => {
      const result = await checkForAppUpdates();
      expect(result).toBeNull();
    });

    it('returns UpdateInfo when a new update is available in Tauri environment', async () => {
      (globalThis as any).__TAURI_INTERNALS__ = {};
      const { check } = await import('@tauri-apps/plugin-updater');
      
      const mockUpdate = {
        version: '1.5.0',
        currentVersion: '1.4.0',
        body: 'Bug fixes and performance improvements',
        date: '2026-08-17',
        downloadAndInstall: vi.fn(),
      };
      
      vi.mocked(check).mockResolvedValueOnce(mockUpdate as any);

      const result = await checkForAppUpdates();
      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.5.0');
      expect(result?.currentVersion).toBe('1.4.0');
      expect(result?.body).toBe('Bug fixes and performance improvements');
      expect(result?.rawUpdate).toBe(mockUpdate);
    });

    it('returns null when no update is available', async () => {
      (globalThis as any).__TAURI_INTERNALS__ = {};
      const { check } = await import('@tauri-apps/plugin-updater');
      vi.mocked(check).mockResolvedValueOnce(null);

      const result = await checkForAppUpdates();
      expect(result).toBeNull();
    });
  });

  describe('downloadAndApplyUpdate', () => {
    it('handles download events and triggers progress callbacks', async () => {
      const progressCallbacks: any[] = [];
      const mockUpdate = {
        version: '1.5.0',
        currentVersion: '1.4.0',
        downloadAndInstall: vi.fn(async (cb: any) => {
          cb({ event: 'Started', data: { contentLength: 1000 } });
          cb({ event: 'Progress', data: { chunkLength: 500 } });
          cb({ event: 'Progress', data: { chunkLength: 500 } });
          cb({ event: 'Finished' });
        }),
      };

      const onProgress = vi.fn((downloaded, total, percentage) => {
        progressCallbacks.push({ downloaded, total, percentage });
      });

      await downloadAndApplyUpdate(mockUpdate as any, onProgress);

      expect(mockUpdate.downloadAndInstall).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledTimes(4);
      expect(progressCallbacks[0]).toEqual({ downloaded: 0, total: 1000, percentage: 0 });
      expect(progressCallbacks[1]).toEqual({ downloaded: 500, total: 1000, percentage: 50 });
      expect(progressCallbacks[2]).toEqual({ downloaded: 1000, total: 1000, percentage: 100 });
      expect(progressCallbacks[3]).toEqual({ downloaded: 1000, total: 1000, percentage: 100 });
    });
  });

  describe('restartApplication', () => {
    it('does nothing in non-Tauri environment', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      await restartApplication();
      expect(invoke).not.toHaveBeenCalled();
    });

    it('calls prepare_update_and_restart command in Tauri environment', async () => {
      (globalThis as any).__TAURI_INTERNALS__ = {};
      const { invoke } = await import('@tauri-apps/api/core');
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await restartApplication();
      expect(invoke).toHaveBeenCalledWith('prepare_update_and_restart');
    });
  });
});
