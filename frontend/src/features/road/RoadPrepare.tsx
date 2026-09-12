import React, { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useCarParams } from '../../context/CarParamsContext';
import type { RoadLive, RoadWorkflow } from './roadTypes';

interface Props { live: RoadLive | null; busy: boolean; onCreate: (body: unknown) => Promise<RoadWorkflow | null>; onCreated: (id: string) => void }
export function RoadPrepare({ live, busy, onCreate, onCreated }: Props) {
  const { t } = useSettings();
  const { carId, carName } = useCarParams();
  const [name, setName] = useState('');
  const [format, setFormat] = useState('circuit');
  const [conditions, setConditions] = useState('');
  const [assists, setAssists] = useState('');
  const [configuration, setConfiguration] = useState('');
  const [gameBuild, setGameBuild] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!live?.fresh || !live.identity) return;
    const work = await onCreate({ identity: live.identity, carName: String(live.identity.ordinal) === carId && carName ? carName : 'Car #' + live.identity.ordinal,
      configuration: configuration.trim() || 'unknown', gameBuild: gameBuild.trim() || 'unknown', event: { name: name.trim(), format,
        conditions: conditions.trim() || 'unknown', driverAssists: assists.trim() || 'unknown' } });
    if (work) onCreated(work.id);
  };
  return <section className="glass-panel p-4">
    <h2 className="h5">{t('Improve the current Road setup')}</h2>
    <p>{t('Save the current calculated setup and measured engine inputs as baseline A. Confirm the event and apply the listed values in game before recording.')}</p>
    <form onSubmit={submit} className="d-flex flex-column gap-3">
      <div>{t('Measured car')}: {live?.identity ? '#' + live.identity.ordinal + ' · PI ' + live.identity.performanceIndex : t('Unknown')}
        <span className="badge text-bg-secondary ms-2">{t(live?.fresh ? 'Live telemetry' : 'Waiting for progressing telemetry')}</span></div>
      <div className="row g-3">
        <label className="col-md-8">{t('Road event name')}<input className="form-control mt-1" value={name} onChange={e => setName(e.target.value)} required maxLength={160} /></label>
        <label className="col-md-4">{t('Event format')}<select className="form-select mt-1" value={format} onChange={e => setFormat(e.target.value)}><option value="circuit">{t('Circuit')}</option><option value="sprint">{t('Sprint')}</option></select></label>
      </div>
      <details><summary>{t('Conditions and configuration notes (optional)')}</summary>
        <p className="small text-body-secondary">{t('Telemetry cannot identify weather, installed tires or driver assists. Unknown notes stay unknown.')}</p>
        <div className="row g-3">
          <label className="col-md-4">{t('Configuration note')}<input className="form-control" maxLength={160} value={configuration} onChange={e => setConfiguration(e.target.value)} /></label>
          <label className="col-md-4">{t('Game build')}<input className="form-control" maxLength={160} value={gameBuild} onChange={e => setGameBuild(e.target.value)} /></label>
          <label className="col-md-4">{t('Event conditions')}<input className="form-control" maxLength={160} value={conditions} onChange={e => setConditions(e.target.value)} /></label>
          <label className="col-md-4">{t('Driver and assists')}<input className="form-control" maxLength={160} value={assists} onChange={e => setAssists(e.target.value)} /></label>
        </div>
      </details>
      <div className="d-flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy || !live?.fresh || !name.trim()}>{t('Create baseline A')}</button>
      </div>
    </form>
  </section>;
}
