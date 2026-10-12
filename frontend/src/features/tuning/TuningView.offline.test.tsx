// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CarParamsProvider, useCarParams, type CarParams } from '../../context/CarParamsContext';
import { ToastProvider } from '../../context/ToastContext';
import { TuneSessionProvider, useTuneSession } from './TuneSessionProvider';
import { TuningViewContent } from './TuningView';
import { backendFetch } from '../../services/backend';
import { engineDependencyKey, type EngineObservation } from './engineObservationIdentity';
import { createEngineCalculation } from './measurementInitialState';
import type { TelemetryData } from '../../hooks/useTelemetry';
import type { UnitPreferenceOverride } from '../../utils/gameUnitSettings';

// Synthetic transport responses verify real providers/UI. They are not game captures
// or qualification evidence; numerical qualification remains covered by Rust tests.
const transport = vi.hoisted(() => ({ data: null as TelemetryData | null, isConnected: true }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => transport, subscribeToDecodedTelemetry: () => () => {} }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s, settings: {}, updateSettings: vi.fn(),
  convertSpringRate: (value: number) => ({ value, label: 'kgf/mm' }),
  convertHeight: (value: number) => ({ value, label: 'cm' }),
  convertTirePressureFromPsi: (value: number) => ({ value, label: 'psi' }),
  convertSpeed: (value: number) => ({ value, label: 'km/h' }),
}) }));
vi.mock('../../components/UnitSettingsSidebar', () => ({ UnitSettingsSidebar: () => null }));
vi.mock('../road/RoadWorkflowView', () => ({ RoadWorkflowView: () => null }));
vi.mock('./components/Step1GoalSetup', () => ({ Step1GoalSetup: () => null }));
vi.mock('./components/Step2ChassisTuner', () => ({ Step2ChassisTuner: () => null }));
vi.mock('./components/SetupVerificationStep', () => ({ SetupVerificationStep: () => null }));
vi.mock('./components/LiveDynoCurveCanvas', () => ({ LiveDynoCurveCanvas: () => null }));

const profile = (weight = 1400): CarParams => ({
  weight, weight_distribution: 48, drivetrain: 'RWD', induction: 'NA', maxHp: 300, maxTorque: 400,
  maxHpRpm: 6000, maxTorqueRpm: 4500, aeroEfficiency: .5, dyno_curve: {},
  adjustability: { gears: 6, gearbox: 'Full', suspension: 'Race', arb: 'Adjustable', aero: 'Fixed', brakes: 'Adjustable', diff: 'Adjustable' },
});
const observation = (carId: string): EngineObservation => ({
  schema: 'engine-observation/v1', id: 'synthetic-' + carId, carId, capturedAt: 1, source: 'measured',
  dependencyKey: engineDependencyKey(carId, profile()),
  data: { ...createEngineCalculation(carId), status: 'ready', engineMaxRpm: 7000,
    identity: { ordinal: Number(carId), performanceIndex: 700, carClass: 3 },
    observedPeakPower: { rpm: 6000, value: 300 }, observedPeakTorque: { rpm: 4500, value: 400 } },
});
const archive = [observation('42'), observation('43')];
const capture = (item: EngineObservation) => ({ schemaVersion: 'tuning-capture/v1',
  metadata: { carId: item.carId }, samples: [], references: { engineObservationId: item.id, dependencyKey: item.dependencyKey } });
const response = (value: unknown, ok = true) => ({ ok, json: async () => value }) as Response;
const workflow = (input: any, tag = 'synthetic-preview') => ({
  schemaVersion: 'tuning-workflow-result/v2', chassis: null, alignment: null, gearing: null, recommendation: null,
  tireEvidence: null, evidenceProvenance: null,
  readiness: { mechanical: true, engineInputs: true, measuredEngine: false, gearingAvailable: false },
  baselinePreview: { schemaVersion: 'tuning-baseline-preview/v1', modelVersion: tag, goal: input.goal,
    stiffness: 'neutral', balance: 'neutral', missingInputs: [], canApply: true, affectedFields: ['spring.front'],
    fields: [{ key: 'spring.front', unit: 'kgf/mm', current: null, recommended: 50, delta: null, status: 'available', reason: null }] },
  ...(input.profile?.transmission?.type === 'cvt' ? {
    cvt: { schemaVersion: 'cvt-qualification/v1', status: 'unsupported', captureStatus: 'missing', diagnostics: [] },
  } : {}),
});
let host: HTMLDivElement, root: Root;
let cars: ReturnType<typeof useCarParams>, session: ReturnType<typeof useTuneSession>;
let profiles: Record<string, CarParams>;
const pendingProfiles = new Map<string, ((r: Response) => void)[]>();
let deferProfiles = false, deferCapture = false, resolveCapture: ((r: Response) => void) | undefined;
let deferWorkflow = false, analysisReady = false;
let pendingWorkflows: { input: any; resolve: (r: Response) => void }[];
function Probe() { cars = useCarParams(); session = useTuneSession(); return null; }
const Harness = () => <ToastProvider><CarParamsProvider><TuneSessionProvider><Probe />
  <TuningViewContent unitPreference={{ followGlobal: true } as UnitPreferenceOverride} onUnitPreferenceChange={() => {}} />
</TuneSessionProvider></CarParamsProvider></ToastProvider>;
const mount = () => act(async () => root.render(<Harness />));
const choose = (id: string) => act(async () => {
  const field = host.querySelector<HTMLSelectElement>('#tune-saved-vehicle')!;
  field.value = id; field.dispatchEvent(new Event('change', { bubbles: true }));
});
const button = (label: string) => [...host.querySelectorAll('button')].find(node => node.textContent === label)!;
const confirm = () => act(async () => {
  const checkbox = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(node => node.closest('label')?.textContent?.includes('powertrain parts'))!;
  checkbox.click();
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear();
  vi.useFakeTimers(); transport.data = null; transport.isConnected = true;
  host = document.createElement('div'); root = createRoot(host);
  profiles = { default_car: profile(), '42': profile(), '43': profile(1600) };
  pendingProfiles.clear(); deferProfiles = false; deferCapture = false; resolveCapture = undefined;
  deferWorkflow = false; analysisReady = false; pendingWorkflows = [];
  vi.mocked(backendFetch).mockImplementation(async (path, options) => {
    const url = String(path), body = options?.body ? JSON.parse(String(options.body)) : null;
    if (url === '/api/cars/database') return response({});
    if (url === '/api/cars/with_params') return response([{ id: '42', name: 'Synthetic A' }, { id: '43', name: 'Synthetic B' }]);
    if (url.startsWith('/api/car_params/') && !options?.method) {
      const id = url.split('/').pop()!;
      if (deferProfiles) return new Promise(resolve => pendingProfiles.set(id, [...pendingProfiles.get(id) ?? [], resolve]));
      return response(profiles[id] ?? { error: 'not found' });
    }
    if (url === '/api/tuning/profile') return response(body);
    if (url === '/api/road/engine-observations') return response(archive);
    if (url === '/api/tuning/engine-archive') return response(body);
    if (url.endsWith('/capture')) {
      if (deferCapture) return new Promise(resolve => { resolveCapture = resolve; });
      return response(capture(archive.find(item => url.includes(item.id))!));
    }
    if (url === '/api/tuning/engine-analysis') return analysisReady ? response({ status: 'ready', engineMaxRpm: 7000,
      peakPower: { rpm: 6000, value: 300 }, peakTorque: { rpm: 4500, value: 400 }, diagnostics: [] }) : new Promise(() => {});
    if (url === '/api/tuning/workflow') {
      if (deferWorkflow) return new Promise(resolve => pendingWorkflows.push({ input: body, resolve }));
      const result = workflow(body); result.readiness.measuredEngine = Boolean(body.evidence);
      return response(result);
    }
    return response([]);
  });
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.mocked(backendFetch).mockReset(); });

it('selects a saved profile through normal Tune UI and requires powertrain confirmation for its archive', async () => {
  await mount(); await choose('42');
  expect(cars).toMatchObject({ carId: '42', loadedCarId: '42', carName: 'Synthetic A', selectionSource: 'saved' });
  expect(session.identity.performanceIndex).toBeNull();
  expect(host.textContent).toContain('Saved vehicle · offline');
  await act(async () => session.workflow.setStep(3));
  expect(session.engine.archive.map(item => item.carId)).toEqual(['42']);
  expect(button('Reuse the confirmed engine observation').disabled).toBe(true);
  await confirm(); await act(async () => button('Reuse the confirmed engine observation').click());
  expect(session.engine.observation?.id).toBe('synthetic-42');
  expect(session.engine.observation?.capture?.references?.engineObservationId).toBe('synthetic-42');
  await act(async () => { session.engineMeasurement.restart(true); session.capture.start(); });
  expect(session.engineMeasurement.phase).toBe('idle'); expect(session.capture.status).toBe('idle');
  await choose('43');
  expect(session.engine.observation).toBeNull();
  expect(session.engine.compatible).toHaveLength(1);
  expect(button('Reuse the confirmed engine observation').disabled).toBe(true);
});

it('rejects late profile replies across A→B→A and keeps loadedCarId empty until the current profile loads', async () => {
  await mount(); deferProfiles = true;
  await choose('42'); const oldA = pendingProfiles.get('42')![0];
  await choose('43'); const oldB = pendingProfiles.get('43')![0];
  await choose('42'); const currentA = pendingProfiles.get('42')![1];
  expect(cars.loadedCarId).toBeNull(); expect(session.profile).toBeNull();
  await act(async () => { oldA(response(profile(1111))); oldB(response(profile(2222))); });
  expect(cars.loadedCarId).toBeNull();
  await act(async () => currentA(response(profile(1550))));
  expect(cars.loadedCarId).toBe('42'); expect(session.profile?.weight).toBe(1550);
});

it('invalidates selected evidence and its late capture after a setup edit, requiring fresh confirmation', async () => {
  await mount(); await choose('42'); await act(async () => session.workflow.setStep(3));
  await confirm(); deferCapture = true;
  await act(async () => button('Reuse the confirmed engine observation').click());
  expect(resolveCapture).toBeDefined();
  await act(async () => cars.setCarParams({ ...cars.carParams!, spring_front_min: 35 }));
  await act(async () => resolveCapture!(response(capture(archive[0]))));
  expect(session.engine.observation).toBeNull(); expect(session.engine.calculation).toBeNull();
  expect(button('Reuse the confirmed engine observation').disabled).toBe(true);
});

it('rejects a late saved capture across vehicle A→B→A without reviving the first selection', async () => {
  await mount(); await choose('42'); await act(async () => session.workflow.setStep(3));
  await confirm(); deferCapture = true;
  await act(async () => button('Reuse the confirmed engine observation').click());
  const stale = resolveCapture!;
  await choose('43'); await choose('42');
  await act(async () => stale(response(capture(archive[0]))));
  expect(session.engine.observation).toBeNull(); expect(session.engine.calculation).toBeNull();
  expect(button('Reuse the confirmed engine observation').disabled).toBe(true);
});

it('explains a completed engine analysis that remains review-only after the setup context was invalidated', async () => {
  analysisReady = true;
  await mount(); await choose('42'); await act(async () => session.workflow.setStep(3));
  await confirm(); await act(async () => button('Reuse the confirmed engine observation').click());
  expect(session.engine.calculation?.status).toBe('ready');
  expect(session.result?.readiness.measuredEngine).toBe(true);
  await choose('43'); await choose('42');
  await confirm(); await act(async () => button('Reuse the confirmed engine observation').click());
  expect(session.engine.calculation?.status).toBe('ready');
  expect(session.result?.readiness.measuredEngine).toBe(false);
  expect(host.textContent).toContain('This saved observation is review-only in the current vehicle/setup context.');
  const calls = vi.mocked(backendFetch).mock.calls.filter(([path]) => path === '/api/tuning/workflow');
  expect(calls[calls.length - 1][1]!.body).toContain('"evidence":null');
});

it('isolates a manual selection from cached live data, then invalidates it on explicit live takeover and reconnection', async () => {
  transport.data = { CarOrdinal: 43, CarClass: 3, CarPerformanceIndex: 700, EngineMaxRpm: 7000 } as TelemetryData;
  await mount(); expect(cars.selectionSource).toBe('live');
  await choose('42'); await act(async () => session.workflow.setStep(3));
  await confirm(); await act(async () => button('Reuse the confirmed engine observation').click());
  expect(session.engine.observation?.id).toBe('synthetic-42');
  expect(session.identity.performanceIndex).toBeNull();
  await act(async () => button('Follow Data Out').click());
  expect(cars).toMatchObject({ carId: '43', selectionSource: 'live' }); expect(session.engine.observation).toBeNull();
  await choose('42'); transport.isConnected = false; await mount();
  transport.isConnected = true; await mount();
  expect(cars).toMatchObject({ carId: '43', selectionSource: 'live' });
  await choose('42'); transport.data = { ...transport.data!, CarOrdinal: 42 }; await mount();
  expect(cars).toMatchObject({ carId: '42', selectionSource: 'live' });
  expect(session.engine.observation).toBeNull();
});

it('rejects old Apply contexts and late previews across saved A→B→A, including the same-car live handoff', async () => {
  await mount(); await choose('42');
  const retained = workflow({ goal: 'Road' }).baselinePreview as any, context = session.baseline.context;
  deferWorkflow = true;
  await choose('43'); await choose('42');
  await act(async () => session.baseline.apply(retained, context));
  expect(session.baseline.fields).toEqual({});
  const late = pendingWorkflows[0];
  await act(async () => late.resolve(response(workflow(late.input, 'stale-preview'))));
  expect(host.textContent).not.toContain('stale-preview');
  expect(button('Apply local baseline').disabled).toBe(true);
  transport.data = { CarOrdinal: 42, CarClass: 3, CarPerformanceIndex: 700 } as TelemetryData; await mount();
  expect(cars.selectionSource).toBe('live');
  await act(async () => session.baseline.apply(retained, context));
  expect(session.baseline.fields).toEqual({});
});

it('rejects a dyno poll from an earlier live selection after the same car is selected offline', async () => {
  transport.data = { CarOrdinal: 42 } as TelemetryData; await mount();
  deferProfiles = true;
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  const poll = pendingProfiles.get('42')![0];
  await choose('43'); await choose('42');
  const loaded = pendingProfiles.get('42')![1];
  await act(async () => loaded(response(profile())));
  await act(async () => poll(response({ ...profile(9999), dyno_curve: { '7000': { hp: 9999, torque: 9999 } } })));
  expect(cars.carParams?.weight).toBe(1400); expect(cars.carParams?.dyno_curve).toEqual({});
});

it.each(['ev', 'cvt', 'ev-cvt'])('routes saved %s profiles without admitting ICE evidence or starting live collection', async mode => {
  profiles['42'] = { ...profile(), isElectric: mode !== 'cvt',
    ...(mode.includes('cvt') ? { transmission: { type: 'cvt', capability: 'final-drive-only' } } : {}),
    evGearbox: { allForwardGearsConfirmed: true, finalDrive: 4, gearRatios: [1],
      finalDriveAdjustable: true, gearAdjustable: [false] } };
  await mount(); await choose('42'); await act(async () => session.workflow.setStep(3));
  expect(session.engine.compatible).toHaveLength(0); expect(session.engine.current).toBeNull();
  expect(host.textContent).toContain(mode.includes('cvt') ? 'CVT' : 'EV');
  await act(async () => { session.engineMeasurement.ensureStarted(true); session.evMeasurement.restart(); });
  expect(session.engineMeasurement.sampleCount).toBe(0); expect(session.engineMeasurement.phase).toBe('idle');
  expect(session.evMeasurement.phase).toBe('idle');
});

it('keeps a missing saved profile unavailable rather than loading guessed defaults', async () => {
  await mount(); delete profiles['42']; vi.spyOn(console, 'error').mockImplementation(() => {});
  await choose('42');
  expect(cars.loadedCarId).toBeNull(); expect(session.profile).toBeNull();
  expect(host.textContent).toContain('Vehicle profile is unavailable. Retrying…');
  vi.mocked(console.error).mockRestore();
});
