// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { useWorkflowCalculation } from './useWorkflowCalculation';
import { backendFetch } from '../../services/backend';
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
const fetchMock = vi.mocked(backendFetch);
const good = (tag: string) => ({ ok: true, json: async () => ({ schemaVersion: 'tuning-workflow-result/v1', tag }) }) as Response;
let root: Root; let host: HTMLDivElement;
const profile = { weight: 1300, weight_distribution: 54 } as CarParams;
function Probe({ carId, weight = 1300, cvt = false }: { carId: string; weight?: number; cvt?: boolean }) {
  const { result, status } = useWorkflowCalculation(carId, 'Road', 'Summer', { ...profile, weight, ...(cvt ? { transmission: { type: 'cvt' as const, capability: 'unknown' as const } } : {}) }, null, null, {});
  return <output>{status}:{JSON.stringify(result)}</output>;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); fetchMock.mockReset(); host = document.createElement('div'); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
it('distinguishes pending and failure, then recovers without displaying missing-input guidance', async () => {
  let resolve!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(good('recovered'));
  await act(async () => root.render(<Probe carId="1" />));
  expect(host.textContent).toBe('pending:null');
  await act(async () => resolve({ ok: false, status: 503 } as Response));
  expect(host.textContent).toBe('error:null');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(host.textContent).toContain('ready:'); expect(host.textContent).toContain('recovered');
});
it('rejects reordered results across car changes and invalidates unsaved draft changes immediately', async () => {
  const pending: ((response: Response) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise(r => pending.push(r)));
  await act(async () => root.render(<Probe carId="1" />));
  await act(async () => root.render(<Probe carId="2" />));
  await act(async () => pending[1](good('car2')));
  expect(host.textContent).toContain('car2');
  await act(async () => pending[0](good('stale')));
  expect(host.textContent).not.toContain('stale');
  await act(async () => root.render(<Probe carId="2" weight={1500} />));
  expect(host.textContent).toBe('pending:null');
  expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string).profile.weight).toBe(1500);
});
it('does not redisplay an old A result after A to B to A', async () => {
  fetchMock.mockResolvedValueOnce(good('oldA')).mockImplementation(() => new Promise(() => {}));
  await act(async () => root.render(<Probe carId="1" />));
  expect(host.textContent).toContain('oldA');
  await act(async () => root.render(<Probe carId="2" />));
  await act(async () => root.render(<Probe carId="1" />));
  expect(host.textContent).toBe('pending:null');
});
it('rejects late ICE results and old servers after an explicit CVT selection', async () => {
  const pending: ((response: Response) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise(r => pending.push(r)));
  await act(async () => root.render(<Probe carId="1" />));
  await act(async () => root.render(<Probe carId="1" cvt />));
  expect(host.textContent).toBe('pending:null');
  expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).evidence).toBeNull();
  await act(async () => pending[0](good('late-ice')));
  expect(host.textContent).not.toContain('late-ice');
  await act(async () => pending[1](good('old-server')));
  expect(host.textContent).toBe('error:null');
});
it('consumes the Rust CVT diagnostics while keeping application unavailable', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 'tuning-workflow-result/v1', cvt: { schemaVersion: 'cvt-qualification/v1', status: 'unsupported', captureStatus: 'missing', diagnostics: [{ code: 'raw-capture-required' }] }, gearing: null, recommendation: null, readiness: { measuredEngine: false, gearingAvailable: false } }) } as Response);
  await act(async () => root.render(<Probe carId="1" cvt />));
  expect(host.textContent).toContain('ready:');
  expect(host.textContent).toContain('raw-capture-required');
});
