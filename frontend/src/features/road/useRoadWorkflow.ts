import { useCallback, useEffect, useRef, useState } from 'react';
import { backendFetch } from '../../services/backend';
import type { RoadDocument, RoadLive, RoadWorkflow } from './roadTypes';

export async function roadRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await backendFetch('/api/road' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Road request failed. Check the entered values and try again.');
  return data as T;
}

export function useRoadWorkflow() {
  const [workflows, setWorkflows] = useState<RoadWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('road-selected-workflow') || '');
  const [documents, setDocuments] = useState<RoadDocument[]>([]);
  const [live, setLive] = useState<RoadLive | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const refresh = useCallback(async () => {
    const id = selectedRef.current, sequence = ++generation.current;
    const [list, docs] = await Promise.all([roadRequest<RoadWorkflow[]>('/workflows'), id ? roadRequest<RoadDocument[]>('/workflows/' + encodeURIComponent(id)) : Promise.resolve([])]);
    if (sequence !== generation.current || id !== selectedRef.current) return;
    setWorkflows(list); setDocuments(docs);
  }, []);
  useEffect(() => {
    localStorage.setItem('road-selected-workflow', selectedId);
    setDocuments([]);
    void refresh().catch(e => setError(String(e.message)));
  }, [selectedId, refresh]);
  useEffect(() => {
    let disposed = false, previousRun: string | null | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await roadRequest<RoadLive>('/live');
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
    try { const value = await roadRequest<T>(path, body); const state = await roadRequest<RoadLive>('/live'); setLive(state); await refresh(); return value; }
    catch (e) { setError(String((e as Error).message)); return null; }
    finally { setBusy(false); }
  };
  return { workflows, selectedId, select: setSelectedId, documents, live, error, busy, perform, refresh };
}
