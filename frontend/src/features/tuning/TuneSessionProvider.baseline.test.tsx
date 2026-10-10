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

const model = vi.hoisted(() => ({
  carId: '42', loadedCarId: '42', carName: 'Synthetic car', carParams: null as CarParams | null,
  setCarParams: (_value: CarParams) => {}, saveCarParams: async () => {},
  data: null as TelemetryData | null,
}));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => model }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: model.data, isConnected: true }), subscribeToDecodedTelemetry: () => () => {} }));
vi.mock('./useEngineMeasurementArchive', () => ({ useEngineMeasurementArchive: () => ({ observation: null, current: null, calculation: null, invalidate: vi.fn() }) }));
vi.mock('./useEvMeasurementSession', () => ({ useEvMeasurementSession: () => ({ state: { gears: [] }, result: null }) }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../../components/UnitSettingsSidebar', () => ({ UnitSettingsSidebar: () => null }));
vi.mock('../road/RoadWorkflowView', () => ({ RoadWorkflowView: () => null }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (key: string) => key,
  settings: { units: { weight: 'kg', power: 'hp', torque: 'Nm' } },
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
function Harness({ carId = '42' }: { carId?: string }) {
  const [profile, setProfile] = useState(initialProfile);
  Object.assign(model, { carId, loadedCarId: carId, carParams: profile, setCarParams: setProfile });
  return <TuneSessionProvider><Probe /><TuningViewContent unitPreference={{ followGlobal: true } as UnitPreferenceOverride} onUnitPreferenceChange={() => {}} /></TuneSessionProvider>;
}
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label)!;
const latestPreview = (goal: string) => {
  const matches = pending.filter(item => item.input.goal === goal && item.input.inputSnapshot.baselineCurrent != null);
  return matches[matches.length - 1];
};
const settle = async (item: Pending, version?: string) => {
  const baselinePreview = preview(item.input.goal, version);
  await act(async () => item.resolve({ ok: true, json: async () => ({ schemaVersion: 'tuning-workflow-result/v1', baselinePreview }) } as Response));
  return baselinePreview;
};
const select = async (selector: string, value: string) => act(async () => {
  const element = host.querySelector<HTMLSelectElement>(selector)!;
  element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }));
});
const editNumber = async (label: string, value: number) => act(async () => {
  const fieldLabel = [...host.querySelectorAll('label')].find(item => item.textContent?.startsWith(label))!;
  const element = fieldLabel.closest('.d-flex.flex-column')!.querySelector('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(value));
  element.dispatchEvent(new Event('input', { bubbles: true }));
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear(); model.data = null;
  host = document.createElement('div'); root = createRoot(host); pending = [];
  vi.mocked(backendFetch).mockImplementation((_path, options) => new Promise(resolve => pending.push({ input: JSON.parse(options!.body as string), resolve })));
});
afterEach(async () => { await act(async () => root.unmount()); vi.mocked(backendFetch).mockReset(); });

const buildChanges = [
  { name: 'PI', next: { CarOrdinal: 42, CarPerformanceIndex: 750, CarClass: 3 } as TelemetryData },
  { name: 'Class', next: { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 4 } as TelemetryData },
];
it.each(buildChanges)('rejects a retained Road preview after live $name changes', async ({ next }) => {
  model.data = { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3 } as TelemetryData;
  await act(async () => root.render(<Harness />));
  await settle(latestPreview('Road'));
  expect(button('Apply local baseline').disabled).toBe(false);
  model.data = next;
  await act(async () => root.render(<Harness />));
  expect(session.baseline.goal).toBe('Road');
  expect(button('Apply local baseline').disabled).toBe(true);
  await act(async () => button('Apply local baseline').click());
  expect(session.baseline.fields).toEqual({});
  await settle(latestPreview('Road'));
  expect(button('Apply local baseline').disabled).toBe(false);
});
it.each(buildChanges)('rejects a late Road preview after live $name changes', async ({ next }) => {
  model.data = { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3 } as TelemetryData;
  await act(async () => root.render(<Harness />));
  const stale = latestPreview('Road');
  model.data = next;
  await act(async () => root.render(<Harness />));
  await settle(stale, 'stale-build-preview');
  expect(button('Apply local baseline').disabled).toBe(true);
  expect(host.textContent).not.toContain('stale-build-preview');
  await act(async () => button('Apply local baseline').click());
  expect(session.baseline.fields).toEqual({});
});
it.each(['ready', 'pending'])('rejects the old %s Road preview after build A to B to A', async state => {
  const original = { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3 } as TelemetryData;
  model.data = original;
  await act(async () => root.render(<Harness />));
  const stale = latestPreview('Road');
  if (state === 'ready') await settle(stale, 'old-A-preview');
  model.data = { ...original, CarPerformanceIndex: 750, CarClass: 4 };
  await act(async () => root.render(<Harness />));
  model.data = original;
  await act(async () => root.render(<Harness />));
  if (state === 'pending') await settle(stale, 'old-A-preview');
  expect(button('Apply local baseline').disabled).toBe(true);
  expect(host.textContent).not.toContain('old-A-preview');
  expect(session.baseline.fields).toEqual({});
});
it.each(['build', 'profile', 'season'])('guards Apply independently against a captured preview after %s changes', async scope => {
  model.data = { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3 } as TelemetryData;
  await act(async () => root.render(<Harness />));
  const capturedPreview = await settle(latestPreview('Road'));
  const capturedContext = session.baseline.context;
  if (scope === 'build') {
    model.data = { ...model.data, CarPerformanceIndex: 750 };
    await act(async () => root.render(<Harness />));
  } else if (scope === 'profile') {
    await act(async () => model.setCarParams({ ...model.carParams!, weight: 1500 }));
  } else {
    await act(async () => session.workflow.setSeason('Winter'));
  }
  await act(async () => session.baseline.apply(capturedPreview, capturedContext));
  expect(session.baseline.fields).toEqual({});
  expect(session.workflow.goal).toBe('Road');
});

it('keeps the Rally draft and settings panel after an edit, invalidates the preview and rejects late responses', async () => {
  // Synthetic transport responses test UI state, not Rust values or game evidence.
  await act(async () => root.render(<Harness />));
  await settle(latestPreview('Road'));
  await act(async () => button('Apply local baseline').click());
  const appliedFields = session.baseline.fields;
  await select('#tuning-draft-goal', 'Rally');
  await settle(latestPreview('Rally'));
  expect(button('Apply local baseline').disabled).toBe(false);
  await select('#rally-profile', 'cross-country');
  expect(session.baseline.goal).toBe('Rally');
  expect(host.querySelector<HTMLSelectElement>('#rally-profile')!.value).toBe('cross-country');
  expect(session.workflow.goal).toBe('Road');
  expect(button('Apply local baseline').disabled).toBe(true);
  await act(async () => button('Apply local baseline').click());
  expect(session.baseline.fields).toEqual(appliedFields);
  const oldReply = latestPreview('Rally');
  await select('#rally-profile', 'mixed-surface');
  await settle(oldReply, 'stale-rally-preview');
  expect(host.textContent).not.toContain('stale-rally-preview');
  expect(button('Apply local baseline').disabled).toBe(true);
  expect(session.baseline.goal).toBe('Rally');
  await settle(latestPreview('Rally'));
  expect(button('Apply local baseline').disabled).toBe(false);
  await act(async () => button('Cancel draft').click());
  expect(session.baseline.goal).toBe('Road');
  expect(host.querySelector('#rally-profile')).toBeNull();
  expect(session.baseline.fields).toEqual(appliedFields);
});

it('keeps Drag through parameter edits and initial identity hydration, but resets on car or live build changes', async () => {
  await act(async () => root.render(<Harness />));
  await select('#tuning-draft-goal', 'Drag');
  await select('[aria-label="Drag finish speed source"]', 'manual');
  expect(session.baseline.goal).toBe('Drag');
  expect(host.querySelector('[aria-label="Drag finish speed source"]')).not.toBeNull();
  await editNumber('Weight (', 1500);
  await editNumber('Front Spring Range', 35);
  await act(async () => model.setCarParams({ ...model.carParams!, maxHp: 350 }));
  expect(session.baseline.goal).toBe('Drag');
  expect(model.carParams!.weight).toBe(1500);
  expect(model.carParams!.spring_front_min).toBe(35);
  expect(button('Apply local baseline').disabled).toBe(true);
  // Initial live identity hydration preserves the idle session; a later build change resets it.
  model.data = { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3 } as TelemetryData;
  await act(async () => root.render(<Harness />));
  expect(session.baseline.goal).toBe('Drag');
  model.data = { ...model.data, CarPerformanceIndex: 750 };
  await act(async () => root.render(<Harness />));
  expect(session.baseline.goal).toBe('Road');
  await select('#tuning-draft-goal', 'Rally');
  await act(async () => root.render(<Harness carId="43" />));
  expect(session.baseline.goal).toBe('Road');
  expect(session.baseline.fields).toEqual({});
  expect(host.querySelector('#rally-profile')).toBeNull();
});
