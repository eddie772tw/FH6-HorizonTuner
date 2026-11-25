import { backendFetch } from '../../services/backend';

/** Desktop and MCP share the backend's one controller, run ID and cancellation. */
export async function autoTuneRequest<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const names: Record<string, string> = { auto_tune_poll: 'status', auto_tune_enabled: 'status', auto_tune_start: 'start', auto_tune_stop: 'stop', set_auto_tune_enabled: 'enabled', auto_tune_image: 'image' };
  const route = names[command];
  if (!route) throw new Error('Unknown automated tuning operation');
  const image = route === 'image';
  const read = route === 'status' || image;
  const response = await backendFetch('/api/auto-tune/' + route + (image ? '?runId=' + encodeURIComponent(String(args?.runId ?? '')) : ''), read ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args ?? {}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.detail || `Automated tuning: HTTP ${response.status}`);
  }
  if (image) return await response.arrayBuffer() as T;
  const data = await response.json();
  return (command === 'auto_tune_poll' ? data.run : command === 'auto_tune_enabled' ? data.developerOptions : data) as T;
}
