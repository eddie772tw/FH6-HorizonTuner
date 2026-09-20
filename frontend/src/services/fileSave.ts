import { invoke, isTauri } from '@tauri-apps/api/core';
import { backendFetch } from './backend';

export interface SaveRequest {
  filename: string;
  mimeType: string;
  /** Deferred until after the browser picker has consumed the click gesture. */
  load: () => Blob | Promise<Blob>;
  isCurrent?: () => boolean;
}
export type SaveResult = { status: 'cancelled' }
  | { status: 'saved'; filename: string; path?: string }
  | { status: 'downloaded'; filename: string };

interface SaveHandle {
  name: string;
  createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}
export interface SavePlatform {
  nativeSave?: (filename: string, data: Uint8Array) => Promise<string | null>;
  pickFile?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveHandle>;
  download: (blob: Blob, filename: string) => void;
}
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

export function exportFilename(value: string): string {
  const name = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
  return name || 'export.json';
}

function browserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Allow the browser to consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function defaultPlatform(): SavePlatform {
  if (isTauri()) return {
    nativeSave: (filename, data) => invoke<string | null>('save_export_file', { suggestedName: filename, data: Array.from(data) }),
    download: browserDownload,
  };
  const picker = (window as Window & { showSaveFilePicker?: SavePlatform['pickFile'] }).showSaveFilePicker;
  return { pickFile: picker?.bind(window), download: browserDownload };
}

/** A native path is returned only after a successful write; browser fallback only starts a download. */
export async function saveFile(request: SaveRequest, platform: SavePlatform = defaultPlatform()): Promise<SaveResult> {
  const filename = exportFilename(request.filename);
  let handle: SaveHandle | undefined;
  if (!platform.nativeSave && platform.pickFile) {
    try {
      const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.json';
      // Must precede all network/Blob work: transient activation expires across awaits.
      handle = await platform.pickFile({ suggestedName: filename,
        types: [{ description: request.mimeType, accept: { [request.mimeType]: [extension] } }] });
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return { status: 'cancelled' };
      throw error;
    }
  }
  if (request.isCurrent && !request.isCurrent()) return { status: 'cancelled' };
  const blob = await request.load();
  if (request.isCurrent && !request.isCurrent()) return { status: 'cancelled' };
  if (blob.size > MAX_EXPORT_BYTES) throw new Error('Export exceeds the 64 MiB limit.');
  if (platform.nativeSave) {
    const path = await platform.nativeSave(filename, new Uint8Array(await blob.arrayBuffer()));
    return path === null ? { status: 'cancelled' } : { status: 'saved', filename: path.split(/[\\/]/).pop() || filename, path };
  }
  if (handle) {
    const writer = await handle.createWritable();
    try {
      await writer.write(blob);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => undefined);
      throw error;
    }
    return { status: 'saved', filename: handle.name };
  }
  platform.download(blob, filename);
  return { status: 'downloaded', filename };
}

/** Keep HTTP/API errors inside the app; never navigate a WebView to the backend. */
export async function fetchExportBlob(path: string, expectedMimeType: string, init?: RequestInit): Promise<Blob> {
  const response = await backendFetch(path, init);
  const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok || mimeType !== expectedMimeType.toLowerCase()) {
    let detail = `Export request failed (HTTP ${response.status}).`;
    if (mimeType === 'application/json') {
      const body = await response.json().catch(() => null) as { error?: unknown; detail?: unknown } | null;
      const message = body?.error ?? body?.detail;
      if (typeof message === 'string') detail = message;
    }
    throw new Error(detail);
  }
  return response.blob();
}
