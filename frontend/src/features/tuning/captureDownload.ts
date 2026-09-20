import { fetchExportBlob, type SaveRequest } from '../../services/fileSave';

export function captureSaveRequest(value: unknown, filename: string): SaveRequest {
  return { filename, mimeType: 'application/json',
    load: () => new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }) };
}

export function savedCaptureSaveRequest(path: string, filename: string): SaveRequest {
  return { filename, mimeType: 'application/json',
    load: () => fetchExportBlob('/api/road' + path, 'application/json') };
}
