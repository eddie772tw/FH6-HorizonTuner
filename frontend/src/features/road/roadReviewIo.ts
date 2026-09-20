import { backendFetch } from '../../services/backend';
import type { RoadDecision, RoadDocument, RoadReport, RoadWorkflow } from './roadTypes';
import type { RoadReviewCapture, RoadReviewComparison, RoadReviewDecision, RoadReviewIo, RoadReviewLease, RoadReviewOperation } from './roadReviewTypes';

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
type Check = (value: unknown) => boolean;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const string: Check = value => typeof value === 'string';
const id: Check = value => typeof value === 'string' && value.trim().length > 0 && value !== '.' && value !== '..';
const number: Check = value => typeof value === 'number' && Number.isFinite(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const array = (check: Check): Check => value => Array.isArray(value) && value.every(check);
const shape = (fields: Record<string, Check>): Check => value => object(value) && Object.entries(fields).every(([key, check]) => check(value[key]));
const dictionary = (check: Check): Check => value => object(value) && Object.values(value).every(check);
const optional = (check: Check): Check => value => value === undefined || check(value);
const boolean: Check = value => typeof value === 'boolean';
const distribution = shape({ observedSeconds: number, mean: nullable(number), p05: nullable(number), p50: nullable(number), p95: nullable(number) });
const identity = shape({ ordinal: number, performanceIndex: number, drivetrain: number });
const documentChecks: Record<RoadDocument['kind'], Check> = {
  workflow: shape({ identity, identitySource: string, carName: string, configuration: string,
    event: shape({ name: string, format: value => value === 'circuit' || value === 'sprint', driverAssists: string, conditions: string }) }),
  setup: shape({ label: string, fields: dictionary(shape({ value: number, unit: string, source: string })), confirmationScope: string, source: string, baselineSetupId: nullable(id) }),
  run: shape({ setupId: id, sessionId: id, settingsConfirmed: boolean, identity, otherSettings: string, tires: string, conditions: string, driverAssists: string }),
  summary: shape({ runId: id, sessionId: id, recording: shape({ endReason: string }), observations: shape({
    sampleCount: number, quality: shape({ observedSeconds: number, gapSeconds: number }), channels: optional(dictionary(distribution)),
    laps: array(shape({ lapNumber: number, complete: boolean, lapTimeSeconds: nullable(number), lapTimeSource: string })),
    wheels: dictionary(shape({ temperatureC: distribution, startTemperatureC: nullable(number), endTemperatureC: nullable(number), temperatureChangeC: nullable(number),
      nearCompression: shape({ count: nullable(number), seconds: nullable(number), observedSeconds: number }), normalizedAngle: distribution })),
  }) }),
  finish: shape({ runId: id, timeSeconds: number, clean: string, source: string }),
  comparison: shape({ baselineRunIds: array(id), candidateRunIds: array(id), baselineSetupId: id, candidateSetupId: id, conclusion: string,
    reasons: array(string), limitations: array(string), methodVersion: string, evidenceLevel: string, independentRuns: shape({ baseline: number, candidate: number }),
    time: shape({ medianChangeSeconds: nullable(number), baselineSeconds: array(number), candidateSeconds: array(number), repeatedDirectionConsistent: boolean }),
    thermalStart: shape({ status: string, changeC: array(nullable(number)) }),
    local: shape({ routeStatus: string, baselineCoverage: number, candidateCoverage: number, matchedDrivingConditions: number, meanNormalizedAngleChange: nullable(number),
      segments: optional(array(shape({ index: number, fromMeters: number, toMeters: number, matchedLocations: number, angleLocations: number,
        meanNormalizedAngleChange: nullable(number), meanTemperatureChangeC: array(nullable(number)) }))) }),
  }),
  decision: shape({ reportId: id, choice: string, setupId: id, status: string }),
  feedback: shape({ baselineRunId: id, hypothesis: string, source: string, baselineSetupId: id }),
  'vehicle-inputs': shape({ fields: dictionary(shape({ value: number, unit: string, source: string })), confirmationScope: string }),
};

function validDocument(value: unknown): value is RoadDocument {
  if (!object(value) || value.schema !== 'road-workflow/v1' || !id(value.id) || !id(value.workflowId) || !number(value.createdAt)) return false;
  return typeof value.kind === 'string' && Object.prototype.hasOwnProperty.call(documentChecks, value.kind) && documentChecks[value.kind as RoadDocument['kind']](value);
}

export function roadReviewPath(workflowId?: string, resource?: 'comparisons' | 'decisions' | 'capture', runId?: string): string {
  if (workflowId === undefined) return '/api/road/workflows';
  if (!id(workflowId)) throw new Error('Select a saved Road workflow.');
  const path = '/api/road/workflows/' + encodeURIComponent(workflowId);
  if (resource === 'capture') {
    if (!id(runId)) throw new Error('Select a saved Road run.');
    return path + '/runs/' + encodeURIComponent(runId!) + '/capture';
  }
  return path + (resource ? '/' + resource : '');
}

export function roadReviewComparisonBody(value: unknown): RoadReviewComparison {
  if (!object(value) || !array(id)(value.baselineRunIds) || !array(id)(value.candidateRunIds)) throw new Error('Select saved baseline and candidate runs.');
  const baselineRunIds = [...new Set(value.baselineRunIds as string[])], candidateRunIds = [...new Set(value.candidateRunIds as string[])];
  if (!baselineRunIds.length || !candidateRunIds.length || baselineRunIds.some(run => candidateRunIds.includes(run))) throw new Error('Select distinct baseline and candidate runs.');
  return { baselineRunIds, candidateRunIds };
}

export function roadReviewDecisionBody(value: unknown): RoadReviewDecision {
  if (!object(value) || !id(value.reportId) || !['keep-candidate', 'keep-baseline', 'retest-baseline'].includes(String(value.choice))) throw new Error('Select a saved comparison and a valid choice.');
  return { reportId: value.reportId as string, choice: value.choice as RoadReviewDecision['choice'] };
}

export function createRoadReviewIo(fetcher: Fetcher = backendFetch): RoadReviewIo {
  const missing = Symbol('missing-workflow');
  async function request(path: string, signal?: AbortSignal, body?: unknown, missingAllowed = false): Promise<unknown> {
    const response = await fetcher(path, body === undefined ? { signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (missingAllowed && response.status === 404) return missing;
    let data: unknown;
    try { data = await response.json(); } catch { throw new Error(response.ok ? 'The Road response is malformed. Retry loading the workflow.' : 'Road request failed. Retry when the backend is available.'); }
    if (!response.ok) throw new Error(object(data) && typeof data.detail === 'string' ? data.detail : 'Road request failed. Check the entered values and try again.');
    return data;
  }
  function documents(value: unknown, workflowId?: string): RoadDocument[] {
    if (!Array.isArray(value) || !value.every(item => validDocument(item) && (!workflowId || item.workflowId === workflowId))
      || new Set(value.map(item => item.id)).size !== value.length) throw new Error('The Road response contains invalid or mismatched documents. Retry loading the workflow.');
    return value;
  }
  async function mutate<K extends 'comparison' | 'decision'>(workflowId: string, kind: K, body: unknown): Promise<Extract<RoadDocument, { kind: K }>> {
    const data = await request(roadReviewPath(workflowId, kind === 'comparison' ? 'comparisons' : 'decisions'), undefined, body);
    if (!validDocument(data) || data.kind !== kind || data.workflowId !== workflowId) throw new Error('The Road change returned invalid or mismatched documents. Reload before retrying.');
    return data as Extract<RoadDocument, { kind: K }>;
  }
  return {
    async list(signal) {
      const list = documents(await request(roadReviewPath(), signal));
      if (!list.every(item => item.kind === 'workflow' && item.id === item.workflowId)) throw new Error('The Road library response is malformed.');
      return list as RoadWorkflow[];
    },
    async read(workflowId, signal) {
      const data = await request(roadReviewPath(workflowId), signal, undefined, true);
      if (data === missing) return null;
      const list = documents(data, workflowId);
      if (!list.some(item => item.kind === 'workflow' && item.id === workflowId)) throw new Error('The Road response is missing the selected workflow.');
      return list;
    },
    async capture(workflowId, runId, signal) {
      const data = await request(roadReviewPath(workflowId, 'capture', runId), signal);
      if (!object(data) || data.schemaVersion !== 'tuning-capture/v1' || !object(data.references) || data.references.workflowId !== workflowId || data.references.runId !== runId
        || !Array.isArray(data.samples) || !object(data.metadata)) throw new Error('The saved capture is invalid or belongs to another run.');
      return data as RoadReviewCapture;
    },
    compare: (workflowId, body) => mutate(workflowId, 'comparison', roadReviewComparisonBody(body)) as Promise<RoadReport>,
    decide: (workflowId, body) => mutate(workflowId, 'decision', roadReviewDecisionBody(body)) as Promise<RoadDecision>,
  };
}

/** Request leases only: no recording lifecycle, polling, provider or persistent selection. */
export function createRoadReviewGuard() {
  let workflowId = '', selectionGeneration = 0, generation = 0;
  const latest = new Map<RoadReviewLease['channel'], number>();
  let operation: RoadReviewOperation | null = null;
  const applies = (lease: RoadReviewLease) => lease.workflowId === workflowId && lease.selectionGeneration === selectionGeneration && latest.get(lease.channel) === lease.generation;
  const begin = (channel: RoadReviewLease['channel']): RoadReviewLease => {
    const lease = { workflowId, selectionGeneration, generation: ++generation, channel };
    latest.set(channel, lease.generation);
    return lease;
  };
  return {
    select(next: string) { if (next !== workflowId) { workflowId = next; selectionGeneration += 1; latest.clear(); } },
    invalidate() { selectionGeneration += 1; latest.clear(); },
    read: (channel: Exclude<RoadReviewLease['channel'], 'mutation'>) => begin(channel),
    beginMutation() {
      if (!workflowId || operation?.status === 'pending') return null;
      const lease = begin('mutation');
      operation = { lease, status: 'pending' };
      return lease;
    },
    applies,
    settle(lease: RoadReviewLease, succeeded: boolean) {
      if (operation?.lease.generation !== lease.generation || operation.status !== 'pending') return false;
      operation = { lease, status: succeeded ? 'succeeded' : 'failed' };
      return applies(lease);
    },
    get operation() { return operation; },
  };
}
