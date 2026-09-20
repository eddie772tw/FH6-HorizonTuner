import { describe, expect, it, vi } from 'vitest';
import { createRoadReviewGuard, createRoadReviewIo, roadReviewComparisonBody, roadReviewDecisionBody, roadReviewPath } from './roadReviewIo';
import type { RoadDecision, RoadReport, RoadWorkflow } from './roadTypes';

const workflow = (workflowId = 'road-a'): RoadWorkflow => ({ id: workflowId, workflowId, kind: 'workflow', schema: 'road-workflow/v1', createdAt: 123,
  identity: { ordinal: 1, performanceIndex: 700, drivetrain: 1 }, identitySource: 'game-confirmed', carName: 'Test car', configuration: 'A700',
  event: { name: 'Test circuit', format: 'circuit', driverAssists: 'manual', conditions: 'dry' } });
const decision = (workflowId = 'road-a'): RoadDecision => ({ id: 'choice', workflowId, kind: 'decision', schema: 'road-workflow/v1', createdAt: 123,
  reportId: 'report', choice: 'keep-baseline', setupId: 'setup-a', status: 'awaiting-game-confirmation' });
const report: RoadReport = { id: 'report', workflowId: 'road-a', kind: 'comparison', schema: 'road-workflow/v1', createdAt: 123,
  baselineRunIds: ['a'], candidateRunIds: ['b'], baselineSetupId: 'setup-a', candidateSetupId: 'setup-b', conclusion: 'inconclusive',
  reasons: [], limitations: [], methodVersion: 'v1', evidenceLevel: 'descriptive', independentRuns: { baseline: 1, candidate: 1 },
  time: { medianChangeSeconds: null, baselineSeconds: [], candidateSeconds: [], repeatedDirectionConsistent: false },
  thermalStart: { status: 'unknown', changeC: [] }, local: { routeStatus: 'unknown', baselineCoverage: 0, candidateCoverage: 0, matchedDrivingConditions: 0, meanNormalizedAngleChange: null } };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('Road review IO contracts', () => {
  it('builds only existing Road routes and encodes each identity independently', () => {
    expect(roadReviewPath()).toBe('/api/road/workflows');
    expect(roadReviewPath('road /?#')).toBe('/api/road/workflows/road%20%2F%3F%23');
    expect(roadReviewPath('road/a', 'capture', 'run/b')).toBe('/api/road/workflows/road%2Fa/runs/run%2Fb/capture');
    expect(roadReviewPath('road-a', 'comparisons')).toBe('/api/road/workflows/road-a/comparisons');
    expect(roadReviewPath('road-a', 'decisions')).toBe('/api/road/workflows/road-a/decisions');
    for (const invalid of ['', ' ', '.', '..']) expect(() => roadReviewPath(invalid)).toThrow();
    expect(() => roadReviewPath('road-a', 'capture', '')).toThrow();
  });

  it('distinguishes empty library, missing workflow and malformed successful responses', async () => {
    expect(await createRoadReviewIo(async () => response([])).list()).toEqual([]);
    expect(await createRoadReviewIo(async () => response({ detail: 'not found' }, 404)).read('missing')).toBeNull();
    for (const malformed of [null, {}, [workflow(), { id: 'broken' }], [{ ...workflow(), event: null }], [decision()], [workflow(), workflow()]]) {
      await expect(createRoadReviewIo(async () => response(malformed)).list()).rejects.toThrow();
    }
    await expect(createRoadReviewIo(async () => response([])).read('road-a')).rejects.toThrow('missing');
    await expect(createRoadReviewIo(async () => response([workflow('road-b')])).read('road-a')).rejects.toThrow('mismatched');
    await expect(createRoadReviewIo(async () => response([workflow(), { ...report, local: null }])).read('road-a')).rejects.toThrow('invalid');
  });

  it('keeps valid saved documents and propagates abort to reads', async () => {
    const fetcher = vi.fn(async () => response([workflow(), report, decision()]));
    const signal = new AbortController().signal;
    expect(await createRoadReviewIo(fetcher).read('road-a', signal)).toEqual([workflow(), report, decision()]);
    expect(fetcher).toHaveBeenCalledWith('/api/road/workflows/road-a', { signal });
  });

  it('exposes backend errors and handles non-JSON failures without inventing an empty library', async () => {
    await expect(createRoadReviewIo(async () => response({ detail: 'Save the recorded run first' }, 409)).list()).rejects.toThrow('Save the recorded run first');
    await expect(createRoadReviewIo(async () => response({ detail: [{ msg: 'invalid' }] }, 422)).list()).rejects.toThrow('Road request failed');
    await expect(createRoadReviewIo(async () => new Response('<html>unavailable</html>', { status: 503 })).list()).rejects.toThrow('backend is available');
    await expect(createRoadReviewIo(async () => new Response('not json')).read('road-a')).rejects.toThrow('malformed');
    await expect(createRoadReviewIo(async () => { throw new Error('offline'); }).list()).rejects.toThrow('offline');
  });

  it('posts only selected saved run ids and rejects invalid comparison bodies', async () => {
    const fetcher = vi.fn(async () => response(report));
    const body = roadReviewComparisonBody({ baselineRunIds: ['a', 'a'], candidateRunIds: ['b'], unrelated: 'ignored' });
    expect(body).toEqual({ baselineRunIds: ['a'], candidateRunIds: ['b'] });
    expect(await createRoadReviewIo(fetcher).compare('road-a', body)).toEqual(report);
    expect(fetcher).toHaveBeenCalledWith('/api/road/workflows/road-a/comparisons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    for (const value of [null, {}, { baselineRunIds: [], candidateRunIds: ['b'] }, { baselineRunIds: ['a'], candidateRunIds: ['a'] }, { baselineRunIds: ['a'], candidateRunIds: [''] }]) {
      expect(() => roadReviewComparisonBody(value)).toThrow();
    }
  });

  it.each(['keep-candidate', 'keep-baseline', 'retest-baseline'] as const)('sends the exact %s decision contract without Tune draft writes', async choice => {
    const saved = { ...decision(), choice };
    const fetcher = vi.fn(async () => response(saved));
    const body = roadReviewDecisionBody({ reportId: 'report', choice, workflowId: 'wrong', setupId: 'untrusted' });
    expect(body).toEqual({ reportId: 'report', choice });
    expect(await createRoadReviewIo(fetcher).decide('road-a', body)).toEqual(saved);
    expect(fetcher).toHaveBeenCalledWith('/api/road/workflows/road-a/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  });

  it('rejects invalid choices and cross-workflow mutation responses', async () => {
    for (const value of [null, {}, { reportId: '', choice: 'keep-baseline' }, { reportId: 'report', choice: 'accept' }]) expect(() => roadReviewDecisionBody(value)).toThrow();
    await expect(createRoadReviewIo(async () => response(decision('road-b'))).decide('road-a', { reportId: 'report', choice: 'keep-baseline' })).rejects.toThrow('mismatched');
    await expect(createRoadReviewIo(async () => response(workflow())).compare('road-a', { baselineRunIds: ['a'], candidateRunIds: ['b'] })).rejects.toThrow('invalid');
  });

  it('requires capture references to match the selected workflow and run', async () => {
    const capture = { schemaVersion: 'tuning-capture/v1', metadata: {}, references: { workflowId: 'road-a', runId: 'run-a' }, samples: [] };
    const fetcher = vi.fn(async () => response(capture));
    expect(await createRoadReviewIo(fetcher).capture('road-a', 'run-a')).toEqual(capture);
    expect(fetcher).toHaveBeenCalledWith('/api/road/workflows/road-a/runs/run-a/capture', { signal: undefined });
    await expect(createRoadReviewIo(async () => response(capture)).capture('road-b', 'run-a')).rejects.toThrow('another run');
    await expect(createRoadReviewIo(async () => response(capture)).capture('road-a', 'run-b')).rejects.toThrow('another run');
    await expect(createRoadReviewIo(async () => response({ ...capture, samples: null })).capture('road-a', 'run-a')).rejects.toThrow('invalid');
    await expect(createRoadReviewIo(async () => response({}, 404)).capture('road-a', 'run-a')).rejects.toThrow();
  });
});

describe('Road review request generations and operation settlement', () => {
  it('discards delayed A library/detail/capture reads after A to B to A selection', async () => {
    const guard = createRoadReviewGuard();
    guard.select('road-a');
    const leases = ['library', 'detail', 'capture'].map(channel => guard.read(channel as 'library' | 'detail' | 'capture'));
    const results: string[] = [];
    let resolve!: () => void;
    const pending = new Promise<void>(done => { resolve = done; }).then(() => {
      for (const lease of leases) if (guard.applies(lease)) results.push(lease.channel);
    });
    guard.select('road-b'); guard.select('road-a');
    const current = guard.read('detail');
    resolve(); await pending;
    expect(results).toEqual([]);
    expect(guard.applies(current)).toBe(true);
  });

  it('lets only the newest read in a channel apply, independently of other channels', () => {
    const guard = createRoadReviewGuard(); guard.select('road-a');
    const old = guard.read('detail'), library = guard.read('library'), latest = guard.read('detail');
    expect(guard.applies(old)).toBe(false);
    expect(guard.applies(library)).toBe(true);
    expect(guard.applies(latest)).toBe(true);
    guard.invalidate();
    expect(guard.applies(library)).toBe(false);
    expect(guard.applies(latest)).toBe(false);
  });

  it.each([true, false])('settles an old mutation (%s) without applying to the new selection or releasing a newer operation', succeeded => {
    const guard = createRoadReviewGuard(); guard.select('road-a');
    const old = guard.beginMutation()!;
    expect(guard.beginMutation()).toBeNull();
    guard.select('road-b');
    expect(guard.beginMutation()).toBeNull();
    expect(guard.settle(old, succeeded)).toBe(false);
    expect(guard.operation?.status).toBe(succeeded ? 'succeeded' : 'failed');
    const current = guard.beginMutation()!;
    expect(current.workflowId).toBe('road-b');
    expect(guard.settle(old, true)).toBe(false);
    expect(guard.operation?.status).toBe('pending');
    expect(guard.settle(current, true)).toBe(true);
    expect(guard.beginMutation()).not.toBeNull();
  });

  it('settles after unmount and does not start a mutation without a selected workflow', () => {
    const guard = createRoadReviewGuard();
    expect(guard.beginMutation()).toBeNull();
    guard.select('road-a');
    const pending = guard.beginMutation()!;
    guard.invalidate();
    expect(guard.settle(pending, true)).toBe(false);
    expect(guard.operation?.status).toBe('succeeded');
  });
});
