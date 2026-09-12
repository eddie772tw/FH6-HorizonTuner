import { backendFetch } from '../../services/backend';

export function downloadCapture(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSavedCapture(path: string, filename: string) {
  const response = await backendFetch('/api/road' + path);
  if (!response.ok) throw new Error('Capture unavailable. Older summaries may not include recorded frames.');
  downloadCapture(await response.json(), filename);
}
