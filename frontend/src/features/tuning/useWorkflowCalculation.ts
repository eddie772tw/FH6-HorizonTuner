import { useEffect, useRef, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import type { Season, MeasuredEngineInputs, ChassisTuningResult, StaticTireAlignResult } from '../../domain/tuning/types';
import type { EvGearingInput } from '../../domain/tuning/ev/types';
import type { WorkflowGearingResult } from '../../domain/tuning/types';
import type { WorkflowRecommendation } from '../../domain/tuning/types';
import type { WorkflowReadiness } from './tuningWorkflow';
import { CalculationSequence } from './mechanicalCalculation';
import { backendFetch } from '../../services/backend';
import { usesCvt, type CvtFoundationResult } from '../../domain/tuning/transmission';

export interface AuthoritativeWorkflow {
  cvt?: CvtFoundationResult;
  schemaVersion: 'tuning-workflow-result/v1';
  chassis: ChassisTuningResult;
  alignment: StaticTireAlignResult;
  gearing: WorkflowGearingResult | null;
  readiness: WorkflowReadiness;
  recommendation: WorkflowRecommendation | null;
}
export const unavailableReadiness: WorkflowReadiness = { mechanical: false, engineInputs: false, measuredEngine: false, gearingAvailable: false };
export function useWorkflowCalculation(carId: string, goal: string, season: Season, profile: CarParams | null,
  engine: MeasuredEngineInputs | null, ev: EvGearingInput | null, inputSnapshot: Record<string, unknown>) {
  const evidence = usesCvt(profile) ? inputSnapshot.cvtEvidence ?? null : profile?.isElectric ? inputSnapshot.evEvidence ?? null : engine && inputSnapshot.engineObservation ? { kind: 'saved-engine', observationId: (inputSnapshot.engineObservation as { id: string }).id } : null;
  const key = JSON.stringify({ carId, evidence, schemaVersion: 'tuning-workflow-result/v1', goal, season, profile, engine, ev, inputSnapshot });
  const sequence = useRef(new CalculationSequence());
  const [state, setState] = useState<{ key: string; result: AuthoritativeWorkflow } | null>(null);
  const [status, setStatus] = useState<'pending' | 'ready' | 'error'>('pending');
  const [renderKey, setRenderKey] = useState(key);
  // Clear retained data during render so A→B→A cannot briefly redisplay the first A result.
  if (renderKey !== key) { setRenderKey(key); setState(null); setStatus('pending'); }
  useEffect(() => {
    const token = sequence.current.next();
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    let stopped = false;
    const { carId: _identity, ...input } = JSON.parse(key);
    if (!input.profile) return;
    const run = async () => {
      try {
        const response = await backendFetch('/api/tuning/workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
        if (!response.ok) throw new Error(`Calculation failed (${response.status})`);
        const result = await response.json() as AuthoritativeWorkflow;
        if (result.schemaVersion !== 'tuning-workflow-result/v1') throw new Error('Unsupported calculation result');
        if (usesCvt(input.profile) && (result.cvt?.schemaVersion !== 'cvt-qualification/v1'
          || result.cvt.status !== 'unsupported' || result.gearing !== null || result.recommendation !== null
          || result.readiness?.measuredEngine !== false || result.readiness?.gearingAvailable !== false)) {
          throw new Error('Unsupported CVT foundation result');
        }
        if (!stopped && sequence.current.current(token)) { setState({ key, result }); setStatus('ready'); }
      } catch {
        if (!stopped && sequence.current.current(token)) { setState(null); setStatus('error'); retry = setTimeout(run, 2000); }
      }
    };
    void run();
    return () => { stopped = true; controller.abort(); clearTimeout(retry); sequence.current.next(); };
  }, [key]);
  return { result: renderKey === key && state?.key === key ? state.result : null, status: renderKey === key ? status : 'pending' as const };
}
