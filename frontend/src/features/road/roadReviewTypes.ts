import type { RoadDecision, RoadDocument, RoadReport, RoadWorkflow } from './roadTypes';

export type RoadReviewChoice = 'keep-candidate' | 'keep-baseline' | 'retest-baseline';
export interface RoadReviewComparison { baselineRunIds: string[]; candidateRunIds: string[] }
export interface RoadReviewDecision { reportId: string; choice: RoadReviewChoice }
export interface RoadReviewCapture extends Record<string, unknown> {
  schemaVersion: 'tuning-capture/v1';
  references: { workflowId: string; runId: string };
  samples: unknown[];
}
export interface RoadReviewIo {
  list(signal?: AbortSignal): Promise<RoadWorkflow[]>;
  read(workflowId: string, signal?: AbortSignal): Promise<RoadDocument[] | null>;
  capture(workflowId: string, runId: string, signal?: AbortSignal): Promise<RoadReviewCapture>;
  compare(workflowId: string, body: RoadReviewComparison): Promise<RoadReport>;
  decide(workflowId: string, body: RoadReviewDecision): Promise<RoadDecision>;
}
export type RoadReviewStatus = 'loading' | 'ready' | 'empty' | 'missing' | 'error';
export interface RoadReviewLease {
  readonly workflowId: string;
  readonly selectionGeneration: number;
  readonly generation: number;
  readonly channel: 'library' | 'detail' | 'capture' | 'mutation';
}
export interface RoadReviewOperation {
  readonly lease: RoadReviewLease;
  readonly status: 'pending' | 'succeeded' | 'failed';
}
