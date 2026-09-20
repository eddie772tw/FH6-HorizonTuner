import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadCapture } from '../tuning/captureDownload';
import { useRoadValidation } from './RoadValidationController';
import { createRoadReviewGuard, createRoadReviewIo, roadReviewComparisonBody, roadReviewDecisionBody } from './roadReviewIo';
import { documentsOf, type RoadDecision, type RoadDocument, type RoadReport, type RoadWorkflow } from './roadTypes';
import type { RoadReviewIo, RoadReviewStatus } from './roadReviewTypes';

const defaultIo = createRoadReviewIo();
const message = (error: unknown) => error instanceof Error ? error.message : 'Road request failed. Try again.';

export function useRoadReviewLibrary(workflowId: string, io: RoadReviewIo = defaultIo) {
  const guard = useMemo(createRoadReviewGuard, []);
  guard.select(workflowId);
  const [state, setState] = useState<{ workflowId: string; status: RoadReviewStatus; workflows: RoadWorkflow[]; error: string }>({ workflowId, status: 'loading', workflows: [], error: '' });
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const lease = guard.read('library');
    setState({ workflowId, status: 'loading', workflows: [], error: '' });
    try {
      const workflows = await io.list(signal);
      if (guard.applies(lease)) setState({ workflowId, status: workflows.length ? 'ready' : 'empty', workflows, error: '' });
    } catch (error) {
      if (guard.applies(lease)) setState({ workflowId, status: 'error', workflows: [], error: message(error) });
    }
  }, [guard, io, workflowId]);
  useEffect(() => {
    const abort = new AbortController();
    void refresh(abort.signal);
    return () => { guard.invalidate(); abort.abort(); };
  }, [guard, refresh]);
  return { ...(state.workflowId === workflowId ? state : { workflowId, status: 'loading' as const, workflows: [], error: '' }), refresh };
}

export function useRoadReview(workflowId: string, io: RoadReviewIo = defaultIo) {
  const controller = useRoadValidation();
  const guard = useMemo(createRoadReviewGuard, []);
  guard.select(workflowId);
  const [state, setState] = useState<{ workflowId: string; status: RoadReviewStatus; documents: RoadDocument[]; error: string }>({ workflowId, status: 'loading', documents: [], error: '' });
  const [notice, setNotice] = useState({ workflowId, message: '' });
  const [exporting, setExporting] = useState({ workflowId, active: false });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; guard.invalidate(); }; }, [guard]);
  const applies = useCallback((lease: Parameters<typeof guard.applies>[0]) => mounted.current && guard.applies(lease), [guard]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const lease = guard.read('detail');
    setState({ workflowId, status: workflowId ? 'loading' : 'empty', documents: [], error: '' });
    if (!workflowId) return;
    try {
      const documents = await io.read(workflowId, signal);
      if (applies(lease)) setState({ workflowId, status: documents === null ? 'missing' : 'ready', documents: documents ?? [], error: '' });
    } catch (error) {
      if (applies(lease)) setState({ workflowId, status: 'error', documents: [], error: message(error) });
    }
  }, [applies, guard, io, workflowId]);
  useEffect(() => {
    const abort = new AbortController();
    setNotice({ workflowId, message: '' });
    setExporting({ workflowId, active: false });
    void refresh(abort.signal);
    return () => { guard.invalidate(); abort.abort(); };
  }, [guard, refresh, workflowId]);

  const perform = async <T extends RoadReport | RoadDecision>(kind: string, request: () => Promise<T>): Promise<T | null> => {
    if (state.workflowId !== workflowId || state.status !== 'ready') return null;
    const lease = guard.beginMutation();
    if (!lease) return null;
    const operationId = controller.beginOperation('review-' + kind);
    if (operationId === null) { guard.settle(lease, false); return null; }
    setNotice({ workflowId, message: '' });
    let saved = false;
    try {
      const result = await request();
      saved = true;
      if (!applies(lease)) return null;
      // Invalidate any older detail read before reloading the saved result.
      const readLease = guard.read('detail');
      try {
        const documents = await io.read(workflowId);
        if (applies(lease) && applies(readLease)) {
          setState({ workflowId, status: documents === null ? 'missing' : 'ready', documents: documents ?? [], error: '' });
          setNotice({ workflowId, message: kind === 'decision' ? 'Choice saved. Return to Tune to continue and confirm game values.' : 'Comparison saved.' });
        }
      } catch {
        if (applies(lease) && applies(readLease)) setNotice({ workflowId, message: 'The change was saved, but the view could not refresh. Reload the saved workflow before continuing.' });
      }
      return applies(lease) ? result : null;
    } catch (error) {
      if (applies(lease)) setNotice({ workflowId, message: message(error) });
      return null;
    } finally {
      // Settlement releases the shared operation even after leaving this view.
      guard.settle(lease, saved);
      controller.finishOperation(operationId, saved);
    }
  };
  const compare = (body: unknown) => perform('comparison', async () => {
    const payload = roadReviewComparisonBody(body);
    const savedRuns = new Set(documentsOf(state.documents, 'summary').map(summary => summary.runId));
    if (![...payload.baselineRunIds, ...payload.candidateRunIds].every(id => savedRuns.has(id))) throw new Error('Select runs saved in this workflow.');
    return io.compare(workflowId, payload);
  });
  const decide = (body: unknown) => perform('decision', async () => {
    const payload = roadReviewDecisionBody(body);
    if (!documentsOf(state.documents, 'comparison').some(report => report.id === payload.reportId)) throw new Error('Select a comparison saved in this workflow.');
    return io.decide(workflowId, payload);
  });
  const exportCapture = async (runId: string) => {
    if (state.workflowId !== workflowId || state.status !== 'ready' || !documentsOf(state.documents, 'summary').some(summary => summary.runId === runId)) return;
    const lease = guard.read('capture');
    setExporting({ workflowId, active: true });
    setNotice({ workflowId, message: '' });
    try {
      const capture = await io.capture(workflowId, runId);
      if (applies(lease)) downloadCapture(capture, 'road-capture.json');
    } catch (error) {
      if (applies(lease)) setNotice({ workflowId, message: message(error) });
    } finally {
      if (applies(lease)) setExporting({ workflowId, active: false });
    }
  };
  return {
    ...(state.workflowId === workflowId ? state : { workflowId, status: 'loading' as const, documents: [], error: '' }),
    busy: controller.operation?.status === 'pending',
    notice: notice.workflowId === workflowId ? notice.message : '',
    exporting: exporting.workflowId === workflowId && exporting.active,
    refresh, compare, decide, exportCapture,
  };
}
