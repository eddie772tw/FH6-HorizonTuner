import { autoTuneRequest as invoke } from './autoTuneApi';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RunSnapshot {
  status: 'running' | 'stopping' | 'completed' | 'failed' | 'stopped';
  step: number;
  elapsedMs: number;
  observed: Record<string, unknown>;
  recommended: Record<string, unknown>;
  logs: Array<{ elapsedMs: number; message: string }>;
  active: boolean;
  goal?: string;
  season?: string;
  runId: string;
  imageRevision: string | null;
}

export function useAutoTuneRun() {
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  const [revision, setRevision] = useState(0);
  const imageCache = useRef({ key: '', url: '' });
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (imageCache.current.url) URL.revokeObjectURL(imageCache.current.url);
      imageCache.current = { key: '', url: '' };
    };
  }, []);

  useEffect(() => {
    let current = true;
    let retry: ReturnType<typeof setTimeout>;
    async function refresh() {
      let active = true;
      try {
        const next = await invoke<RunSnapshot | null>('auto_tune_poll');
        if (!current) return;
        setRun(next); setPending(false);
        active = !!next?.active;
        const key = next?.imageRevision ? next.runId + '/' + next.imageRevision : '';
        if (key !== imageCache.current.key) {
          let url = '';
          if (next && key) {
            const bytes = await invoke<ArrayBuffer>('auto_tune_image', { runId: next.runId });
            if (!current) return;
            url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
          }
          if (imageCache.current.url) URL.revokeObjectURL(imageCache.current.url);
          imageCache.current = { key, url };
          setImage(url || null);
        }
        setError('');
      } catch (reason) {
        if (current) { setError(String(reason)); setPending(false); }
        active = true;
      } finally {
        if (current) retry = setTimeout(() => void refresh(), active ? 750 : 1500);
      }
    }
    void refresh();
    return () => { current = false; clearTimeout(retry); };
  }, [revision]);

  const command = useCallback(async (name: string, args?: Record<string, string>) => {
    setPending(true); setError('');
    try {
      await invoke(name, args);
      if (live.current) setRevision(last => last + 1);
    } catch (reason) {
      if (live.current) { setError(String(reason)); setPending(false); }
    }
  }, []);
  return { run, image, error, pending, start: (goal: string, season: string) => command('auto_tune_start', { goal, season }), stop: () => command('auto_tune_stop', { runId: run?.runId ?? '' }) };
}
