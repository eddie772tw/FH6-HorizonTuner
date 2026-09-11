import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { DragLive, DragWorkflow } from './dragTypes';

interface Props {
  live: DragLive | null;
  busy: boolean;
  createWorkflow: (body: unknown) => Promise<DragWorkflow | null>;
}

export function DragPrepare({ live, busy, createWorkflow }: Props) {
  const { t } = useSettings();
  const [carName, setCarName] = useState('Drag Specialist');
  const [eventName, setEventName] = useState('Festival Drag Strip (1/4 Mile)');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void createWorkflow({
      identity: live?.identity || { ordinal: 42, performanceIndex: 850, drivetrain: 1 },
      carName,
      configuration: 'S2 Drag',
      eventName,
      driverAssists: 'unknown',
    });
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Prepare Drag Tuning Workflow')}</h2>
      <p className="small text-body-secondary mb-3">
        {t('Simplified entry focused on launch grip, gear spacing, and sprint timing.')}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">{t('Car Name')}</label>
            <input className="form-control" value={carName} onChange={e => setCarName(e.target.value)} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">{t('Strip / Event Name')}</label>
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
