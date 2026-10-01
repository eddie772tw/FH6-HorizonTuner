import { useEffect, useState } from 'react';
import { backendFetch } from '../../services/backend';
/** Shared async boundary for immutable draft calculations; failed requests retry without formula fallback. */
export function useLocalCalculation<T>(path: string, input: unknown | null): T | null {
  const key = input === null ? null : JSON.stringify(input);
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  const [renderKey, setRenderKey] = useState(key);
  if (renderKey !== key) { setRenderKey(key); setState(null); }
  useEffect(() => {
    if (key === null) return;
    let active = true; let retry: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await backendFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: controller.signal });
        if (!response.ok) throw new Error('Calculation unavailable');
        const value = await response.json() as T;
        if (active) setState({ key, value });
      } catch { if (active) { setState(null); retry = setTimeout(run, 2000); } }
    };
    void run(); return () => { active = false; controller.abort(); clearTimeout(retry); };
  }, [key, path]);
  return renderKey === key && state?.key === key ? state.value : null;
}
