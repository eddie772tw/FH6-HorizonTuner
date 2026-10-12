// @vitest-environment jsdom
// Synthetic responses verify mounting/transport only; Rust owns qualification.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import type { TelemetryData } from '../../hooks/useTelemetry';
import { backendFetch } from '../../services/backend';
import { TuneSessionProvider, useTuneSession } from './TuneSessionProvider';
import { CvtFoundationPanel } from './components/CvtFoundationPanel';

const model = vi.hoisted(() => ({ carId: '42', loadedCarId: '42', carParams: null as CarParams | null, data: null as TelemetryData | null, isConnected: false }));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => model }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: model.data, isConnected: model.isConnected }), subscribeToDecodedTelemetry: () => () => {} }));
vi.mock('./useEngineMeasurementArchive', () => ({ useEngineMeasurementArchive: () => ({ observation: null, current: null, calculation: null, invalidate: vi.fn() }) }));
vi.mock('./useEvMeasurementSession', () => ({ useEvMeasurementSession: () => ({ state: { gears: [] }, result: null }) }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
const fetchMock = vi.mocked(backendFetch);
const identity = { ordinal: 42, performanceIndex: 500, carClass: 2 };
const config = { id: 'independently-verified-synthetic', source: 'game-visible', reference: 'synthetic-only', installedParts: 'synthetic-only' };
const capture = { schemaVersion: 'cvt-capture/v1', carId: '42', identity, configuration: config,
  provenance: { source: 'session-replay', reference: 'synthetic-only', capturedAt: null, gameBuild: null, recorderVersion: null }, frames: [{ timestampMs: 0 }] };
const qualification = { schemaVersion: 'cvt-qualification/v1', status: 'unsupported', captureStatus: 'qualified', ratioPreview: null, diagnostics: [] };
const response = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>; let session: ReturnType<typeof useTuneSession>;
let requests: { path: string; body: any }[];
function Probe() { session = useTuneSession(); return <CvtFoundationPanel result={session.result?.cvt} t={key => key} evidenceSession={session.cvtEvidence} />; }
const render = () => act(async () => root.render(<TuneSessionProvider><Probe /></TuneSessionProvider>));
const latestWorkflow = () => { const workflows = requests.filter(item => item.path === '/api/tuning/workflow'); return workflows[workflows.length - 1].body; };
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label)!;
const click = (label: string) => act(async () => button(label).click());
const importRaw = async (text: string) => act(async () => {
  const field = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(field, 'files', { configurable: true, value: [{ size: text.length, text: async () => text }] });
  field.dispatchEvent(new Event('change', { bubbles: true }));
});
const editCurrent = (value: string) => act(async () => {
  const field = host.querySelector('textarea')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
});
const select = () => act(async () => {
  const field = host.querySelector('select')!; field.value = 'saved-synthetic';
  field.dispatchEvent(new Event('change', { bubbles: true }));
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(model, { carId: '42', loadedCarId: '42', data: null, isConnected: false, carParams: { weight: 1200, weight_distribution: 50, transmission: { type: 'cvt', capability: 'final-drive-only' } } });
  requests = []; fetchMock.mockReset();
  fetchMock.mockImplementation(async (path, init) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    requests.push({ path: String(path), body });
    if (path === '/api/tuning/cvt-evidence' && !body) return response({ schemaVersion: 'cvt-evidence-list/v1', items: [{ evidenceId: 'saved-synthetic', capture: { ...capture, frames: undefined } }] });
    if (path === '/api/tuning/cvt-evidence/saved-synthetic') return response({ schemaVersion: 'cvt-evidence-read/v1', evidenceId: 'saved-synthetic', capture });
    if (path === '/api/tuning/cvt-evidence') return response({ evidenceId: 'saved-synthetic', qualification });
    return response({ schemaVersion: 'tuning-workflow-result/v2', cvt: qualification, gearing: null, recommendation: null, readiness: { mechanical: true, engineInputs: true, measuredEngine: false, gearingAvailable: false } });
  });
  host = document.createElement('div'); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); });

it('mounts import/source hints and saves raw without copying imported metadata into current confirmation', async () => {
  await render(); await importRaw(JSON.stringify(capture));
  expect(host.textContent).toContain('Imported evidence sources'); expect(host.textContent).toContain('Unknown');
  expect(host.querySelector('textarea')!.value).toBe(''); expect(session.cvtEvidence.confirmed).toBe(false);
  expect(button('Save immutable CVT evidence').disabled).toBe(true);
  const imported = latestWorkflow();
  expect(imported.evidence.capture).toEqual(capture); expect(imported.inputSnapshot.cvtConfiguration).toBeNull();
  const independentlyEntered = { ...config, id: 'separately-entered-current-setup' };
  await editCurrent(JSON.stringify({ identity, cvtConfiguration: independentlyEntered }));
  await click('Confirm current configuration'); await click('Save immutable CVT evidence');
  const saved = requests.find(item => item.path === '/api/tuning/cvt-evidence' && item.body)!.body;
  expect(saved.inputSnapshot.cvtConfiguration).toEqual(independentlyEntered);
  expect(saved.evidence.capture).toEqual(capture);
  expect(session.cvtEvidence.selection?.evidence).toEqual({ kind: 'saved-cvt', evidenceId: 'saved-synthetic' });
  expect(session.result?.gearing).toBeNull(); expect(session.result?.recommendation).toBeNull();
});

it('cold selection requires separate confirmation and uses live identity without rewriting the raw source', async () => {
  model.isConnected = true;
  model.data = { CarOrdinal: 42, CarPerformanceIndex: 600, CarClass: 3 } as TelemetryData;
  await render(); await select();
  expect(session.cvtEvidence.confirmed).toBe(false); expect(host.querySelector('textarea')!.value).toBe('');
  await editCurrent(JSON.stringify({ identity, cvtConfiguration: config })); await click('Confirm current configuration');
  const request = latestWorkflow();
  expect(request.evidence).toEqual({ kind: 'saved-cvt', evidenceId: 'saved-synthetic' });
  expect(request.inputSnapshot.identity).toEqual({ ordinal: 42, performanceIndex: 600, carClass: 3 });
  expect(session.cvtEvidence.selection?.metadata.identity).toEqual(identity);
  expect(button('Save immutable CVT evidence').disabled).toBe(true);
  // Cached PI/Class must not masquerade as live evidence after disconnect.
  model.isConnected = false; await render();
  expect(latestWorkflow().inputSnapshot.identity).toEqual(identity);
  expect(session.cvtEvidence.selection?.metadata.identity).toEqual(identity);
  const beforeChange = requests.length;
  model.isConnected = true;
  model.data = { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 4 } as TelemetryData;
  await render();
  const changedRequests = requests.slice(beforeChange).filter(item => item.path === '/api/tuning/workflow');
  expect(changedRequests.length).toBeGreaterThan(0);
  expect(changedRequests.every(item => item.body.evidence === null && item.body.inputSnapshot.identity.performanceIndex === 700)).toBe(true);
  expect(session.cvtEvidence.confirmed).toBe(false);
});

it('invalidates confirmation and selection on setup edits including A to B to A', async () => {
  await render(); await select(); await editCurrent(JSON.stringify({ identity, cvtConfiguration: config }));
  await click('Confirm current configuration');
  const original = model.carParams!;
  model.carParams = { ...original, weight: 1300 }; await render();
  model.carParams = original; await render();
  expect(session.cvtEvidence.selection).toBeNull(); expect(session.cvtEvidence.confirmed).toBe(false);
  expect(host.querySelector('textarea')!.value).toBe('');
  expect(latestWorkflow().evidence).toBeNull();
});

it('rejects late reads after car changes and rejects old response contracts', async () => {
  await render(); let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await select();
  model.carId = '43'; model.loadedCarId = '43'; await render();
  await act(async () => finish(response({ schemaVersion: 'cvt-evidence-read/v1', evidenceId: 'saved-synthetic', capture })));
  expect(session.cvtEvidence.selection).toBeNull(); expect(host.textContent).not.toContain('Imported evidence sources');
  fetchMock.mockResolvedValueOnce(response({ schemaVersion: 'cvt-evidence-read/v99', evidenceId: 'saved-synthetic', capture }));
  await select(); expect(host.textContent).toContain('Unsupported CVT evidence response.');
  expect(session.cvtEvidence.selection).toBeNull();
});

it('keeps unknown raw schemas for Rust diagnostics, and malformed JSON cannot retain old selection', async () => {
  await render();
  const unknown = { ...capture, schemaVersion: 'cvt-capture/v99', configuration: { ...config, ratioMinimum: null } };
  await importRaw(JSON.stringify(unknown));
  expect(latestWorkflow().evidence.capture).toEqual(unknown);
  await editCurrent('{invalid'); await click('Confirm current configuration');
  expect(session.cvtEvidence.confirmed).toBe(false); expect(host.textContent).toContain('Enter current identity');
  await importRaw('{invalid'); expect(session.cvtEvidence.selection).toBeNull();
  expect(button('Save immutable CVT evidence').disabled).toBe(true);
});
