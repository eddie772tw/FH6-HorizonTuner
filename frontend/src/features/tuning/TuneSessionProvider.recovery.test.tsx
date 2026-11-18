// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TuneSessionProvider, useTuneSession } from './TuneSessionProvider';
import { TuningMeasurementStep } from './components/TuningMeasurementStep';
import { createEngineCalculation } from './measurementInitialState';
import type { TelemetryData } from '../../hooks/useTelemetry';
import type { EngineBatchResult } from './engineBatch';
import type { TuningCaptureSample } from '../../domain/tuning/telemetryCapture';

const model = vi.hoisted(() => ({ data: null as TelemetryData | null,
  listener: undefined as undefined | ((frame: TelemetryData) => void), complete: vi.fn(),
  profile: { weight: 1400, weight_distribution: 48, drivetrain: 'RWD', maxHp: 300, maxTorque: 400 },
}));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => ({ carId: '42', loadedCarId: '42', carParams: model.profile }) }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: model.data, isConnected: true }),
  subscribeToDecodedTelemetry: (listener: (frame: TelemetryData) => void) => { model.listener = listener; return () => { model.listener = undefined; }; },
}));
vi.mock('./useEngineMeasurementArchive', () => ({ useEngineMeasurementArchive: () => ({
  observation: null, current: null, calculation: null, invalidate: vi.fn(), complete: model.complete,
}) }));
vi.mock('./useEvMeasurementSession', () => ({ useEvMeasurementSession: () => ({ state: { gears: [] }, result: null }) }));
vi.mock('./useWorkflowCalculation', () => ({ useWorkflowCalculation: () => ({ result: null, status: 'pending' }) }));
vi.mock('./engineBatch', () => ({ requestEngineBatch: (...args: unknown[]) => request(...args) }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (text: string) => text }) }));
vi.mock('../../hooks/useFileSave', () => ({ useFileSave: () => ({ save: vi.fn(), isSaving: false }) }));
vi.mock('./components/LiveDynoCurveCanvas', () => ({ LiveDynoCurveCanvas: () => null }));

let session: ReturnType<typeof useTuneSession>;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let pending: { samples: TuningCaptureSample[]; resolve: (result: EngineBatchResult) => void }[];
const request = (...args: unknown[]) => (args[2] as TuningCaptureSample[]).length
  ? new Promise<EngineBatchResult>(resolve => pending.push({ samples: args[2] as TuningCaptureSample[], resolve }))
  : Promise.resolve(result({ state: args[1] as EngineBatchResult['state'] }));
function Probe() { session = useTuneSession(); return null; }
const render = async (panel = true) => act(async () => root.render(<TuneSessionProvider><Probe />
  {panel && <TuningMeasurementStep carId="42" enabled />}</TuneSessionProvider>));
const frame = (TimestampMS: number) => ({ CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3,
  TimestampMS, EngineMaxRpm: 8000, CurrentEngineRpm: 1000, IsRaceOn: 0 } as TelemetryData);
const collecting = { ...createEngineCalculation('42'), identity: { ordinal: 42, performanceIndex: 700, carClass: 3 }, engineMaxRpm: 8000 };
const result = (patch: Partial<EngineBatchResult> = {}): EngineBatchResult => ({ state: collecting,
  readiness: { ready: false, guidance: 'timestamp-stalled', minimumAcceptedMs: 6000, minimumBins: 8 } as EngineBatchResult['readiness'],
  readySnapshot: null, ...patch });
const tick = async () => act(async () => vi.advanceTimersByTimeAsync(250));
const receive = async (...timestamps: number[]) => act(async () => timestamps.forEach(time => model.listener!(frame(time))));
const respond = async (value: EngineBatchResult) => act(async () => pending.shift()!.resolve(value));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); localStorage.clear(); model.data = null; model.complete.mockClear(); pending = [];
  host = document.createElement('div'); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });

it('waits for decoded frames and preserves first identity hydration during preparation', async () => {
  await render();
  expect(session.engineMeasurement.phase).toBe('preparing');
  model.data = frame(1000);
  await render();
  expect(session.engineMeasurement.phase).toBe('preparing');
  expect(session.engineMeasurement.sampleCount).toBe(0);
  await receive(1000); await tick(); await respond(result());
  expect(session.engineMeasurement.phase).toBe('collecting');
  expect(session.engineMeasurement.sampleCount).toBe(1);
  expect(host.textContent).not.toContain('A usable result is retained');
});

it('cuts restarted segments without dropping frames received during a batch and does not resume a manual pause', async () => {
  await render(); await receive(1000, 0, 100); await tick(); await receive(200);
  await respond(result({ continuity: { segmentStartIndex: 1, restartCount: 1, reason: 'timestamp-regressed', readySampleEndIndex: null, retainedSnapshot: null } }));
  expect(session.engineMeasurement.captureSnapshot().samples.map(s => s.timestampMS)).toEqual([0, 100, 200]);
  expect(host.textContent).toContain('Collection restarted automatically');
  await act(async () => session.engineMeasurement.pauseOrResume());
  await receive(300); await tick();
  expect(session.engineMeasurement.phase).toBe('paused');
  expect(session.engineMeasurement.sampleCount).toBe(3);
  expect(pending).toHaveLength(0);
  await act(async () => session.engineMeasurement.pauseOrResume());
  await tick();
  expect(pending[0].samples.map(s => s.timestampMS)).toEqual([200]);
});

it('restores a retained completed result with its original capture after additional collection resets', async () => {
  await render(); await receive(1000); await tick();
  const ready = { ...collecting, status: 'ready' as const, guidance: 'ready' as const, acceptedMs: 6500 };
  await respond(result({ state: ready, readySnapshot: ready, readiness: { ...result().readiness, ready: true } }));
  expect(session.engineMeasurement.phase).toBe('complete');
  await act(async () => session.engineMeasurement.collectMore());
  await receive(0); await tick();
  await respond(result({ continuity: { segmentStartIndex: 0, restartCount: 1, reason: 'timestamp-regressed', readySampleEndIndex: null, retainedSnapshot: null } }));
  expect(session.engineMeasurement.captureSnapshot().samples.map(s => s.timestampMS)).toEqual([0]);
  await act(async () => session.engineMeasurement.finishAdditional());
  expect(session.engineMeasurement.state).toEqual(ready);
  expect(session.engineMeasurement.readiness?.ready).toBe(true);
  expect(session.engineMeasurement.captureSnapshot().samples.map(s => s.timestampMS)).toEqual([1000]);
  await act(async () => session.engineMeasurement.complete());
  expect(model.complete.mock.calls[0][1].samples.map((s: TuningCaptureSample) => s.timestampMS)).toEqual([1000]);
});

it('preserves blocked reasons and never resumes a real identity failure automatically', async () => {
  await render(); await receive(1000); await tick();
  await respond(result({ state: { ...collecting, status: 'blocked', guidance: 'timestamp-regressed' } }));
  expect(session.engineMeasurement.phase).toBe('invalidated');
  expect(host.textContent).toContain('The driving session restarted. Restart collection');
  expect(host.textContent).not.toContain('The car or build changed');
  await receive(2000); await tick();
  expect(session.engineMeasurement.sampleCount).toBe(1);
  expect(pending).toHaveLength(0);
});

it.each(['EngineMaxRpm', 'CarPerformanceIndex'] as const)('invalidates a retained result when live %s changes, including first identity hydration', async channel => {
  await render(); await receive(1000); await tick();
  const ready = { ...collecting, status: 'ready' as const, guidance: 'ready' as const, acceptedMs: 6500 };
  await respond(result({ state: ready, readySnapshot: ready, readiness: { ...result().readiness, ready: true } }));
  model.data = { ...frame(2000), [channel]: channel === 'EngineMaxRpm' ? 8200 : 750 };
  await render();
  expect(session.engineMeasurement.phase).toBe('invalidated');
  expect(session.engineMeasurement.hasReadySnapshot).toBe(false);
  expect(host.textContent).toContain('The car or build changed');
});
