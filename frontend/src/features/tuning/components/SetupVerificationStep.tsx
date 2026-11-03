import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { RoadWorkflowView } from '../../road/RoadWorkflowView';
import { backendFetch } from '../../../services/backend';
import { captureSaveRequest } from '../captureDownload';
import { useFileSave } from '../../../hooks/useFileSave';
import type { WorkflowRecommendation } from '../../../domain/tuning/types';

interface SavedCompatibility { id: string; discipline: string; createdAt: number; recommendation: WorkflowRecommendation }

export function SetupVerificationStep({ goal, carId, recommendation, onBusyChange }: {
  goal: string; carId: string; recommendation: WorkflowRecommendation | null; onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useSettings();
  const { save: exportFile, isSaving } = useFileSave();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusyChange?.(false); }; }, [onBusyChange]);
  const [history, setHistory] = useState<SavedCompatibility[]>([]);
  useEffect(() => {
    let active = true;
    if (goal !== 'Road') void backendFetch('/api/road/compatibility').then(async response => {
      if (!response.ok) throw new Error();
      const saved: SavedCompatibility[] = await response.json();
      if (active) setHistory(saved);
    }).catch(() => { if (active) setStatus('Saved snapshots could not be loaded.'); });
    return () => { active = false; };
  }, [goal, carId]);
  if (!recommendation) return <p>{t('Engine analysis and a feasible gearing result are required before setup verification.')}</p>;
  if (goal === 'Road') return <RoadWorkflowView recommendation={recommendation} carId={carId} onBusyChange={onBusyChange} />;
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setStatus('Saving recommendation snapshot…'); onBusyChange?.(true);
    try {
      const response = await backendFetch('/api/road/compatibility', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discipline: goal, recommendation }) });
      if (!response.ok) throw new Error();
      const saved: SavedCompatibility = await response.json();
      if (mounted.current) { setHistory(previous => [...previous, saved]); setStatus('Compatibility snapshot saved.'); }
    } catch { if (mounted.current) setStatus('Snapshot could not be saved. Try again.'); }
    finally { saving.current = false; if (mounted.current) { setBusy(false); onBusyChange?.(false); } }
  };
  return <section className="workspace-section"><h3 className="workspace-section-heading workspace-panel-header">{t('Setup verification')} · {goal}</h3>
    <div className="table-responsive"><table className="table table-sm"><tbody>{Object.entries(recommendation.fields).map(([key, field]) =>
      <tr key={key}><th>{t(key)}</th><td>{field.value} {field.unit}</td><td>{t('Estimate')}</td></tr>)}</tbody></table></div>
    <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{t(busy ? 'Saving recommendation snapshot…' : 'Save recommendation snapshot')}</button>
    <div role="status" aria-live="polite" className="small mt-2" style={{ minHeight: '3em' }}>{t(status)}<br />{t('Saves this recommendation for review. Apply the values in game yourself.')}</div>
    <details className="mt-3"><summary>{t('Saved compatibility snapshots')}</summary>
      {history.filter(item => item.discipline === goal && item.recommendation.inputSnapshot.carId === carId).map(item =>
        <div key={item.id} className="my-2"><span>{new Date(item.createdAt * 1000).toLocaleString()} · {item.discipline}</span>
          <button className="btn btn-sm btn-outline-secondary ms-2" disabled={isSaving} onClick={() => void exportFile(captureSaveRequest(item, 'compatibility-setup.json'))}>{t('Export setup')}</button>
          <details><summary>{t('Observation data')}</summary><pre className="small overflow-auto" style={{ maxHeight: 260 }}>{JSON.stringify(item, null, 2)}</pre></details>
        </div>)}
    </details>
  </section>;
}
