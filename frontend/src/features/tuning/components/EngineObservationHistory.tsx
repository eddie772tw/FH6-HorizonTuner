import { useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { EngineObservation } from '../engineMeasurementArchive';

export function EngineObservationHistory({ entries, compatibleIds, reuse, storageError }: {
  entries: EngineObservation[]; compatibleIds: string[]; reuse: (id: string) => void; storageError: boolean;
}) {
  const { t } = useSettings();
  const [confirmed, setConfirmed] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const selected = entries.find(e => e.id === selectedId) || entries[entries.length - 1];
  if (!entries.length) return null;
  return <details className="glass-panel p-3 mb-3"><summary>{t('Saved engine observations')} · {entries.length}</summary>
    <p className="small mt-2">{t('Suspension and tire edits preserve engine observations. Reuse requires confirmation that the powertrain configuration is unchanged.')}</p>
    {storageError && <p role="status">{t('The engine observation is available in this page but could not be saved to device storage.')}</p>}
    <select className="form-select" value={selected?.id} onChange={e => { setSelectedId(e.target.value); setConfirmed(false); }}>
      {entries.map(e => <option key={e.id} value={e.id}>{new Date(e.capturedAt).toLocaleString()} · {Math.round(e.data.engineMaxRpm || 0)} RPM · {t(compatibleIds.includes(e.id) ? 'Inputs compatible' : 'Review only')}</option>)}
    </select>
    <label className="d-flex gap-2 my-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('The engine, drivetrain and installed powertrain parts are unchanged, including same-PI changes.')}</label>
    <button className="btn btn-outline-primary" disabled={!confirmed || !selected || !compatibleIds.includes(selected.id)} onClick={() => { if (selected) reuse(selected.id); setConfirmed(false); }}>{t('Reuse the confirmed engine observation')}</button>
    <details className="mt-2"><summary>{t('Observation data')}</summary><pre className="small overflow-auto" style={{ maxHeight: 260 }}>{JSON.stringify(selected, null, 2)}</pre></details>
  </details>;
}
