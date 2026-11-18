import { expect, it } from 'vitest';
import type { TuningCaptureSample } from '../../domain/tuning/telemetryCapture';
import type { EngineBatchResult } from './engineBatch';
import { reconcileEngineSegments } from './engineMeasurementSegments';
import { createEngineCalculation } from './measurementInitialState';

const state = { ...createEngineCalculation('42'), status: 'ready' as const, guidance: 'ready' as const };
const samples = [100, 200, 300, 0, 100, 200].map(timestampMS => ({ timestampMS }) as TuningCaptureSample);

it('keeps in-flight packets, cuts the active segment and pairs the retained ready state with its own frames', () => {
  const result = { state: createEngineCalculation('42'), readySnapshot: null, continuity: {
    segmentStartIndex: 1, restartCount: 1, reason: 'timestamp-regressed', readySampleEndIndex: null,
    retainedSnapshot: { state, segmentStartIndex: null, sampleEndIndex: 1 },
  } } as EngineBatchResult;
  const segment = reconcileEngineSegments(samples, 2, 5, result);
  expect(segment.samples.map(s => s.timestampMS)).toEqual([0, 100, 200]);
  expect(segment.cursor).toBe(2);
  expect(segment.ready?.samples.map(s => s.timestampMS)).toEqual([100, 200, 300]);
});

it('selects the final segment snapshot and never rebinds a previous snapshot to new samples', () => {
  const result = { state, readySnapshot: state, continuity: {
    segmentStartIndex: 1, restartCount: 1, reason: 'timestamp-regressed', readySampleEndIndex: 3, retainedSnapshot: null,
  } } as EngineBatchResult;
  const segment = reconcileEngineSegments(samples, 2, 5, result, { state, samples: samples.slice(0, 2) });
  expect(segment.ready?.samples.map(s => s.timestampMS)).toEqual([0, 100]);
  const blocked = reconcileEngineSegments(samples, 2, 5, { ...result, state: { ...state, status: 'blocked' } }, segment.ready);
  expect(blocked.ready).toBeUndefined();
});
