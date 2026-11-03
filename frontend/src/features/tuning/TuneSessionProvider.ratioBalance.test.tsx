// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TuneSessionProvider, useTuneSession } from './TuneSessionProvider';
import type { RatioBalanceRequest } from './ratioBalanceTypes';

const fixture = vi.hoisted(() => ({
  profile: { weight: 1400, weight_distribution: 48, drivetrain: 'RWD', maxHp: 300, maxTorque: 400,
    adjustability: { gearbox: 'Full', gears: 4 } },
  snapshot: {} as Record<string, unknown>,
  engine: { observation: { id: 'qualified-fixture', data: {} }, current: {}, calculation: { status: 'ready', engineMaxRpm: 7000,
    peakPower: { rpm: 6000, value: 300 }, peakTorque: { rpm: 4000, value: 400 } } },
}));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => ({ carId: '42', loadedCarId: '42', carParams: fixture.profile }) }));
vi.mock('../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: null, isConnected: true }), subscribeToDecodedTelemetry: () => () => {} }));
vi.mock('./useEngineMeasurementArchive', () => ({ useEngineMeasurementArchive: () => ({ ...fixture.engine, invalidate: vi.fn() }) }));
vi.mock('./useEvMeasurementSession', () => ({ useEvMeasurementSession: () => ({ state: { gears: [] }, result: null }) }));
vi.mock('./engineBatch', () => ({ requestEngineBatch: () => new Promise(() => {}) }));
vi.mock('./useWorkflowCalculation', () => ({ useWorkflowCalculation: (_a: unknown, _b: unknown, _c: unknown, _d: unknown, _e: unknown, _f: unknown, snapshot: Record<string, unknown>) => {
  fixture.snapshot = snapshot;
  return { status: 'ready', result: { recommendation: { inputSnapshot: snapshot, fields: {} } } };
} }));

it('carries a chosen FD through the formal snapshot and step changes, then clears it on goal change', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear();
  const root = createRoot(document.createElement('div')); let session!: ReturnType<typeof useTuneSession>;
  function Probe() { session = useTuneSession(); return null; }
  const request: RatioBalanceRequest = { schemaVersion: 'ratio-balance/v1', candidateFinalDrive: 3.51,
    bounds: { source: 'user-observed', finalDrive: { min: 2, max: 6, step: .01 }, gears: Array.from({ length: 4 }, () => ({ min: .4, max: 6, step: .01 as const })) } };
  try {
    await act(async () => root.render(<TuneSessionProvider><Probe /></TuneSessionProvider>));
    await act(async () => session.workflow.setStep(3));
    await act(async () => session.ratioBalance.setRequest(request));
    expect(fixture.snapshot.ratioBalance).toEqual(request);
    await act(async () => session.workflow.setStep(4));
    expect(session.result?.recommendation?.inputSnapshot.ratioBalance).toEqual(request);
    await act(async () => session.workflow.setStep(3));
    expect(session.ratioBalance.request).toEqual(request);
    await act(async () => session.workflow.setGoal('Rally'));
    expect(session.ratioBalance.request).toBeNull();
    expect(fixture.snapshot.ratioBalance).toBeUndefined();
    expect(fixture.snapshot.profile).toEqual(fixture.profile);
    await act(async () => session.ratioBalance.setRequest(request));
    fixture.engine.observation = { ...fixture.engine.observation, id: 'new-evidence' };
    await act(async () => root.render(<TuneSessionProvider><Probe /></TuneSessionProvider>));
    expect(session.ratioBalance.request).toBeNull();
    await act(async () => session.ratioBalance.setRequest(request));
    fixture.profile = { ...fixture.profile, weight: 1500 };
    await act(async () => root.render(<TuneSessionProvider><Probe /></TuneSessionProvider>));
    expect(session.ratioBalance.request).toBeNull();
    expect(fixture.snapshot.ratioBalance).toBeUndefined();
  } finally { await act(async () => root.unmount()); }
});
