import type { TuningCaptureSample } from '../../domain/tuning/telemetryCapture';
import type { TuningMeasurementState } from '../../domain/tuning/types';
import type { EngineBatchResult } from './engineBatch';

export interface ReadyEngineSegment { state: TuningMeasurementState; samples: TuningCaptureSample[]; readiness?: EngineBatchResult['readiness'] }

/** Apply Rust-owned boundaries while keeping packets that arrived during the request. */
export function reconcileEngineSegments(samples: TuningCaptureSample[], start: number, end: number,
  result: EngineBatchResult, previousReady?: ReadyEngineSegment) {
  const continuity = result.continuity;
  const offset = continuity?.segmentStartIndex;
  const cut = offset == null ? 0 : start + offset;
  let ready = previousReady;
  const retained = continuity?.retainedSnapshot;
  if (retained) ready = { state: retained.state, readiness: retained.readiness,
    samples: samples.slice(retained.segmentStartIndex == null ? 0 : start + retained.segmentStartIndex, start + retained.sampleEndIndex) };
  if (result.readySnapshot) ready = { state: result.readySnapshot, readiness: result.readyReadiness ?? result.readiness,
    samples: samples.slice(cut, continuity?.readySampleEndIndex == null ? end : start + continuity.readySampleEndIndex) };
  if (result.state.status === 'blocked') ready = undefined;
  return { samples: cut ? samples.slice(cut) : samples, cursor: end - cut, ready };
}
