import { useEffect, useState } from 'react';
import { backendFetch } from '../../services/backend';
/** Shared async boundary for immutable draft calculations; failed requests retry without formula fallback. */
export function useLocalCalculationState<T>(path: string, input: unknown | null): { value: T | null; status: 'idle' | 'pending' | 'ready' | 'error' } {
  const key = input === null ? null : JSON.stringify(input);
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'ready' | 'error'>(key === null ? 'idle' : 'pending');
  const identity = JSON.stringify([path, key]);
  const [renderKey, setRenderKey] = useState(identity);
  if (renderKey !== identity) { setRenderKey(identity); setState(null); setStatus(key === null ? 'idle' : 'pending'); }
  useEffect(() => {
    if (key === null) return;
    let active = true; let retry: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await backendFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: controller.signal });
        if (!response.ok) throw new Error('Calculation unavailable');
        const value = await response.json() as T;
        if (active) { setState({ key, value }); setStatus('ready'); }
      } catch { if (active) { setState(null); setStatus('error'); retry = setTimeout(run, 2000); } }
    };
    void run(); return () => { active = false; controller.abort(); clearTimeout(retry); };
  }, [key, path]);
  return { value: renderKey === identity && state?.key === key ? state.value : null, status };
}

export function useLocalCalculation<T>(path: string, input: unknown | null): T | null {
  return useLocalCalculationState<T>(path, input).value;
}
