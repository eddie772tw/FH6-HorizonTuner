// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CarParamsProvider, useCarParams, type CarParams } from './CarParamsContext';
import { backendFetch } from '../services/backend';

vi.mock('../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../hooks/useTelemetry', () => ({ useTelemetry: () => ({ data: null, isConnected: false }) }));
vi.mock('./SettingsContext', () => ({ useSettings: () => ({ settings: {}, updateSettings: vi.fn() }) }));
const profile = { weight: 1350, weight_distribution: 50, dyno_curve: {} } as CarParams;
let context: ReturnType<typeof useCarParams>;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const response = (value: unknown, ok = true) => ({ ok, json: async () => value }) as Response;
function Probe() { context = useCarParams(); return null; }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(backendFetch).mockImplementation(async path => response(path === '/api/cars/with_params' ? [] : path === '/api/cars/database' ? {} : profile));
  host = document.createElement('div'); root = createRoot(host);
  await act(async () => root.render(<CarParamsProvider><Probe /></CarParamsProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); });

it('tracks persisted parameters, keeps later edits dirty, and deduplicates a pending save', async () => {
  expect(context.hasUnsavedParams).toBe(false);
  await act(async () => context.setCarParams({ ...profile, weight: 1400 }));
  expect(context.hasUnsavedParams).toBe(true);
  let finish!: (value: Response) => void;
  const writes: unknown[] = [];
  vi.mocked(backendFetch).mockImplementation(async (path, options) => {
    if (options?.method === 'POST') {
      writes.push(JSON.parse(options.body as string));
      return new Promise(resolve => { finish = resolve; });
    }
    return response(path === '/api/cars/with_params' ? [] : profile);
  });
  let first!: Promise<void>; let repeated!: Promise<void>;
  await act(async () => { first = context.saveCarParams(); repeated = context.saveCarParams(); });
  expect(context.isSavingCarParams).toBe(true);
  expect(writes).toEqual([{ ...profile, weight: 1400 }]);
  await act(async () => context.setCarParams({ ...profile, weight: 1450 }));
  await expect(context.saveCarParams()).rejects.toThrow('different vehicle parameter snapshot');
  await act(async () => { finish(response({})); await Promise.all([first, repeated]); });
  expect(context.isSavingCarParams).toBe(false);
  expect(context.hasUnsavedParams).toBe(true);
  expect(context.carParams?.weight).toBe(1450);
});

it('retains a failed draft, exposes the failure, and clears it after a successful retry', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => context.setCarParams({ ...profile, weight: 1400 }));
  vi.mocked(backendFetch).mockResolvedValue(response({}, false));
  await act(async () => { await expect(context.saveCarParams()).rejects.toThrow(); });
  expect(context.paramsSaveStatus).toBe('error');
  expect(context.hasUnsavedParams).toBe(true);
  expect(context.carParams?.weight).toBe(1400);
  vi.mocked(backendFetch).mockImplementation(async path => response(path === '/api/cars/with_params' ? [] : {}));
  await act(async () => context.saveCarParams());
  expect(context.paramsSaveStatus).toBe('saved');
  expect(context.hasUnsavedParams).toBe(false);
});

it('does not mark a newly selected vehicle saved when an old request finishes', async () => {
  let finish!: (value: Response) => void;
  vi.mocked(backendFetch).mockImplementation(async (_path, options) => options?.method === 'POST' && _path.includes('/car_params/')
    ? new Promise(resolve => { finish = resolve; }) : response(_path === '/api/cars/with_params' ? [] : profile));
  let saving!: Promise<void>;
  await act(async () => { saving = context.saveCarParams(); });
  await act(async () => context.setCarId('42'));
  await act(async () => context.setCarParams({ ...profile, weight: 1500 }));
  await act(async () => { finish(response({})); await saving; });
  expect(context.carId).toBe('42');
  expect(context.carParams?.weight).toBe(1500);
  expect(context.hasUnsavedParams).toBe(true);
  expect(context.paramsSaveStatus).toBe('idle');
});
