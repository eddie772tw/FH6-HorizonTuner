import { useEffect, useMemo, useState } from 'react';
import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { ChassisTuningResult, GearingResult, StaticTireAlignResult } from '../../../utils/tuningMath';
import { RoadWorkflowView } from '../../road/RoadWorkflowView';
import { workflowRecommendation } from '../workflowSnapshot';
import { backendFetch } from '../../../services/backend';
import { downloadCapture } from '../captureDownload';
import type { WorkflowRecommendation } from '../workflowSnapshot';

interface SavedCompatibility { id: string; discipline: string; createdAt: number; recommendation: WorkflowRecommendation }

export function SetupVerificationStep({ goal, carId, profile, chassis, alignment, gearing, inputSnapshot }: {
  goal: string; carId: string; profile: CarParams | null; chassis: ChassisTuningResult | null;
  alignment: StaticTireAlignResult | null; gearing: GearingResult | null; inputSnapshot: Record<string, unknown>;
}) {
  const { t } = useSettings();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
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
  const recommendation = useMemo(() => profile && chassis && alignment && gearing
    ? workflowRecommendation(profile, chassis, alignment, gearing, inputSnapshot) : null, [profile, chassis, alignment, gearing, inputSnapshot]);
  if (!recommendation) return <p>{t('Complete engine measurement before verifying the full setup.')}</p>;
  if (goal === 'Road') return <RoadWorkflowView recommendation={recommendation} carId={carId} />;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await backendFetch('/api/road/compatibility', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discipline: goal, recommendation }) });
      if (!response.ok) throw new Error();
      const saved: SavedCompatibility = await response.json();
      setHistory(previous => [...previous, saved]);
      setStatus('Compatibility snapshot saved.');
    } catch { setStatus('Snapshot could not be saved. Try again.'); }
    finally { setBusy(false); }
  };
  return <section className="glass-panel p-4"><h3 className="h5">{t('Setup verification')} · {goal}</h3>
    <p>{t('Compatibility mode: existing formulas are preserved. Native run comparison is currently available for Road.')}</p>
    <div className="table-responsive"><table className="table table-sm"><tbody>{Object.entries(recommendation.fields).map(([key, field]) =>
      <tr key={key}><th>{t(key)}</th><td>{field.value} {field.unit}</td><td>{t('Estimate')}</td></tr>)}</tbody></table></div>
    <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{t('Save compatibility snapshot')}</button>
    <div role="status" className="small mt-2">{t(status)}</div>
    <details className="mt-3"><summary>{t('Saved compatibility snapshots')}</summary>
      {history.filter(item => item.discipline === goal && item.recommendation.inputSnapshot.carId === carId).map(item =>
        <div key={item.id} className="my-2"><span>{new Date(item.createdAt * 1000).toLocaleString()} · {item.discipline}</span>
          <button className="btn btn-sm btn-outline-secondary ms-2" onClick={() => downloadCapture(item, 'compatibility-setup.json')}>{t('Export setup')}</button>
          <details><summary>{t('Observation data')}</summary><pre className="small overflow-auto" style={{ maxHeight: 260 }}>{JSON.stringify(item, null, 2)}</pre></details>
        </div>)}
    </details>
  </section>;
}
