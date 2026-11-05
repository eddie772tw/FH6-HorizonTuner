// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EvPowertrainStep } from './EvPowertrainStep';
import { backendFetch } from '../../../services/backend';
const fixture = vi.hoisted(() => {
  const setup = { finalDrive: 4.03, gearRatios: [4], gearAdjustable: [true], finalDriveAdjustable: true, allForwardGearsConfirmed: true };
  return { setup, calculate: vi.fn(), save: vi.fn(), restart: vi.fn(), key: 'paused-scan', state: { status: 'collecting', gears: [{ gear: 1, acceptedMs: 4000, lowestRpm: 3000, highestRpm: 16000, zeroOutputSamples: 0 }] } };
});
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));
vi.mock('../../../context/CarParamsContext', () => ({ useCarParams: () => ({ carId: '3445', carParams: { evGearbox: fixture.setup }, setCarParams: vi.fn(), saveCarParams: fixture.save }) }));
vi.mock('../../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ isConnected: true }) }));
vi.mock('../../../hooks/useFileSave', () => ({ useFileSave: () => ({ save: vi.fn(), isSaving: false }) }));
vi.mock('../TuneSessionProvider', () => ({ useTuneSession: () => ({ profile: { evGearbox: fixture.setup }, evMeasurement: { key: fixture.key, phase: 'paused', state: fixture.state, pendingSamples: 0, readyGears: [1], result: null, sampleCount: 1000, calculate: fixture.calculate, restart: fixture.restart, pauseOrResume: vi.fn() } }) }));
vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('./EvEvidencePanel', () => ({ EvEvidencePanel: () => null }));
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.useRealTimers(); });
it('recovers a paused EV scan preview after 503 without edits or navigation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.useFakeTimers();
  let previews = 0;
  vi.mocked(backendFetch).mockImplementation(async path => {
    if (path === '/api/tuning/ev-profile') return { ok: true, json: async () => ({ ready: true }) } as Response;
    previews++;
    return previews === 1 ? { ok: false, status: 503 } as Response : { ok: true, json: async () => ({ evidenceStatus: 'unverified-preview', result: {} }) } as Response;
  });
  root = createRoot(host);
  await act(async () => root.render(<EvPowertrainStep enabled />));
  const button = () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Calculate EV model')!;
  expect(button().disabled).toBe(true);
  expect(host.textContent).toContain('Tuning calculation is unavailable. Retrying…');
  expect(host.textContent).not.toContain('Calculation needs every confirmed gear');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(previews).toBe(2); expect(button().disabled).toBe(false);
  await act(async () => button().click());
  expect(fixture.calculate).toHaveBeenCalledWith(4.03);
});

it('retains EV data after a save failure and starts collection only after a successful retry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); fixture.save.mockReset(); fixture.restart.mockReset();
  vi.mocked(backendFetch).mockResolvedValue({ ok: true, json: async () => ({ ready: true, result: {} }) } as Response);
  let reject!: (reason: Error) => void;
  fixture.save.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  root = createRoot(host); await act(async () => root.render(<EvPowertrainStep enabled />));
  const start = () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('restart EV collection'))!;
  await act(async () => { start().click(); start().click(); });
  expect(fixture.save).toHaveBeenCalledTimes(1); expect(fixture.restart).not.toHaveBeenCalled();
  await act(async () => reject(new Error('Disk unavailable')));
  expect(host.textContent).toContain('EV setup could not be saved. Try again.');
  expect(host.textContent).toContain('1000 / 30000'); expect(fixture.restart).not.toHaveBeenCalled();
  fixture.save.mockResolvedValue(undefined);
  await act(async () => start().click()); expect(fixture.restart).toHaveBeenCalledTimes(1);
});
