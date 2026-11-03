// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useRatioBalanceDraft } from './useRatioBalanceDraft';
import type { RatioBalanceRequest } from './ratioBalanceTypes';

const request: RatioBalanceRequest = { schemaVersion: 'ratio-balance/v1', candidateFinalDrive: 3.51,
  bounds: { source: 'user-observed', finalDrive: { min: 2, max: 6, step: .01 }, gears: [{ min: 1, max: 6, step: .01 }] } };
let root: Root;
let draft: ReturnType<typeof useRatioBalanceDraft>;
function Probe({ context }: { context: string | null }) { draft = useRatioBalanceDraft(context); return null; }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear(); root = createRoot(document.createElement('div')); });
afterEach(async () => { await act(async () => root.unmount()); });

it('persists requests across step remount/reload, then resets to immutable solver baseline', async () => {
  await act(async () => root.render(<Probe context="same-car-profile-engine" />));
  await act(async () => draft.setRequest(request));
  await act(async () => root.unmount()); root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe context={null} />));
  await act(async () => root.render(<Probe context="same-car-profile-engine" />));
  expect(draft.request).toEqual(request);
  const { candidateFinalDrive: _candidate, ...base } = request;
  await act(async () => draft.setRequest(base));
  expect(draft.request?.candidateFinalDrive).toBeUndefined();
  expect(draft.request?.bounds).toEqual(request.bounds);
});
it.each(['different-car', 'different-profile', 'different-goal', 'different-engine', null])('invalidates %s and does not resurrect on returning', async context => {
  await act(async () => root.render(<Probe context="original" />));
  await act(async () => draft.setRequest(request));
  await act(async () => root.render(<Probe context={context} />));
  expect(draft.request).toBeNull();
  await act(async () => root.render(<Probe context="original" />));
  expect(draft.request).toBeNull();
});
it('discards corrupt persisted request shape without rendering unsafe bounds', async () => {
  localStorage.setItem('tuning-ratio-balance-draft/v1', JSON.stringify({ context: 'same', request: { schemaVersion: 'ratio-balance/v1' } }));
  await act(async () => root.render(<Probe context="same" />));
  expect(draft.request).toBeNull();
});
