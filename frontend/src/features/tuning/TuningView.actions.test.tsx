// Navigation tests isolate unrelated archive loading/export; the archive has its own contract tests.
vi.mock('./components/RecommendationArchive', () => ({ RecommendationArchive: () => null }));
// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TuningViewContent } from './TuningView';
import type { UnitPreferenceOverride } from '../../utils/gameUnitSettings';

const model = vi.hoisted(() => ({ carId: '42', carName: 'Test car', selectionGeneration: 0,
  carParams: { weight: 1350, weight_distribution: 50 }, setCarParams: vi.fn(),
  hasUnsavedParams: true, isSavingCarParams: false, paramsSaveStatus: 'idle', saveCarParams: async () => {},
}));
const session = vi.hoisted(() => ({ profile: model.carParams, engine: { pendingSave: false },
  baseline: { goal: 'Road', cancel: vi.fn() }, cvtEvidence: { busy: false }, calculationStatus: 'ready',
  result: { readiness: { mechanical: true, engineInputs: true, measuredEngine: true, gearingAvailable: true } },
  workflow: { step: 1, goal: 'Road', season: 'Summer', reviewHistory: false, setStep: (_step: number) => {},
    setReviewHistory: (_value: boolean | ((previous: boolean) => boolean)) => {} },
}));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => model }));
vi.mock('./TuneSessionProvider', () => ({ useTuneSession: () => session }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (text: string) => text }) }));
vi.mock('../../components/UnitSettingsSidebar', () => ({ UnitSettingsSidebar: () => null }));
vi.mock('./components/TuneVehicleSelector', () => ({ TuneVehicleSelector: () => null }));
vi.mock('./components/BaselinePreviewPanel', () => ({ BaselinePreviewPanel: () => null }));
vi.mock('../road/RoadWorkflowView', () => ({ RoadWorkflowView: () => <p>Saved history</p> }));
vi.mock('./components/Step1GoalSetup', () => ({ Step1GoalSetup: (props: any) => <button disabled={props.saving} onClick={props.onProceed}>Save vehicle parameters</button> }));
vi.mock('./components/Step2ChassisTuner', () => ({ Step2ChassisTuner: (props: any) => <button disabled={props.saving} onClick={props.saveCarParams}>Save vehicle parameters</button> }));
vi.mock('./components/EngineDataStep', () => ({ EngineDataStep: () => <p>Engine data panel</p> }));
vi.mock('./components/TuningTelemetryCaptureView', () => ({ default: ({ onBack }: { onBack: () => void }) => <section><h2>Tuning Telemetry Capture</h2><button onClick={onBack}>Back to engine data</button></section> }));
vi.mock('./components/SetupVerificationStep', () => ({ SetupVerificationStep: (props: any) => <button onClick={() => props.onBusyChange(true)}>Begin snapshot save</button> }));
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>; let redraw: () => void;
function Harness() {
  const [, update] = useState(0); redraw = () => update(value => value + 1);
  session.profile = model.carParams;
  session.workflow.setStep = step => { session.workflow.step = step; redraw(); };
  session.workflow.setReviewHistory = value => { session.workflow.reviewHistory = typeof value === 'function' ? value(session.workflow.reviewHistory) : value; redraw(); };
  return <TuningViewContent unitPreference={{ followGlobal: true } as UnitPreferenceOverride} onUnitPreferenceChange={() => {}} />;
}
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === name)!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(model, { carParams: { weight: 1350, weight_distribution: 50 }, selectionGeneration: 0, hasUnsavedParams: true, isSavingCarParams: false, paramsSaveStatus: 'idle' });
  Object.assign(session.workflow, { step: 1, reviewHistory: false }); session.baseline.goal = 'Road'; session.engine.pendingSave = false; session.cvtEvidence.busy = false;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

const entrances = [
  { name: 'Go to chassis & tires', step: 1, target: 2 },
  { name: 'Go to engine data & gearing', step: 2, target: 3 },
  { name: 'Go to setup verification', step: 3, target: 4 },
  { name: 'Previous', step: 2, target: 1 },
  { name: '3. Engine data & gearing', step: 1, target: 3 },
  { name: 'Confirm setup and record a run', step: 1, target: 4 },
  { name: 'Review saved runs', step: 1, target: 1 },
];
it.each(entrances)('$name saves before navigating, retains failed edits and permits retry', async ({ name, step, target }) => {
  session.workflow.step = step;
  const writes: unknown[] = []; let reject!: (error: Error) => void;
  model.saveCarParams = () => { writes.push({ ...model.carParams }); return new Promise((_resolve, fail) => { reject = fail; }); };
  await act(async () => root.render(<Harness />));
  await act(async () => { button(name).click(); button(name).click(); });
  expect(writes).toEqual([{ weight: 1350, weight_distribution: 50 }]);
  expect(session.workflow.step).toBe(step); expect(session.workflow.reviewHistory).toBe(false);
  expect([...host.querySelectorAll('nav button')].every(item => (item as HTMLButtonElement).disabled)).toBe(true);
  await act(async () => reject(new Error('Disk unavailable')));
  expect(host.querySelector('#tuning-save-status')?.textContent).toContain('Your edits are retained');
  expect(model.carParams.weight).toBe(1350); expect(session.workflow.step).toBe(step);
  model.saveCarParams = async () => { writes.push({ ...model.carParams }); model.hasUnsavedParams = false; model.paramsSaveStatus = 'saved'; };
  await act(async () => redraw());
  await act(async () => button(name).click());
  expect(session.workflow.step).toBe(target);
  expect(session.workflow.reviewHistory).toBe(name === 'Review saved runs');
  expect(writes).toEqual([{ weight: 1350, weight_distribution: 50 }, { weight: 1350, weight_distribution: 50 }]);
});

it.each([1, 2])('explicit save in Step%s stays in the step without applying a target', async step => {
  session.workflow.step = step; session.baseline.goal = 'Rally';
  model.saveCarParams = async () => { model.hasUnsavedParams = false; model.paramsSaveStatus = 'saved'; };
  await act(async () => root.render(<Harness />));
  await act(async () => button('Save vehicle parameters').click());
  expect(session.workflow.step).toBe(step); expect(session.workflow.goal).toBe('Road');
  expect(session.baseline.goal).toBe('Rally'); expect(model.paramsSaveStatus).toBe('saved');
});

it.each(['edit', 'selection', 'target'])('does not navigate after a %s change while saving', async change => {
  let finish!: () => void;
  model.saveCarParams = () => new Promise(resolve => { finish = resolve; });
  await act(async () => root.render(<Harness />));
  await act(async () => button('Go to chassis & tires').click());
  await act(async () => {
    if (change === 'edit') model.carParams = { ...model.carParams, weight: 1500 };
    if (change === 'selection') model.selectionGeneration++;
    if (change === 'target') session.baseline.goal = 'Rally';
    redraw();
  });
  await act(async () => finish()); expect(session.workflow.step).toBe(1);
});

it('navigates a clean profile without saving, and blocks navigation during measurement or snapshot saves', async () => {
  model.hasUnsavedParams = false; model.saveCarParams = async () => { throw new Error('A clean navigation must not save'); };
  await act(async () => root.render(<Harness />));
  await act(async () => button('Go to chassis & tires').click()); expect(session.workflow.step).toBe(2);
  await act(async () => { session.engine.pendingSave = true; redraw(); });
  expect(button('Previous').disabled).toBe(true); expect(button('Review saved runs').disabled).toBe(true);
  await act(async () => { session.engine.pendingSave = false; session.workflow.setStep(4); });
  await act(async () => button('Begin snapshot save').click());
  expect(button('Previous').disabled).toBe(true); expect(button('Review saved runs').disabled).toBe(true);
});

it('allows a new selection to navigate while an old selection save is still pending', async () => {
  let oldFinish!: () => void;
  model.saveCarParams = () => new Promise(resolve => { oldFinish = resolve; });
  await act(async () => root.render(<Harness />));
  await act(async () => button('Go to chassis & tires').click());
  await act(async () => { model.selectionGeneration++; model.hasUnsavedParams = false; redraw(); });
  await act(async () => button('Go to chassis & tires').click());
  expect(session.workflow.step).toBe(2);
  await act(async () => oldFinish()); expect(session.workflow.step).toBe(2);
});

it('opens the capture tool in Step 3 and returns to engine data without navigating or saving', async () => {
  session.workflow.step = 3; model.hasUnsavedParams = false;
  model.saveCarParams = vi.fn(async () => {});
  await act(async () => root.render(<Harness />));
  expect(host.textContent).toContain('Engine data panel');
  await act(async () => button('Open telemetry capture').click());
  expect(host.textContent).toContain('Tuning Telemetry Capture');
  expect(host.textContent).not.toContain('Engine data panel');
  await act(async () => button('Back to engine data').click());
  expect(host.textContent).toContain('Engine data panel');
  expect(host.textContent).not.toContain('Tuning Telemetry Capture');
  expect(session.workflow.step).toBe(3); expect(model.saveCarParams).not.toHaveBeenCalled();
});
