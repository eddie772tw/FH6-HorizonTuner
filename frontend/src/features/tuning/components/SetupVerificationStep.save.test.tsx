// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SetupVerificationStep } from './SetupVerificationStep';
import { backendFetch } from '../../../services/backend';
import type { WorkflowRecommendation } from '../../../domain/tuning/types';
vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (text: string) => text }) }));
vi.mock('../../../hooks/useFileSave', () => ({ useFileSave: () => ({ save: vi.fn(), isSaving: false }) }));
vi.mock('../../road/RoadWorkflowView', () => ({ RoadWorkflowView: () => <p>Road baseline workflow</p> }));
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.mocked(backendFetch).mockReset(); });
it('saves the recommendation, retains it on failure, reports pending and supports retry without duplicate snapshots', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); root = createRoot(host);
  const recommendation = { fields: { 'spring.front': { value: 50, unit: 'kgf/mm' } }, inputSnapshot: { carId: '42' } } as unknown as WorkflowRecommendation;
  const writes: unknown[] = []; const busy: boolean[] = []; let finish!: (value: Response) => void;
  vi.mocked(backendFetch).mockImplementation(async (_path, options) => {
    if (!options) return { ok: true, json: async () => [] } as Response;
    writes.push(JSON.parse(options.body as string)); return new Promise(resolve => { finish = resolve; });
  });
  await act(async () => root.render(<SetupVerificationStep goal="Rally" carId="42" recommendation={recommendation} onBusyChange={value => busy.push(value)} />));
  const button = () => host.querySelector('button')!;
  await act(async () => { button().click(); button().click(); });
  expect(writes).toEqual([{ discipline: 'Rally', recommendation }]);
  expect(button().disabled).toBe(true); expect(host.textContent).toContain('Saving recommendation snapshot…');
  await act(async () => finish({ ok: false } as Response));
  expect(host.textContent).toContain('Snapshot could not be saved. Try again.');
  expect(host.textContent).toContain('50 kgf/mm'); expect(button().disabled).toBe(false);
  await act(async () => button().click());
  await act(async () => finish({ ok: true, json: async () => ({ id: 'saved-1', discipline: 'Rally', createdAt: 1, recommendation }) } as Response));
  expect(host.textContent).toContain('Compatibility snapshot saved.');
  expect(busy).toEqual([true, false, true, false]);
  expect(writes).toEqual([{ discipline: 'Rally', recommendation }, { discipline: 'Rally', recommendation }]);
});
