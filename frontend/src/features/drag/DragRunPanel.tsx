import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { DragLive, DragSetup, DragWorkflow } from './dragTypes';

interface Props {
  workflow: DragWorkflow;
  setup: DragSetup;
  live: DragLive | null;
  busy: boolean;
  startRun: (body: unknown) => Promise<unknown>;
  stopRun: () => Promise<unknown>;
}

export function DragRunPanel({ workflow, setup, live, busy, startRun, stopRun }: Props) {
  const { t } = useSettings();
  const [confirmed, setConfirmed] = useState(false);
  const active = Boolean(live?.activeRun);
  const matched = Boolean(live?.fresh && live.identity?.ordinal === workflow.identity.ordinal);

  const handleStart = () => {
    void startRun({
      setupId: setup.id,
      settingsConfirmed: true,
      otherSettings: 'unchanged',
      tires: 'unchanged',
      driverAssists: 'unchanged',
    });
  };

  return (
    <section className="glass-panel p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">{t('Live Drag Run Recording')} ({setup.label})</h2>
        <span className={`badge ${matched ? 'text-bg-success' : 'text-bg-warning'}`}>
          {matched ? t('Telemetry Synced') : t('Awaiting Telemetry')}
        </span>
      </div>
      <p className="small text-body-secondary mb-3">
        {t('Car')}: {workflow.carName} · {t('Strip')}: {workflow.eventName} · {t('Samples')}: {live?.sampleCount ?? 0}
      </p>
      {!active ? (
        <div>
          <label className="d-flex align-items-center gap-2 mb-3">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            <span className="small">{t('I confirm drag setup values are applied in game and strip is ready.')}</span>
          </label>
          <button className="btn btn-primary" disabled={busy || !confirmed || !matched} onClick={handleStart}>
            {t('Start Recording Drag Run')}
          </button>
        </div>
      ) : (
        <div className="d-flex align-items-center gap-3">
          <span className="badge text-bg-danger">{t('Recording Drag Pass')}</span>
          <button className="btn btn-outline-danger" disabled={busy} onClick={() => void stopRun()}>
            {t('Stop & Save Run')}
          </button>
        </div>
      )}
    </section>
  );
}
