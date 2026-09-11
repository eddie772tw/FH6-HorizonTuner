import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { DriftRun, DriftSetup } from './driftTypes';

interface Props {
  runs: DriftRun[];
  setups: DriftSetup[];
  busy: boolean;
  compareRuns: (baseIds: string[], candIds: string[]) => Promise<unknown>;
}

export function DriftCompare({ runs, setups, busy, compareRuns }: Props) {
  const { t } = useSettings();
  const [baseId, setBaseId] = useState(() => runs[0]?.id || '');
  const [candId, setCandId] = useState(() => runs[1]?.id || '');

  const handleCompare = () => {
    if (!baseId || !candId || baseId === candId) return;
    void compareRuns([baseId], [candId]);
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('A/B Drift Performance Comparison')}</h2>
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <label className="form-label">{t('Baseline Run (A)')}</label>
          <select className="form-select" value={baseId} onChange={e => setBaseId(e.target.value)}>
            {runs.map((r, i) => {
              const s = setups.find(setup => setup.id === r.setupId);
              return <option key={r.id} value={r.id}>Run #{i + 1} ({s?.label || 'A'})</option>;
            })}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label">{t('Candidate Run (B)')}</label>
          <select className="form-select" value={candId} onChange={e => setCandId(e.target.value)}>
            {runs.map((r, i) => {
              const s = setups.find(setup => setup.id === r.setupId);
              return <option key={r.id} value={r.id}>Run #{i + 1} ({s?.label || 'B'})</option>;
            })}
          </select>
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy || !baseId || !candId || baseId === candId} onClick={handleCompare}>
        {t('Generate A/B Comparison Report')}
      </button>
    </section>
  );
}
