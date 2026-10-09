import { useRef, useState } from 'react';
import type { BaselinePreview } from '../../domain/tuning/types';

type Fields = Record<string, { value: number; unit: string }>;
interface Draft { context: string; goal: string; fields: Fields; phase: 'draft' | 'cancelled' | 'applied' }

/** UI draft only. Rust owns proposed values, differences and application eligibility. */
export function useBaselineDraft(context: string, goal: string, setGoal: (value: string) => void) {
  const fresh = (): Draft => ({ context, goal, fields: {}, phase: 'draft' });
  const [state, setState] = useState<Draft>(fresh);
  const applied = useRef<BaselinePreview | null>(null);
  if (state.context !== context) setState(fresh());
  const current = state.context === context ? state : fresh();
  return {
    ...current,
    setDraftGoal: (value: string) => setState({ ...current, goal: value, phase: 'draft' }),
    begin: () => setState({ ...current, phase: 'draft' }),
    cancel: () => setState({ ...current, goal, phase: 'cancelled' }),
    apply: (preview: BaselinePreview) => {
      if (applied.current === preview || current.phase !== 'draft' || !preview.canApply || preview.goal !== current.goal) return;
      applied.current = preview;
      const fields: Fields = { ...current.fields };
      for (const field of preview.fields) if (field.status === 'available' && field.recommended != null) {
        fields[field.key] = { value: field.recommended, unit: field.unit };
      }
      setState({ ...current, fields, phase: 'applied' });
      setGoal(current.goal);
    },
  };
}
