import { useEffect, useRef, useState } from 'react';
import type { TuningCarParams } from '../../utils/tuningMath';
import type { TuningMeasurementState } from './tuningMeasurement';
import { engineDependencyKey, parseEngineArchive, type EngineObservation } from './engineMeasurementArchive';
import type { TuningCaptureFile } from '../../domain/tuning/telemetryCapture';
import { backendFetch } from '../../services/backend';

const STORAGE_KEY = 'tuning-engine-observations/v1';
const readArchive = () => { try { return parseEngineArchive(localStorage.getItem(STORAGE_KEY)); } catch { return []; } };
export function useEngineMeasurementArchive(carId: string, profile: TuningCarParams | null) {
  const [archive, setArchive] = useState<EngineObservation[]>(readArchive);
  const [selected, setSelected] = useState<EngineObservation | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [storageError, setStorageError] = useState(false);
  const saving = useRef(false);
  const pending = useRef<{ signature: string; item: EngineObservation; capture: TuningCaptureFile } | null>(null);
  const key = engineDependencyKey(carId, profile);
  useEffect(() => { setSelected(null); }, [key]);
  useEffect(() => {
    let active = true;
    void backendFetch('/api/road/engine-observations').then(async response => {
      if (!response.ok) return;
      const saved = parseEngineArchive(JSON.stringify(await response.json()));
      if (active) {
        setSavedIds(saved.map(item => item.id));
        setArchive(previous => [...new Map([...previous, ...saved].map(item => [item.id, item])).values()]);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const current = selected?.dependencyKey === key && selected.carId === carId ? selected.data : null;
  const compatible = archive.filter(item => item.carId === carId && item.dependencyKey === key && savedIds.includes(item.id));
  const complete = async (data: TuningMeasurementState, capture: TuningCaptureFile) => {
    if (saving.current) return;
    saving.current = true;
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
    } catch { setStorageError(true); saving.current = false; return; }
    saving.current = false;
    const next = [...new Map([...readArchive(), ...archive, item].map(entry => [entry.id, entry])).values()];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* SQLite remains authoritative. */ }
    setStorageError(false);
    setArchive(next); setSelected(item);
    setSavedIds(previous => [...previous, item.id]);
  };
  return { key, current, observation: current ? selected : null, complete, invalidate: () => setSelected(null), storageError,
    compatible, archive: archive.filter(item => item.carId === carId),
    reuse: (id: string) => { const item = compatible.find(entry => entry.id === id); if (item) setSelected(item); } };
}
