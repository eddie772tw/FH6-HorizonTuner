import { useEffect, useState } from 'react';
import type { TuningCarParams } from '../../utils/tuningMath';
import type { TuningMeasurementState } from './tuningMeasurement';
import { engineDependencyKey, parseEngineArchive, type EngineObservation } from './engineMeasurementArchive';

const STORAGE_KEY = 'tuning-engine-observations/v1';
const readArchive = () => { try { return parseEngineArchive(localStorage.getItem(STORAGE_KEY)); } catch { return []; } };
export function useEngineMeasurementArchive(carId: string, profile: TuningCarParams | null) {
  const [archive, setArchive] = useState<EngineObservation[]>(readArchive);
  const [selected, setSelected] = useState<EngineObservation | null>(null);
  const [storageError, setStorageError] = useState(false);
  const key = engineDependencyKey(carId, profile);
  useEffect(() => { setSelected(null); }, [key]);
  const current = selected?.dependencyKey === key && selected.carId === carId ? selected.data : null;
  const compatible = archive.filter(item => item.carId === carId && item.dependencyKey === key);
  const complete = (data: TuningMeasurementState) => {
    const item: EngineObservation = { schema: 'engine-observation/v1', id: crypto.randomUUID(), carId,
      capturedAt: Date.now(), dependencyKey: key, source: 'measured', data: JSON.parse(JSON.stringify(data)) };
    const next = [...new Map([...readArchive(), ...archive, item].map(entry => [entry.id, entry])).values()];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
    setArchive(next); setSelected(item);
  };
  return { key, current, observation: current ? selected : null, complete, invalidate: () => setSelected(null), storageError,
    compatible, archive: archive.filter(item => item.carId === carId),
    reuse: (id: string) => { const item = compatible.find(entry => entry.id === id); if (item) setSelected(item); } };
}
