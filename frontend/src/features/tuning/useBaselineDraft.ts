import { useRef, useState } from 'react';
import type { BaselinePreview } from '../../domain/tuning/types';

type Fields = Record<string, { value: number; unit: string }>;
interface Draft { sessionContext: string; goal: string; fields: Fields; phase: 'draft' | 'cancelled' | 'applied' }

/** UI draft only. Rust owns proposed values, differences and application eligibility. */
export function useBaselineDraft(sessionContext: string, goal: string, setGoal: (value: string) => void, inputContext = '') {
  const fresh = (): Draft => ({ sessionContext, goal, fields: {}, phase: 'draft' });
  const [state, setState] = useState<Draft>(fresh);
  const applied = useRef<BaselinePreview | null>(null);
  if (state.sessionContext !== sessionContext) setState(fresh());
  const current = state.sessionContext === sessionContext ? state : fresh();
  // Request/apply scope includes inputs without using their edits to reset the draft.
  const context = JSON.stringify([sessionContext, inputContext, current.goal, current.fields]);
  const live = useRef({ context, goal: current.goal, phase: current.phase });
  live.current = { context, goal: current.goal, phase: current.phase };
  return {
    context, goal: current.goal, fields: current.fields, phase: current.phase,
    setDraftGoal: (value: string) => setState({ ...current, goal: value, phase: 'draft' }),
    begin: () => setState({ ...current, phase: 'draft' }),
    cancel: () => { live.current.phase = 'cancelled'; setState({ ...current, goal, phase: 'cancelled' }); },
    apply: (preview: BaselinePreview, previewContext: string) => {
      if (previewContext !== live.current.context || applied.current === preview || live.current.phase !== 'draft' || !preview.canApply || preview.goal !== live.current.goal) return;
      applied.current = preview;
      live.current.phase = 'applied';
      const fields: Fields = { ...current.fields };
      for (const field of preview.fields) if (field.status === 'available' && field.recommended != null) {
        fields[field.key] = { value: field.recommended, unit: field.unit };
      }
      setState({ ...current, fields, phase: 'applied' });
      setGoal(current.goal);
    },
  };
}
