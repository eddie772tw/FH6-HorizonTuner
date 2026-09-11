import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { OffroadRun, OffroadSetup } from './offroadTypes';

interface Props {
  runs: OffroadRun[];
  setups: OffroadSetup[];
  busy: boolean;
  compareRuns: (baseIds: string[], candIds: string[]) => Promise<unknown>;
}

export function OffroadCompare({ runs, setups, busy, compareRuns }: Props) {
  const { t } = useSettings();
  const setupMap = new Map(setups.map(s => [s.id, s]));
  const baselineRuns = runs.filter(r => setupMap.get(r.setupId)?.label === 'A');
  const candidateRuns = runs.filter(r => setupMap.get(r.setupId)?.label === 'B');
  const [baseId, setBaseId] = useState(baselineRuns[0]?.id || '');
  const [candId, setCandId] = useState(candidateRuns[0]?.id || '');

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('A/B Performance Comparison')}</h2>
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <label className="form-label">{t('Baseline A Run')}</label>
          <select className="form-select" value={baseId} onChange={e => setBaseId(e.target.value)}>
            {baselineRuns.map(r => <option key={r.id} value={r.id}>Run {r.id.slice(0, 8)} ({new Date(r.createdAt * 1000).toLocaleTimeString()})</option>)}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label">{t('Candidate B Run')}</label>
          <select className="form-select" value={candId} onChange={e => setCandId(e.target.value)}>
            {candidateRuns.map(r => <option key={r.id} value={r.id}>Run {r.id.slice(0, 8)} ({new Date(r.createdAt * 1000).toLocaleTimeString()})</option>)}
          </select>
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy || !baseId || !candId} onClick={() => void compareRuns([baseId], [candId])}>
        {t('Generate Offroad Comparison Report')}
      </button>
    </section>
  );
}
