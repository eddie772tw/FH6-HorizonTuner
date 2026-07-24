const API_BASE = '/api';

export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(data: Record<string, any>) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

export async function fetchOverlayConfig() {
  const res = await fetch(`${API_BASE}/overlay/config`);
  if (!res.ok) throw new Error('Failed to fetch HUD config');
  return res.json();
}

export async function saveOverlayConfig(config: Record<string, any>) {
  const res = await fetch(`${API_BASE}/overlay/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save HUD config');
  return res.json();
}

export async function fetchCarDatabase() {
  const res = await fetch(`${API_BASE}/cars`);
  if (!res.ok) throw new Error('Failed to fetch car database');
  return res.json();
}

export async function fetchAnalysisSessions() {
  const res = await fetch(`${API_BASE}/analysis/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchDragStatus() {
  const res = await fetch(`${API_BASE}/drag/status`);
  if (!res.ok) throw new Error('Failed to fetch drag status');
  return res.json();
}

export async function prepareDragTest() {
  const res = await fetch(`${API_BASE}/drag/prepare`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to prepare drag test');
  return res.json();
}

export async function cancelDragTest() {
  const res = await fetch(`${API_BASE}/drag/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to cancel drag test');
  return res.json();
}
