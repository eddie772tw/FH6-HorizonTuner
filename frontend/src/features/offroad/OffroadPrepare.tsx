import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { OffroadLive, OffroadWorkflow } from './offroadTypes';

interface Props {
  live: OffroadLive | null;
  busy: boolean;
  createWorkflow: (body: unknown) => Promise<OffroadWorkflow | null>;
}

export function OffroadPrepare({ live, busy, createWorkflow }: Props) {
  const { t } = useSettings();
  const [carName, setCarName] = useState('Offroad Rally Build');
  const [format, setFormat] = useState<'sprint' | 'circuit'>('sprint');
  const [eventName, setEventName] = useState('Barranca Trail');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void createWorkflow({
      identity: live?.identity || { ordinal: 42, performanceIndex: 700, drivetrain: 1 },
      carName,
      configuration: 'S1 Dirt',
      event: { name: eventName, format, driverAssists: 'unknown', conditions: 'unknown' },
    });
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Prepare Offroad / Rally Workflow')}</h2>
      <p className="small text-body-secondary mb-3">
        {t('Fast entry with neutral initial baseline. Season and formula naming are decoupled.')}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">{t('Car Name')}</label>
            <input className="form-control" value={carName} onChange={e => setCarName(e.target.value)} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">{t('Event Format')}</label>
            <div className="btn-group w-100" role="group">
              <button type="button" className={`btn ${format === 'sprint' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFormat('sprint')}>
                {t('Sprint (Point-to-Point)')}
              </button>
              <button type="button" className={`btn ${format === 'circuit' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFormat('circuit')}>
                {t('Circuit (Laps)')}
              </button>
            </div>
          </div>
          <div className="col-12">
            <label className="form-label">{t('Trail / Track Name')}</label>
            <input className="form-control" value={eventName} onChange={e => setEventName(e.target.value)} required />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t('Create Baseline A')}
        </button>
      </form>
    </section>
  );
}
