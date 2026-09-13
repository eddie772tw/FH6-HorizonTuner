import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backendFetch } from '../../services/backend';
import type { RoadDocument, RoadLive, RoadWorkflow } from './roadTypes';
import { createRoadLiveReader } from './roadLiveReader';

export async function roadRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await backendFetch('/api/road' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Road request failed. Check the entered values and try again.');
  return data as T;
}

interface RoadWorkflowOptions {
  selectedId?: string;
  onSelect?: (workflowId: string) => void;
  onLive?: (live: RoadLive) => void;
}

function restoreSelectedWorkflowId(): string {
  try {
    return localStorage.getItem('road-selected-workflow') || '';
  } catch {
    return '';
  }
}

export function useRoadWorkflow(options: RoadWorkflowOptions = {}) {
  const [workflows, setWorkflows] = useState<RoadWorkflow[]>([]);
  const [storedSelectedId, setStoredSelectedId] = useState(restoreSelectedWorkflowId);
  const selectedId = options.selectedId ?? storedSelectedId;
  const select = options.onSelect ?? setStoredSelectedId;
  const [documents, setDocuments] = useState<RoadDocument[]>([]);
  const [live, setLive] = useState<RoadLive | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const mutationGeneration = useRef(0);
  const mounted = useRef(false);
  const selectedRef = useRef(selectedId);
  const selectRef = useRef(select);
  const liveListener = useRef(options.onLive);
  selectedRef.current = selectedId;
  selectRef.current = select;
  liveListener.current = options.onLive;

  const liveReader = useMemo(() => createRoadLiveReader(
    () => roadRequest<RoadLive>('/live'),
    next => { setLive(next); liveListener.current?.(next); },
    failure => { setLive(null); setError(failure instanceof Error ? failure.message : String(failure)); },
    () => mounted.current,
  ), []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; liveReader.invalidate(); };
  }, [liveReader]);

  const refresh = useCallback(async () => {
    const id = selectedRef.current;
    const sequence = ++generation.current;
    try {
      const list = await roadRequest<RoadWorkflow[]>('/workflows');
      if (!mounted.current || sequence !== generation.current || id !== selectedRef.current) return;
      setWorkflows(list);
      setError('');
      if (id && !list.some(work => work.id === id)) {
        setDocuments([]);
        selectRef.current('');
        return;
      }
      const docs = id ? await roadRequest<RoadDocument[]>('/workflows/' + encodeURIComponent(id)) : [];
      if (!mounted.current || sequence !== generation.current || id !== selectedRef.current) return;
      setDocuments(docs);
    } catch (errorValue) {
      if (mounted.current && sequence === generation.current && id === selectedRef.current) {
        setError(String((errorValue as Error).message));
      }
      throw errorValue;
    }
  }, []);

  useEffect(() => {
    if (options.selectedId === undefined) {
      try {
        localStorage.setItem('road-selected-workflow', selectedId);
      } catch {
        // Direct-hook compatibility does not require browser storage.
      }
    }
    setDocuments([]);
    void refresh().catch(() => {});
  }, [options.selectedId, refresh, selectedId]);

  useEffect(() => {
    let disposed = false;
    let previousRun: string | null | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await liveReader.refresh();
      if (disposed) return;
      if (result.status === 'applied') {
        const state = result.live;
        if (previousRun !== state.activeRun?.id) await refresh().catch(() => {});
        previousRun = state.activeRun?.id;
      }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [liveReader, refresh]);

  const perform = async <T,>(path: string, body: unknown): Promise<T | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    const mutation = ++mutationGeneration.current;
    const selectedAtStart = selectedRef.current;
    const canUpdateView = () => mounted.current && mutation === mutationGeneration.current && selectedAtStart === selectedRef.current;
    if (mounted.current) {
      setBusy(true);
      setError('');
    }
    try {
      const value = await roadRequest<T>(path, body);
      if (canUpdateView()) {
        try {
          const result = await liveReader.refresh();
          if (canUpdateView() && result.status !== 'discarded') {
            if (result.status === 'failed') throw new Error('Live refresh failed');
            await refresh();
          }
        } catch {
          if (canUpdateView()) {
            setError('The change was saved, but the view could not refresh. Reopen the saved workflow.');
          }
        }
      }
      return value;
    } catch (errorValue) {
      if (canUpdateView()) setError(String((errorValue as Error).message));
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current && mutation === mutationGeneration.current) setBusy(false);
    }
  };

  return { workflows, selectedId, select, documents, live, error, busy, perform, refresh };
}
