import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { DriftLive, DriftWorkflow } from './driftTypes';

interface Props {
  live: DriftLive | null;
  busy: boolean;
  createWorkflow: (body: unknown) => Promise<DriftWorkflow | null>;
}

export function DriftPrepare({ live, busy, createWorkflow }: Props) {
  const { t } = useSettings();
  const [carName, setCarName] = useState('Formula Drift Car');
  const [format, setFormat] = useState<'zone' | 'drift-course'>('zone');
  const [name, setName] = useState('Volcan Drift Zone');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void createWorkflow({
      identity: live?.identity || { ordinal: 42, performanceIndex: 750, drivetrain: 0 },
      carName,
      configuration: 'A800 Drift',
      event: { name, format, driverAssists: 'unknown', conditions: 'unknown' },
    });
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Prepare Drift Tuning Workflow')}</h2>
      <p className="small text-body-secondary mb-3">
        {t('Structured alignment with the iterative tuning loop. Reports objective kinematic observations with explicit limitations.')}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">{t('Car Name')}</label>
            <input className="form-control" value={carName} onChange={e => setCarName(e.target.value)} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">{t('Format')}</label>
            <div className="btn-group w-100" role="group">
              <button type="button" className={`btn ${format === 'zone' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFormat('zone')}>
                {t('Drift Zone')}
              </button>
              <button type="button" className={`btn ${format === 'drift-course' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFormat('drift-course')}>
                {t('Drift Course')}
              </button>
            </div>
          </div>
          <div className="col-12">
            <label className="form-label">{t('Zone / Track Name')}</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)} required />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t('Create Baseline A')}
        </button>
      </form>
    </section>
  );
}
