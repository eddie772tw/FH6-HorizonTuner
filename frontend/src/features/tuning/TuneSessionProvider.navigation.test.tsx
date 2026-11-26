// Navigation tests isolate unrelated archive loading/export; the archive has its own contract tests.
vi.mock('./components/RecommendationArchive', () => ({ RecommendationArchive: () => null }));
// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import type { TelemetryData } from '../../hooks/useTelemetry';
import type { BaselinePreview } from '../../domain/tuning/types';
import { backendFetch } from '../../services/backend';
import { TuneSessionProvider, useTuneSession } from './TuneSessionProvider';
import { TuningViewContent } from './TuningView';
import type { UnitPreferenceOverride } from '../../utils/gameUnitSettings';

const diagnostics = vi.hoisted(() => ({ enabled: true }));
const model = vi.hoisted(() => ({
  carId: '42', loadedCarId: '42', carName: 'Synthetic car', carParams: null as CarParams | null,
  setCarParams: (_value: CarParams) => {}, saveCarParams: async (_value?: CarParams) => {}, hasUnsavedParams: true, selectionGeneration: 0,
  data: null as TelemetryData | null,
}));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => model }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: model.data, isConnected: true }), subscribeToDecodedTelemetry: () => () => {} }));
vi.mock('./useEngineMeasurementArchive', () => ({ useEngineMeasurementArchive: () => ({ observation: null, current: null, calculation: null, invalidate: vi.fn() }) }));
vi.mock('./useEvMeasurementSession', () => ({ useEvMeasurementSession: () => ({ state: { gears: [] }, result: null }) }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../../components/UnitSettingsSidebar', () => ({ UnitSettingsSidebar: () => null }));
vi.mock('../road/RoadWorkflowView', () => ({ RoadWorkflowView: () => null }));
vi.mock('./components/EngineDataStep', () => ({ EngineDataStep: () => <p>Engine</p> }));
vi.mock('./components/SetupVerificationStep', () => ({ SetupVerificationStep: () => <p>Verification</p> }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (key: string) => key,
  settings: { tuning_diagnostics_enabled: diagnostics.enabled, units: { weight: 'kg', power: 'hp', torque: 'Nm' } },
  convertSpringRate: (value: number) => ({ value, label: 'kgf/mm' }), convertSpringRateToKgfmm: (value: number) => value,
  convertHeight: (value: number) => ({ value, label: 'cm' }), convertHeightToCm: (value: number) => value,
  convertForce: (value: number) => ({ value, label: 'kgf' }), convertForceToKgf: (value: number) => value,
  convertPower: (value: number) => ({ value, label: 'W' }), convertTorque: (value: number) => ({ value, label: 'Nm' }),
  convertTirePressureFromPsi: (value: number) => ({ value, label: 'psi' }),
}) }));

const initialProfile = {
  weight: 1400, weight_distribution: 48, drivetrain: 'RWD', maxHp: 300, maxTorque: 400,
  spring_front_min: 30, spring_front_max: 100,
  adjustability: { gears: 6, gearbox: 'Full', suspension: 'Race', arb: 'Adjustable', diff: 'Adjustable' },
} as CarParams;
const preview = (goal: string, modelVersion = 'synthetic-test-preview'): BaselinePreview => ({
  schemaVersion: 'tuning-baseline-preview/v1', modelVersion, goal, stiffness: 'neutral', balance: 'neutral',
  missingInputs: [], canApply: true, affectedFields: ['spring.front'],
  fields: [{ key: 'spring.front', unit: 'kgf/mm', current: null, recommended: 50, delta: null, status: 'available', reason: null }],
});
type Pending = { input: { goal: string; inputSnapshot: Record<string, unknown> }; resolve: (value: Response) => void };
let pending: Pending[];
let session: ReturnType<typeof useTuneSession>;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Probe() { session = useTuneSession(); return null; }
function Harness({ carId = '42', generation = 0 }: { carId?: string; generation?: number }) {
  const [profile, setProfile] = useState(initialProfile);
  Object.assign(model, { carId, loadedCarId: carId, selectionGeneration: generation, carParams: profile, setCarParams: setProfile });
  return <TuneSessionProvider><Probe /><TuningViewContent unitPreference={{ followGlobal: true } as UnitPreferenceOverride} onUnitPreferenceChange={() => {}} /></TuneSessionProvider>;
}
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label)!;
const latestPreview = (goal: string) => {
  const matches = pending.filter(item => item.input.goal === goal);
  return matches[matches.length - 1];
};
const settle = async (item: Pending, version?: string) => {
  const baselinePreview = preview(item.input.goal, version);
  await act(async () => item.resolve({ ok: true, json: async () => ({ schemaVersion: 'tuning-workflow-result/v2', baselinePreview, readiness: { mechanical: true, engineInputs: true, measuredEngine: true, gearingAvailable: true } }) } as Response));
  return baselinePreview;
};
const select = async (selector: string, value: string) => act(async () => {
  const element = host.querySelector<HTMLSelectElement>(selector)!;
  element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }));
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear(); model.data = null; diagnostics.enabled = true; model.saveCarParams = async () => {};
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); pending = [];
  vi.mocked(backendFetch).mockImplementation((_path, options) => new Promise(resolve => pending.push({ input: JSON.parse(options!.body as string), resolve })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.mocked(backendFetch).mockReset(); });

const enter = (entrance: string) => act(async () => {
  if (entrance === 'Companion') await session.workflow.navigateToStep(4);
  else button(entrance).click();
});

it.each([
  ['Save & Proceed', 2],
  ['Go to chassis & tires', 2],
  ['3. Engine data & gearing', 3],
  ['Confirm setup and record a run', 4],
  ['4. Setup verification', 4],
  ['Companion', 4],
] as const)('%s saves the exact selected setup before entering Step %s', async (entrance, step) => {
  model.saveCarParams = vi.fn(async () => {});
  await act(async () => root.render(<Harness />));
  await settle(latestPreview('Road'));
  await select('#tuning-goal', 'Rally');
  await act(async () => { session.workflow.setSeason('Winter'); model.setCarParams({ ...model.carParams!, weight: 1670 }); });
  await settle(latestPreview('Rally'));
  await enter(entrance);
  expect(model.saveCarParams).toHaveBeenCalledTimes(1);
  expect(model.saveCarParams).toHaveBeenCalledWith(expect.objectContaining({ weight: 1670, tuningTarget: { goal: 'Rally', season: 'Winter' } }));
  expect(session.workflow.step).toBe(step);
  expect(session.workflow.goal).toBe('Rally');
  expect(session.result?.baselinePreview.goal).toBe('Rally');
});

it('retains input and prevents navigation on failure, then retries the same setup', async () => {
  model.saveCarParams = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<Harness />));
  await settle(latestPreview('Road'));
  await select('#tuning-goal', 'Drift');
  await settle(latestPreview('Drift'));
  await enter('Save & Proceed');
  expect(session.workflow.step).toBe(1);
  expect(host.textContent).toContain('Your edits are retained');
  expect(host.querySelector<HTMLSelectElement>('#tuning-goal')?.value).toBe('Drift');
  await enter('Save & Proceed');
  expect(session.workflow.step).toBe(2);
  expect(model.saveCarParams).toHaveBeenCalledTimes(2);
});

it('coalesces double clicks and discards a save completion after a vehicle change', async () => {
  let finish!: () => void;
  model.saveCarParams = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => root.render(<Harness />));
  await settle(latestPreview('Road'));
  await act(async () => { button('Save & Proceed').click(); button('Go to chassis & tires').click(); });
  expect(model.saveCarParams).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Harness carId="43" generation={1} />));
  await settle(latestPreview('Road'));
  await act(async () => finish());
  expect(session.workflow.step).toBe(1);
  expect(model.carId).toBe('43');
});

it('exposes baseline diagnostics as read-only and rejects a late result for an older target', async () => {
  await act(async () => root.render(<Harness />));
  const road = latestPreview('Road');
  await select('#tuning-goal', 'Rally');
  await settle(latestPreview('Rally'), 'current-result');
  await settle(road, 'stale-result');
  expect(host.textContent).toContain('current-result');
  expect(host.textContent).not.toContain('stale-result');
  expect(host.textContent).not.toMatch(/Draft target|Cancel draft|Apply local baseline/);
  expect(host.querySelector('[aria-label="Neutral baseline preview"] select')).toBeNull();
  diagnostics.enabled = false;
  await act(async () => root.render(<Harness />));
  expect(host.querySelector('[aria-label="Neutral baseline preview"]')).toBeNull();
});

it('checks a Companion step against the target in the same command before saving', async () => {
  const save = vi.fn(async () => {});
  model.saveCarParams = save;
  await act(async () => root.render(<Harness />));
  await settle(latestPreview('Road'));
  let advance!: Promise<void>;
  await act(async () => {
    advance = session.workflow.navigateToStep(4, undefined, { goal: 'Drag', season: 'Winter' });
  });
  expect(session.workflow.step).toBe(1);
  expect(save).not.toHaveBeenCalled();
  await settle(latestPreview('Drag'));
  await act(async () => advance);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ tuningTarget: { goal: 'Drag', season: 'Winter' } }));
  expect(session.workflow.step).toBe(4);
});
