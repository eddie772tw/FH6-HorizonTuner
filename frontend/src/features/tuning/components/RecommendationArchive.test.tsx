// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecommendationArchive } from './RecommendationArchive';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock('../../../services/backend', () => ({ backendFetch: mocks.fetch }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (key: string) => key }) }));
vi.mock('../../../hooks/useFileSave', () => ({ useFileSave: () => ({ save: mocks.save, isSaving: false }) }));
let root: Root; let host: HTMLDivElement;
const record = { id: 'old-1435', discipline: 'Rally', recommendation: {
  formulaVersion: 'rust/ice-measured-workflow-v3', inputSnapshot: { carId: '1435', goal: 'Rally', gearingModelVersion: 'aego-rally/v1' },
  fields: { 'gearing.finalDrive': { value: 3.52, unit: 'ratio' } },
} };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.fetch.mockReset(); mocks.save.mockReset();
  host = document.createElement('div'); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); });
async function open() {
  await act(async () => root.render(<RecommendationArchive />));
  await act(async () => { const panel = host.querySelector('details')!; panel.open = true; panel.dispatchEvent(new Event('toggle')); });
}
it('exports the original stored record without a qualification wrapper or mutation', async () => {
  const before = JSON.stringify(record);
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => [{ status: 'retired', validated: false, record }] });
  await open();
  expect(host.textContent).toContain('Retired · read-only · not validated');
  expect(host.textContent).toContain('aego-rally/v1');
  const button = host.querySelector('button')!;
  expect(button.textContent).toBe('Export original record');
  await act(async () => button.click());
  const blob = await mocks.save.mock.calls[0][0].load();
  const exported = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
  expect(JSON.parse(exported)).toEqual(record);
  expect(JSON.stringify(record)).toBe(before);
  expect(mocks.fetch.mock.calls.every(([path, options]) => path === '/api/road/archives' && !options?.method)).toBe(true);
});
it('exports recorded run frames through their saved session capture', async () => {
  const documents = [{ id: 'old-run', kind: 'run', sessionId: 'session-1' }];
  const capture = { schemaVersion: 'tuning-capture/v1', samples: [{ rpm: 3000 }], references: { runId: 'old-run' } };
  mocks.fetch.mockImplementation(async (path: string) => path === '/api/road/archives'
    ? { ok: true, json: async () => [{ status: 'retired', validated: false, record, documents }] }
    : { ok: true, headers: { get: () => 'application/json' }, blob: async () => new Blob([JSON.stringify(capture)]) });
  await open();
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes('Export recorded frames'));
  expect(button).toBeDefined();
  await act(async () => button!.click());
  const blob = await mocks.save.mock.calls[0][0].load();
  const exported = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
  expect(JSON.parse(exported)).toEqual(capture);
  expect(mocks.fetch).toHaveBeenCalledWith('/api/road/workflows/old-1435/runs/old-run/capture', undefined);
});
it.each([{ status: 'retired', validated: true, record }, { status: 'available', validated: false, record }])(
  'does not present an archive response as an applicable current result', async item => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => [item] });
    await open();
    expect(host.textContent).toContain('Archived recommendations could not be loaded');
    expect(host.querySelector('button')).toBeNull();
  });
