import { check, Update } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
  rawUpdate?: Update;
}

export type UpdateProgressCallback = (downloadedBytes: number, totalBytes: number, percentage: number) => void;

/** Return the message Tauri serializes for updater failures, including strings. */
export function formatUpdaterError(
  error: unknown,
  fallback = 'Failed to connect to the update server. Please check internet connection.'
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

/**
 * Checks whether the app is currently running inside the Tauri native desktop shell.
 */
export function isTauriEnvironment(): boolean {
  const target: any = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined);
  if (!target) return false;
  return '__TAURI_INTERNALS__' in target || '__TAURI__' in target;
}

/**
 * Checks for software updates from the configured updater endpoint.
 * Returns UpdateInfo if a new version is available, or null if up-to-date / not in Tauri.
 */
export async function checkForAppUpdates(): Promise<UpdateInfo | null> {
  if (!isTauriEnvironment()) {
    return null;
  }

  try {
    const update = await check();
    if (!update) {
      return null;
    }

    return {
      version: update.version,
      currentVersion: update.currentVersion,
      body: update.body,
      date: update.date,
      rawUpdate: update,
    };
  } catch (error) {
    console.warn('[UpdaterService] Failed to check for updates:', error);
    throw error;
  }
}

/**
 * Downloads and installs the update with progress tracking.
 */
export async function downloadAndApplyUpdate(
  update: Update,
  onProgress?: UpdateProgressCallback
): Promise<void> {
  let totalBytes = 0;
  let downloadedBytes = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        totalBytes = event.data.contentLength || 0;
        downloadedBytes = 0;
        if (onProgress) {
          onProgress(0, totalBytes, 0);
        }
        break;
      case 'Progress': {
        downloadedBytes += event.data.chunkLength;
        const percentage = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        if (onProgress) {
          onProgress(downloadedBytes, totalBytes, percentage);
        }
        break;
      }
      case 'Finished':
        if (onProgress) {
          onProgress(totalBytes, totalBytes, 100);
        }
        break;
    }
  });
}

/**
 * Safely stops backend sidecar child processes and relaunches the application.
 */
export async function restartApplication(): Promise<void> {
  if (!isTauriEnvironment()) {
    console.log('[UpdaterService] restartApplication invoked in non-Tauri environment.');
    return;
  }

  try {
    // Invoke custom Tauri backend teardown before triggering restart
    await invoke('prepare_update_and_restart');
  } catch (err) {
    console.warn('[UpdaterService] Failed to invoke prepare_update_and_restart command, attempting direct process relaunch:', err);
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (relaunchErr) {
      console.error('[UpdaterService] Fatal error while relaunching application:', relaunchErr);
      throw relaunchErr;
    }
  }
}
