import { useEffect, useRef, useState } from 'react';
import type { TuningCarParams } from '../../utils/tuningMath';
import type { TuningMeasurementState } from './tuningMeasurement';
import { engineDependencyKey, parseEngineArchive, type EngineObservation } from './engineMeasurementArchive';
import type { TuningCaptureFile } from '../../domain/tuning/telemetryCapture';
import { backendFetch } from '../../services/backend';
import { validateEngineCapture } from './engineCaptureReadback';

const STORAGE_KEY = 'tuning-engine-observations/v1';
const readArchive = () => { try { return parseEngineArchive(localStorage.getItem(STORAGE_KEY)); } catch { return []; } };
export function useEngineMeasurementArchive(carId: string, profile: TuningCarParams | null, identityGeneration = 0) {
  const [archive, setArchive] = useState<EngineObservation[]>(readArchive);
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
  useEffect(() => {
    keyRef.current = key;
    generation.current += 1;
    pending.current = null;
    saving.current = null;
    setPendingSave(false);
    setSelected(null);
  }, [key, identityGeneration]);
  useEffect(() => {
    let active = true;
    void backendFetch('/api/road/engine-observations').then(async response => {
      if (!response.ok) return;
      const saved = parseEngineArchive(JSON.stringify(await response.json()));
      const hydrated = saved;
      if (active) {
        setSavedIds(hydrated.map(item => item.id));
        setArchive(previous => [...new Map([...previous, ...hydrated].map(item => [item.id, item])).values()]);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const current = selected?.dependencyKey === key && selected.carId === carId ? selected.data : null;
  const compatible = archive.filter(item => item.carId === carId && item.dependencyKey === key && savedIds.includes(item.id));
  const complete = async (data: TuningMeasurementState, capture: TuningCaptureFile) => {
    if (saving.current !== null) return;
    const requestId = ++saveSequence.current;
    saving.current = requestId;
    setPendingSave(true);
    const saveGeneration = generation.current;
    const saveIdentityGeneration = identityGenerationRef.current;
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
      if (saveGeneration === generation.current && keyRef.current === key && saveIdentityGeneration === identityGenerationRef.current) {
        setStorageError(true);
      }
      return;
    }
    if (saving.current === requestId) {
      saving.current = null;
      setPendingSave(false);
    }
    // The backend save may complete after invalidate/reuse on the same key.
    // It is already durable server-side, but must not overwrite the newer UI selection.
    if (saveGeneration !== generation.current || keyRef.current !== key || saveIdentityGeneration !== identityGenerationRef.current) return;
    const next = [...new Map([...readArchive(), ...archive, item].map(entry => [entry.id, entry])).values()];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* SQLite remains authoritative. */ }
    setStorageError(false);
    setArchive(next); setSelected({ ...item, capture: JSON.parse(JSON.stringify(savedCapture)) });
    setSavedIds(previous => [...previous, item.id]);
  };
  return { key, current, observation: current ? selected : null, complete, invalidate: () => {
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
      const token = ++generation.current;
      const reuseIdentityGeneration = identityGenerationRef.current;
      setSelected(item);
      try {
        const response = await backendFetch('/api/road/engine-observations/' + encodeURIComponent(id) + '/capture');
        const value = response.ok ? validateEngineCapture(await response.json(), item.id, item.carId, item.dependencyKey) : null;
        if (token !== generation.current || keyRef.current !== key || reuseIdentityGeneration !== identityGenerationRef.current) return;
        if (value) setSelected({ ...item, capture: value });
      } catch { /* Engine summary remains reusable; tire evidence is unavailable. */ }
    },
  };
}
