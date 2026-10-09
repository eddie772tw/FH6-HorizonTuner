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
const settle = async (item: Pending, version?: string) => act(async () => item.resolve({ ok: true, json: async () => ({ schemaVersion: 'tuning-workflow-result/v1', baselinePreview: preview(item.input.goal, version) }) } as Response));
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
