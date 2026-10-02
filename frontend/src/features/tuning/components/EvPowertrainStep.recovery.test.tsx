// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EvPowertrainStep } from './EvPowertrainStep';
import { backendFetch } from '../../../services/backend';
const fixture = vi.hoisted(() => {
  const setup = { finalDrive: 4.03, gearRatios: [4], gearAdjustable: [true], finalDriveAdjustable: true, allForwardGearsConfirmed: true };
  return { setup, calculate: vi.fn(), state: { status: 'collecting', gears: [{ gear: 1, acceptedMs: 4000, lowestRpm: 3000, highestRpm: 16000, zeroOutputSamples: 0 }] } };
});
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));
vi.mock('../../../context/CarParamsContext', () => ({ useCarParams: () => ({ carId: '3445', carParams: { evGearbox: fixture.setup }, setCarParams: vi.fn(), saveCarParams: vi.fn() }) }));
vi.mock('../../../hooks/useTelemetry', () => ({ useTelemetry: () => ({ isConnected: true }) }));
vi.mock('../../../hooks/useFileSave', () => ({ useFileSave: () => ({ save: vi.fn(), isSaving: false }) }));
vi.mock('../TuneSessionProvider', () => ({ useTuneSession: () => ({ profile: { evGearbox: fixture.setup }, evMeasurement: { key: 'paused-scan', phase: 'paused', state: fixture.state, pendingSamples: 0, readyGears: [1], result: null, sampleCount: 1000, calculate: fixture.calculate, restart: vi.fn(), pauseOrResume: vi.fn() } }) }));
vi.mock('../../../services/backend', () => ({ backendFetch: vi.fn() }));
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
