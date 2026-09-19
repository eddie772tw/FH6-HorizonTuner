import { describe, expect, it } from 'vitest';
import { createRoadLiveReader } from './roadLiveReader';
import type { RoadLive } from './roadTypes';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const live = (runId: string | null): RoadLive => ({
  identity: { ordinal: 17, performanceIndex: 700, drivetrain: 1 }, fresh: true, source: 'telemetry',
  activeRun: runId ? { id: runId, workflowId: 'workflow-a' } : null, sampleCount: 0, state: 'ready', error: null,
});

describe('Road live read ordering', () => {
  it('keeps the post-save run when an older poll finishes later, including a late failure', async () => {
    for (const fails of [false, true]) {
      const oldPoll = deferred<RoadLive>(), afterSave = deferred<RoadLive>();
      const requests = [oldPoll.promise, afterSave.promise];
      let current: RoadLive | null = null;
      let error = '';
      const reader = createRoadLiveReader(() => requests.shift()!, next => { current = next; }, failure => { error = String(failure); }, () => true);
      const first = reader.refresh(), second = reader.refresh();
      afterSave.resolve(live('new-run'));
      await second;
      if (fails) oldPoll.reject(new Error('stale network failure')); else oldPoll.resolve(live(null));
      expect(await first).toEqual({ status: 'discarded' });
      expect(current).toEqual(live('new-run'));
      expect(error).toBe('');
    }
  });

  it('discards a request from a previous page lifetime even if a new lifetime is active', async () => {
    const priorPage = deferred<RoadLive>();
    let current: RoadLive | null = null;
    let active = true;
    const reader = createRoadLiveReader(() => priorPage.promise, next => { current = next; }, () => {}, () => active);
    const pending = reader.refresh();
    active = false;
    reader.invalidate();
    active = true;
    priorPage.resolve(live('old-run'));
    expect(await pending).toEqual({ status: 'discarded' });
    expect(current).toBeNull();
  });

  it('reports a current failure and accepts a subsequent successful refresh', async () => {
    let connected = false;
    let message = '';
    let current: RoadLive | null = null;
    const reader = createRoadLiveReader(async () => {
      if (!connected) throw new Error('offline');
      return live(null);
    }, next => { current = next; message = ''; }, failure => { message = (failure as Error).message; }, () => true);
    expect(await reader.refresh()).toEqual({ status: 'failed' });
    expect(message).toBe('offline');
    connected = true;
    expect((await reader.refresh()).status).toBe('applied');
    expect(current).toEqual(live(null));
    expect(message).toBe('');
  });
});
