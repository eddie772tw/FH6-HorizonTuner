import { useCallback, useEffect, useRef, useState } from 'react';
import type { BaselinePreview } from '../../domain/tuning/types';
import type { TuneSessionValue } from './TuneSessionProvider';
import { canOpenTuningStep } from './tuningWorkflow';
import { unavailableReadiness } from './useWorkflowCalculation';

export interface NavigationPreview {
  context: string;
  status: 'pending' | 'ready' | 'error';
  preview?: BaselinePreview;
  retry?: () => void;
}

const calculationError = 'Tuning calculation failed. Your applied target is retained. Retry continuing.';
const stale = () => new Error('Navigation cancelled because the vehicle, setup or draft changed.');

/** One forward transaction; asynchronous responses may only advance their original inputs. */
export function useTuningNavigation(session: TuneSessionValue, externalKey: string, saving: boolean,
  hasUnsavedParams: boolean, saveCarParams: () => Promise<unknown>, isInteractionBusy: () => boolean) {
  const current = useRef({ session, externalKey, saving, hasUnsavedParams, saveCarParams, isInteractionBusy });
  current.current = { session, externalKey, saving, hasUnsavedParams, saveCarParams, isInteractionBusy };
  const preview = useRef<NavigationPreview | null>(null);
  const sequence = useRef(0);
  const lock = useRef(false);
  const waiter = useRef<{ check: () => void; cancel: () => void } | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [error, setError] = useState('');
  const reportPreview = useCallback((value: NavigationPreview | null) => {
    preview.current = value;
    waiter.current?.check();
  }, []);
  useEffect(() => { waiter.current?.check(); });
  useEffect(() => () => { ++sequence.current; waiter.current?.cancel(); }, []);
  const previousKey = useRef(externalKey);
  useEffect(() => {
    if (previousKey.current === externalKey) return;
    previousKey.current = externalKey;
    ++sequence.current;
    waiter.current?.cancel();
    lock.current = false;
    setNavigating(false); setSaveError(false); setError('');
  }, [externalKey]);

  const perform = async (action?: () => void, forceSave = false, step?: number) => {
    if (lock.current || current.current.saving || current.current.isInteractionBusy()) return;
    lock.current = true;
    setNavigating(true); setSaveError(false); setError('');
    const token = ++sequence.current;
    const origin = current.current;
    const draftContext = origin.session.baseline.context;
    const forward = step !== undefined && step > origin.session.workflow.step;
    const applyDraft = forward && origin.session.baseline.phase === 'draft';
    const valid = () => {
      if (token !== sequence.current || current.current.externalKey !== origin.externalKey) throw stale();
    };
    const waitFor = <T,>(read: () => T | undefined): Promise<T> => new Promise((resolve, reject) => {
      const entry = {
        cancel: () => { if (waiter.current === entry) waiter.current = null; reject(stale()); },
        check: () => {
          try {
            valid();
            const value = read();
            if (value !== undefined) { if (waiter.current === entry) waiter.current = null; resolve(value); }
          } catch (cause) { if (waiter.current === entry) waiter.current = null; reject(cause); }
        },
      };
      waiter.current = entry; entry.check();
    });
    try {
      let candidate: BaselinePreview | undefined;
      let previewRetried = false;
      if (applyDraft) candidate = await waitFor(() => {
        const request = preview.current;
        if (!request || request.context !== draftContext || request.status === 'pending') return;
        if (request.status === 'error') {
          if (!previewRetried && request.retry) { previewRetried = true; request.retry(); return; }
          throw new Error(calculationError);
        }
        if (!request.preview?.canApply) throw new Error('Complete the missing baseline inputs before continuing.');
        return request.preview;
      });
      if (origin.hasUnsavedParams || forceSave) {
        try { await origin.saveCarParams(); }
        catch (cause) { if (token === sequence.current) setSaveError(true); throw cause; }
      }
      valid();
      if (current.current.session.baseline.context !== draftContext) throw stale();
      if (candidate && current.current.session.baseline.apply(candidate, draftContext) !== 'applied') throw stale();
      if (step !== undefined) {
        if (step === 1) {
          current.current.session.workflow.setReviewHistory(false);
          current.current.session.workflow.setStep(step);
          return;
        }
        let calculationRetried = false;
        const readiness = await waitFor(() => {
          const latest = current.current.session;
          if (candidate && (latest.baseline.phase !== 'applied' || latest.workflow.goal !== candidate.goal)) return;
          if (latest.calculationStatus === 'error') {
            if (!candidate && !calculationRetried && latest.retryCalculation) {
              calculationRetried = true; latest.retryCalculation(); return;
            }
            throw new Error(calculationError);
          }
          if (latest.calculationStatus !== 'ready') return;
          return latest.result?.readiness ?? unavailableReadiness;
        });
        if (!canOpenTuningStep(step, readiness)) throw new Error('Complete the required inputs or engine measurement before opening this step.');
        current.current.session.workflow.setReviewHistory(false);
        current.current.session.workflow.setStep(step);
      } else action?.();
    } catch (cause) {
      if (token === sequence.current) setError(cause instanceof Error ? cause.message : calculationError);
    } finally {
      if (token === sequence.current) { lock.current = false; setNavigating(false); }
    }
  };
  return { navigating, saveError, error, reportPreview,
    saveAndAct: (action?: () => void, forceSave = false) => perform(action, forceSave),
    openStep: (step: number) => { void perform(undefined, false, step); },
  };
}
