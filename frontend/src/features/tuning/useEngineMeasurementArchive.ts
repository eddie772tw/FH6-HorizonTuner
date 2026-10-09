import { useEffect, useRef, useState } from 'react';
import type { TuningCarParams } from '../../domain/tuning/types';
import type { TuningMeasurementState } from '../../domain/tuning/types';
import { engineDependencyKey, type EngineObservation } from './engineObservationIdentity';
import type { TuningCaptureFile } from '../../domain/tuning/telemetryCapture';
import { backendFetch } from '../../services/backend';
import { validateEngineCapture } from './engineCaptureReadback';
import type { EngineCalculationSummary } from '../../domain/tuning/types';
import { isCurrentEngineObservationSaveToken, type EngineObservationSaveToken } from './tuneSessionController';

const STORAGE_KEY = 'tuning-engine-observations/v1';
const readArchive = (): unknown => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
export function useEngineMeasurementArchive(carId: string, profile: TuningCarParams | null, identityGeneration = 0, setupContext = '') {
  const [archive, setArchive] = useState<EngineObservation[]>([]);
  const [selected, setSelected] = useState<EngineObservation | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const saving = useRef<number | null>(null);
  const saveSequence = useRef(0);
  const pending = useRef<{ signature: string; item: EngineObservation; capture: TuningCaptureFile } | null>(null);
  const key = engineDependencyKey(carId, profile);
  const keyRef = useRef(key);
  const generation = useRef(0);
  const identityGenerationRef = useRef(identityGeneration);
  identityGenerationRef.current = identityGeneration;
  const currentSaveToken = (): EngineObservationSaveToken => ({
    archiveGeneration: generation.current,
    identityGeneration: identityGenerationRef.current,
    dependencyKey: keyRef.current,
  });
  // Invalidate save/hydration callbacks during render, including setup changes
  // outside the narrower measured-engine dependency key.
  const scope = JSON.stringify([key, identityGeneration, setupContext]);
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    keyRef.current = key;
    generation.current += 1;
    pending.current = null;
    saving.current = null;
    setPendingSave(false);
    setSelected(null);
  }
  useEffect(() => {
    let active = true;
    void backendFetch('/api/road/engine-observations').then(async response => {
      if (!response.ok) return;
      const value = await response.json();
      const savedResponse = await backendFetch('/api/tuning/engine-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      const localResponse = await backendFetch('/api/tuning/engine-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(readArchive()) });
      if (!savedResponse.ok || !localResponse.ok) return;
      const saved = await savedResponse.json() as EngineObservation[];
      const local = await localResponse.json() as EngineObservation[];
      const hydrated = [...local, ...saved];
      if (active) {
        setSavedIds(saved.map(item => item.id));
        setArchive(previous => [...new Map([...previous, ...hydrated].map(item => [item.id, item])).values()]);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const current = !profile?.isElectric && selected?.dependencyKey === key && selected.carId === carId ? selected.data : null;
  // Loading/failed capture hydration never exposes the legacy instantaneous peak.
  const [analyzed, setAnalyzed] = useState<{ selection: EngineObservation; value: EngineCalculationSummary } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    if (!current || !selected?.capture) return;
    const run = async () => {
      try {
        const response = await backendFetch('/api/tuning/engine-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ observationId: selected.id, carId, capture: selected.capture, expected: current }) });
        if (!response.ok) throw new Error('Engine analysis unavailable');
        const value = await response.json() as EngineCalculationSummary;
        if (!stopped) setAnalyzed({ selection: selected, value });
      } catch { if (!stopped) retry = setTimeout(run, 2000); }
    };
    void run();
    return () => { stopped = true; controller.abort(); clearTimeout(retry); };
  }, [current, selected, carId]);
  const calculation = current && analyzed?.selection === selected ? analyzed.value : null;
  const compatible = archive.filter(item => !profile?.isElectric && item.carId === carId && item.dependencyKey === key && savedIds.includes(item.id));
  const complete = async (data: TuningMeasurementState, capture: TuningCaptureFile) => {
    if (profile?.isElectric || saving.current !== null) return false;
    const requestId = ++saveSequence.current;
    saving.current = requestId;
    setPendingSave(true);
    const saveToken = currentSaveToken();
    const signature = JSON.stringify([key, data, capture.samples.length, capture.samples[capture.samples.length - 1]?.timestampMS]);
    if (pending.current?.signature !== signature) {
      const item: EngineObservation = { schema: 'engine-observation/v1', id: crypto.randomUUID(), carId,
      capturedAt: Date.now(), dependencyKey: key, source: 'measured', data: JSON.parse(JSON.stringify(data)) };
      pending.current = { signature, item, capture: { ...capture,
        references: { engineObservationId: item.id, dependencyKey: key } } };
    }
    const { item, capture: savedCapture } = pending.current;
    try {
      const response = await backendFetch('/api/road/engine-observations', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ observation: item, capture: savedCapture }) });
      if (!response.ok) throw new Error();
    } catch {
      if (saving.current === requestId) {
        saving.current = null;
        setPendingSave(false);
      }
      if (isCurrentEngineObservationSaveToken(saveToken, currentSaveToken())) {
        setStorageError(true);
      }
      return false;
    }
    if (saving.current === requestId) {
      saving.current = null;
      setPendingSave(false);
    }
    // The backend save may complete after invalidate/reuse on the same key.
    // It is already durable server-side, but must not overwrite the newer UI selection.
    if (!isCurrentEngineObservationSaveToken(saveToken, currentSaveToken())) return true;
    const next = [...new Map([...archive, item].map(entry => [entry.id, entry])).values()];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* SQLite remains authoritative. */ }
    setStorageError(false);
    setArchive(next); setSelected({ ...item, capture: JSON.parse(JSON.stringify(savedCapture)) });
    setSavedIds(previous => [...previous, item.id]);
    return true;
  };
  return { key, current, calculation, observation: current ? selected : null, complete, invalidate: () => {
    generation.current += 1;
    pending.current = null;
    saving.current = null;
    setPendingSave(false);
    setSelected(null);
  }, storageError, pendingSave,
    compatible, archive: archive.filter(item => item.carId === carId),
    reuse: async (id: string) => {
      const item = compatible.find(entry => entry.id === id);
      if (!item) return;
      generation.current += 1;
      const reuseToken = currentSaveToken();
      setSelected(item);
      try {
        const response = await backendFetch('/api/road/engine-observations/' + encodeURIComponent(id) + '/capture');
        const value = response.ok ? validateEngineCapture(await response.json(), item.id, item.carId, item.dependencyKey) : null;
        if (!isCurrentEngineObservationSaveToken(reuseToken, currentSaveToken())) return;
        if (value) setSelected({ ...item, capture: value });
      } catch { /* History remains readable; calculation requires the capture or a new sweep. */ }
    },
  };
}
