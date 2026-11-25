// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { autoTuneRequest as invoke } from './autoTuneApi';
import AutoTuneWorkspace from './AutoTuneWorkspace';
import type { RunSnapshot } from './useAutoTuneRun';

vi.mock('./autoTuneApi', () => ({ autoTuneRequest: vi.fn() }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }) }));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(invoke).mockReset();
});

it('starts the selected workflow, displays its observations and stops the same run', async () => {
  let state: RunSnapshot | null = null;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'auto_tune_start') {
      expect(args).toEqual({ goal: 'Road', season: 'Winter' });
      state = { active: true, runId: 'r', status: 'running', step: 1, elapsedMs: 2400,
        observed: { 'pressure.front': '28 psi' }, recommended: { 'pressure.front': '29 psi' },
        logs: [{ elapsedMs: 1200, message: 'DB5' }], imageRevision: null };
    }
    if (command === 'auto_tune_stop' && state) state = { ...state, active: false, status: 'stopped' };
    return command === 'auto_tune_poll' ? state : undefined;
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AutoTuneWorkspace />));
    expect(host.querySelector<HTMLOptionElement>('option[value="Drift"]')?.disabled).toBe(true);
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('tbody')?.textContent).toContain('28 PSI29 PSI');
    expect(host.querySelector('[role=log]')?.textContent).toContain('00:01DB5');
    expect(host.querySelector('button')?.textContent).toBe('Stop');
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('[role=status]')?.textContent).toContain('Stopped');
    expect(host.querySelector('button')?.textContent).toBe('Start');
  } finally { await act(async () => root.unmount()); }
});
