import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { DragRun, DragSetup } from './dragTypes';

interface Props {
  run: DragRun;
  setup: DragSetup;
  busy: boolean;
  createCandidate: (body: unknown) => Promise<unknown>;
}

export function DragCandidate({ run, setup, busy, createCandidate }: Props) {
  const { t } = useSettings();
  const [param, setParam] = useState('pressure.rear');
  const [baseVal, setBaseVal] = useState('28.0');
  const [candVal, setCandVal] = useState('27.5');
  const [hypothesis, setHypothesis] = useState('Lower rear pressure to increase launch traction');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void createCandidate({
      baselineRunId: run.id,
      parameter: param,
      baseline: {
        value: parseFloat(baseVal),
        unit: 'psi',
        minimum: 15.0,
        maximum: 45.0,
        step: 0.5,
        source: 'game-confirmed',
      },
      candidateValue: parseFloat(candVal),
      baselineValueUnchanged: true,
      hypothesis,
      source: 'one-game-step-exploration',
    });
  };

  if (setup.baselineSetupId) {
    return null;
  }

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Prepare One Single-Step Candidate (B)')}</h2>
      <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">{t('Target Parameter')}</label>
            <select className="form-select" value={param} onChange={e => setParam(e.target.value)}>
              <option value="pressure.rear">{t('Rear Tire Pressure (PSI)')}</option>
              <option value="pressure.front">{t('Front Tire Pressure (PSI)')}</option>
              <option value="gearing.finalDrive">{t('Final Drive Ratio')}</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">{t('Baseline Value (A)')}</label>
            <input type="number" step="0.1" className="form-control" value={baseVal} onChange={e => setBaseVal(e.target.value)} required />
          </div>
          <div className="col-md-4">
            <label className="form-label">{t('Candidate Value (B)')}</label>
            <input type="number" step="0.1" className="form-control" value={candVal} onChange={e => setCandVal(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="form-label">{t('Hypothesis')}</label>
          <input className="form-control" value={hypothesis} onChange={e => setHypothesis(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-outline-primary" disabled={busy}>
          {t('Save Candidate B & Test')}
        </button>
      </form>
    </section>
  );
}
