import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { roadExplorationStep } from '../../utils/tuningMath';
import type { OffroadRun, OffroadSetup } from './offroadTypes';

interface Props {
  run: OffroadRun;
  setup: OffroadSetup;
  busy: boolean;
  createCandidate: (body: unknown) => Promise<unknown>;
}

export function OffroadCandidate({ run, setup, busy, createCandidate }: Props) {
  const { t } = useSettings();
  const fields = Object.entries(setup.fields);
  const [param, setParam] = useState(fields[0]?.[0] || 'height.front');
  const activeSetting = setup.fields[param] || { value: 20.0, unit: 'cm', minimum: 10.0, maximum: 30.0, step: 0.5 };
  const [candVal, setCandVal] = useState<number>(activeSetting.value + activeSetting.step);
  const [hypothesis, setHypothesis] = useState('Adjust parameter to reduce severe suspension bottoming on rough terrain.');

  const handleStep = (dir: -1 | 1) => {
    const next = roadExplorationStep(activeSetting, dir);
    if (next !== null) setCandVal(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void createCandidate({
      baselineRunId: run.id, parameter: param, baseline: { ...activeSetting, source: 'game-confirmed' },
      candidateValue: candVal, baselineValueUnchanged: true, hypothesis, source: 'user-specified',
    });
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Create Candidate B (Single-Variable Iteration)')}</h2>
      <form onSubmit={handleSubmit}>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">{t('Parameter to Modify')}</label>
            <select className="form-select" value={param} onChange={e => { setParam(e.target.value); const s = setup.fields[e.target.value]; if (s) setCandVal(s.value + s.step); }}>
              {fields.map(([k, s]) => <option key={k} value={k}>{t(k)} ({s.value} {s.unit})</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">{t('Candidate Value')} ({activeSetting.unit})</label>
            <div className="input-group">
              <button type="button" className="btn btn-outline-secondary" onClick={() => handleStep(-1)}>-1 Step</button>
              <input type="number" step={activeSetting.step} className="form-control text-center" value={candVal} onChange={e => setCandVal(parseFloat(e.target.value) || 0)} />
              <button type="button" className="btn btn-outline-secondary" onClick={() => handleStep(1)}>+1 Step</button>
            </div>
          </div>
          <div className="col-12">
            <label className="form-label">{t('Tuning Hypothesis')}</label>
            <input className="form-control" value={hypothesis} onChange={e => setHypothesis(e.target.value)} required />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || candVal === activeSetting.value}>
          {t('Save Candidate B Draft')}
        </button>
      </form>
    </section>
  );
}
