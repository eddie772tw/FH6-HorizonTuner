import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatUpdaterError, isTauriEnvironment, checkForAppUpdates, downloadAndApplyUpdate, restartApplication } from './updaterService';
import { configureBackendTransport, waitForBackendReady } from './backend';

vi.mock('./backend', () => ({
  configureBackendTransport: vi.fn(),
  waitForBackendReady: vi.fn(),
}));

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
    vi.resetAllMocks();
    vi.mocked(waitForBackendReady).mockResolvedValue({ state: 'ready', port: 53124, error: null });
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

  describe('formatUpdaterError', () => {
    it('preserves Tauri plugin string errors instead of replacing them with a generic message', () => {
      expect(formatUpdaterError('error sending request for url (https://github.com/...)')).toBe(
        'error sending request for url (https://github.com/...)'
      );
    });

    it('uses a generic message only when no error detail is available', () => {
      expect(formatUpdaterError(undefined)).toContain('Failed to connect to the update server');
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
        download: vi.fn(async (cb: any) => {
          cb({ event: 'Started', data: { contentLength: 1000 } });
          cb({ event: 'Progress', data: { chunkLength: 500 } });
          cb({ event: 'Progress', data: { chunkLength: 500 } });
          cb({ event: 'Finished' });
        }),
        install: vi.fn().mockResolvedValue(undefined),
      };

      const onProgress = vi.fn((downloaded, total, percentage) => {
        progressCallbacks.push({ downloaded, total, percentage });
      });

      await downloadAndApplyUpdate(mockUpdate as any, onProgress);

      expect(mockUpdate.download).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledTimes(4);
      expect(progressCallbacks[0]).toEqual({ downloaded: 0, total: 1000, percentage: 0 });
      expect(progressCallbacks[1]).toEqual({ downloaded: 500, total: 1000, percentage: 50 });
      expect(progressCallbacks[2]).toEqual({ downloaded: 1000, total: 1000, percentage: 100 });
      expect(progressCallbacks[3]).toEqual({ downloaded: 1000, total: 1000, percentage: 100 });
    });

    it('keeps the backend through download, stops it before installation, and recovers if install fails', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const events: string[] = [];
      vi.mocked(invoke).mockImplementation(async command => { events.push(command); });
      const update = {
        download: async () => { events.push('download'); },
        install: async () => { events.push('install'); throw new Error('installation failed'); },
      };
      await expect(downloadAndApplyUpdate(update as any)).rejects.toThrow('installation failed');
      expect(events).toEqual(['download', 'stop_backend_for_update', 'install', 'resume_backend_after_failed_update']);
      expect(configureBackendTransport).toHaveBeenCalledWith(53124);
    });

    it('refuses installation if backend teardown fails', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      vi.mocked(invoke).mockRejectedValueOnce(new Error('backend still running'));
      const update = { download: vi.fn().mockResolvedValue(undefined), install: vi.fn() };
      await expect(downloadAndApplyUpdate(update as any)).rejects.toThrow('backend still running');
      expect(update.install).not.toHaveBeenCalled();
    });

    it('does not stop telemetry when the download fails', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const update = { download: async () => { throw new Error('offline'); }, install: vi.fn() };
      await expect(downloadAndApplyUpdate(update as any)).rejects.toThrow('offline');
      expect(invoke).not.toHaveBeenCalled();
      expect(update.install).not.toHaveBeenCalled();
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
