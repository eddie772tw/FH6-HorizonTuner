// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { useWorkflowCalculation } from './useWorkflowCalculation';
import { backendFetch } from '../../services/backend';
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
const fetchMock = vi.mocked(backendFetch);
const good = (tag: string, schemaVersion = 'tuning-workflow-result/v2') => ({ ok: true, json: async () => ({ schemaVersion, tag }) }) as Response;
let root: Root; let host: HTMLDivElement;
const profile = { weight: 1300, weight_distribution: 54 } as CarParams;
function Probe({ carId, weight = 1300, goal = 'Road', electric = false, capture = 'capture1', cvt = false, aero = {} }: { carId: string; weight?: number; goal?: string; electric?: boolean; capture?: string; cvt?: boolean; aero?: Partial<CarParams> }) {
  const { result, status } = useWorkflowCalculation(carId, goal, 'Summer', { ...profile, weight, isElectric: electric, ...aero, ...(cvt ? { transmission: { type: 'cvt' as const, capability: 'unknown' as const } } : {}) }, null, null, { carId, evEvidence: electric ? { kind:'saved-ev', evidenceId:capture } : null, engineObservation: electric ? null : {id:capture} });
  return <output>{status}:{JSON.stringify(result)}</output>;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); fetchMock.mockReset(); host = document.createElement('div'); root = createRoot(host);
});

it('invalidates goal, mode and capture revisions and rejects their late replies', async () => {
  const pending: ((response:Response)=>void)[]=[];
  fetchMock.mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
  await act(async()=>root.render(<Probe carId="1" />));
  await act(async()=>root.render(<Probe carId="1" goal="Rally" />));
  await act(async()=>root.render(<Probe carId="1" goal="Rally" electric />));
  await act(async()=>root.render(<Probe carId="1" goal="Rally" electric capture="new-capture" />));
  expect(host.textContent).toBe('pending:null');
  expect(JSON.parse(fetchMock.mock.calls[3][1]!.body as string).schemaVersion).toBe('tuning-workflow-result/v3');
  await act(async()=>pending[3](good('new-EV-capture','tuning-workflow-result/v3')));expect(host.textContent).toContain('new-EV-capture');
  for(const resolve of pending.slice(0,3)) {
    await act(async()=>resolve(good('stale-evidence')));expect(host.textContent).not.toContain('stale-evidence');
  }
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
it('invalidates changes and clears of loads and balance, rejecting late corrected results', async () => {
  const pending: ((response: Response) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  for (const aero of [
    { aero_downforce_front: 100, aero_downforce_rear: 150, aeroBalance: .4 },
    { aero_downforce_front: 100, aero_downforce_rear: null, aeroBalance: .4 },
    { aero_downforce_front: 100, aero_downforce_rear: null, aeroBalance: null },
    { aero_downforce_front: null, aero_downforce_rear: null, aeroBalance: null },
  ]) {
    await act(async () => root.render(<Probe carId="1" aero={aero} />));
    expect(host.textContent).toBe('pending:null');
    expect(JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1]!.body as string).profile).toMatchObject(aero);
  }
  await act(async () => pending[3](good('no-correction')));
  for (const resolve of pending.slice(0,3)) await act(async () => resolve(good('stale-correction')));
  expect(host.textContent).toContain('no-correction'); expect(host.textContent).not.toContain('stale-correction');
});
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
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 'tuning-workflow-result/v2', cvt: { schemaVersion: 'cvt-qualification/v1', status: 'unsupported', captureStatus: 'missing', ratioPreview: null, diagnostics: [{ code: 'raw-capture-required' }] }, gearing: null, recommendation: null, readiness: { measuredEngine: false, gearingAvailable: false } }) } as Response);
  await act(async () => root.render(<Probe carId="1" cvt />));
  expect(host.textContent).toContain('ready:');
  expect(host.textContent).toContain('raw-capture-required');
});
