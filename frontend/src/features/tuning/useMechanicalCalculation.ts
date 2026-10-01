import { useEffect, useRef, useState } from 'react';
import type { Season, TuningCarParams } from '../../utils/tuningMath';
import { CalculationSequence, mechanicalRequestKey, requestMechanical, type MechanicalInput, type MechanicalResult } from './mechanicalCalculation';

export function useMechanicalCalculation(carId: string, goal: string, season: Season, profile: TuningCarParams | null) {
  const key = mechanicalRequestKey(carId, goal, season, profile);
  const sequence = useRef(new CalculationSequence());
  const [state, setState] = useState<{ key: string; result: MechanicalResult } | null>(null);
  useEffect(() => {
    const token = sequence.current.next();
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    let stopped = false;
    const input = JSON.parse(key) as MechanicalInput & { carId: string };
    const { carId: _identity, ...request } = input;
    if (!request.profile) return;
    const run = async () => {
      try {
        const result = await requestMechanical(request, controller.signal);
        if (!stopped && sequence.current.current(token)) setState({ key, result });
      } catch {
        if (!stopped && sequence.current.current(token)) {
          setState(null);
          retry = setTimeout(run, 2000);
        }
      }
    };
    void run();
    return () => { stopped = true; controller.abort(); clearTimeout(retry); sequence.current.next(); };
  }, [key]);
  // Render-time invalidation avoids even one frame of results for a different draft.
  return state?.key === key ? state.result : null;
}
