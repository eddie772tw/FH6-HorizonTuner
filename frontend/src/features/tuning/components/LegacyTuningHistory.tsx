import { useEffect, useState } from 'react';
import { backendFetch } from '../../../services/backend';
import { useSettings } from '../../../context/SettingsContext';
import { downloadCapture } from '../captureDownload';

/** Legacy files stay readable without promoting unmeasured RPM to current inputs. */
export function LegacyTuningHistory({ carId }: { carId: string }) {
  const { t } = useSettings();
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setNames([]); setSnapshot(null); setSelected('');
    void backendFetch('/api/tunings').then(async response => {
      if (!response.ok) return;
      const entries: unknown = (await response.json()).tunings;
      if (active && Array.isArray(entries)) setNames(entries.filter((name): name is string => typeof name === 'string' && name.startsWith(carId + '-')));
    }).catch(() => {});
    return () => { active = false; };
  }, [carId]);
  useEffect(() => {
    let active = true;
    setSnapshot(null); setError('');
    if (selected) void backendFetch('/api/tunings/' + encodeURIComponent(carId) + '/' + encodeURIComponent(selected.slice(carId.length + 1)))
      .then(async response => { if (!response.ok) throw new Error(); const data: unknown = await response.json(); if (active) setSnapshot(data); })
      .catch(() => { if (active) setError('Saved setup could not be loaded.'); });
    return () => { active = false; };
  }, [carId, selected]);
  if (!names.length) return null;
  return <details className="glass-panel p-3"><summary>{t('Legacy saved setups')}</summary>
    <p>{t('Legacy values remain available for review. Engine inputs must be measured before using the new workflow.')}</p>
    <select className="form-select" aria-label={t('Legacy saved setups')} value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="">{t('Select a saved setup')}</option>{names.map(name => <option key={name}>{name}</option>)}
    </select>
    {error && <p role="status">{t(error)}</p>}
    {snapshot !== null && <><pre className="small overflow-auto mt-2" style={{ maxHeight: 280 }}>{JSON.stringify(snapshot, null, 2)}</pre>
      <button className="btn btn-outline-secondary" onClick={() => downloadCapture(snapshot, 'legacy-setup.json')}>{t('Export setup')}</button></>}
  </details>;
}
