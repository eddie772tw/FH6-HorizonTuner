import { useCallback, useEffect, useRef, useState } from 'react';
import { backendFetch } from '../../services/backend';
import type { DriftDocument, DriftLive, DriftWorkflow } from './driftTypes';

export async function driftRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await backendFetch('/api/drift' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Drift request failed.');
  return data as T;
}

export function useDriftWorkflow() {
  const [workflows, setWorkflows] = useState<DriftWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('drift-selected-workflow') || '');
  const [documents, setDocuments] = useState<DriftDocument[]>([]);
  const [live, setLive] = useState<DriftLive | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;

  const refresh = useCallback(async () => {
    const id = selectedRef.current, sequence = ++generation.current;
    const [list, docs] = await Promise.all([
      driftRequest<DriftWorkflow[]>('/workflows'),
      id ? driftRequest<DriftDocument[]>('/workflows/' + encodeURIComponent(id)) : Promise.resolve([])
    ]);
    if (sequence !== generation.current || id !== selectedRef.current) return;
    setWorkflows(list); setDocuments(docs);
  }, []);

  useEffect(() => {
    localStorage.setItem('drift-selected-workflow', selectedId);
    setDocuments([]);
    void refresh().catch(e => setError(String(e.message)));
  }, [selectedId, refresh]);

  useEffect(() => {
    let disposed = false, previousRun: string | null | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await driftRequest<DriftLive>('/live');
        if (disposed) return;
        setLive(state);
        if (previousRun !== state.activeRun?.id) await refresh();
        previousRun = state.activeRun?.id;
      } catch (e) { if (!disposed) { setLive(null); setError(String((e as Error).message)); } }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [refresh]);

  const perform = async <T,>(path: string, body: unknown): Promise<T | null> => {
    setBusy(true); setError('');
    try { const value = await driftRequest<T>(path, body); const state = await driftRequest<DriftLive>('/live'); setLive(state); await refresh(); return value; }
    catch (e) { setError(String((e as Error).message)); return null; }
    finally { setBusy(false); }
  };

  return { workflows, selectedId, select: setSelectedId, documents, live, error, busy, perform, refresh };
}
