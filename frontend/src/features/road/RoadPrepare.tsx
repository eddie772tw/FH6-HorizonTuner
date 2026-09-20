import React from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useCarParams } from '../../context/CarParamsContext';
import type { RoadLive, RoadWorkflow } from './roadTypes';
import type { RoadPrepareDraft } from './RoadValidationController';

interface Props {
  live: RoadLive | null;
  busy: boolean;
  draft: RoadPrepareDraft;
  onDraftChange: (draft: RoadPrepareDraft) => void;
  onCreate: (body: unknown) => Promise<RoadWorkflow | null>;
  onCreated: (id: string) => void;
}
export function RoadPrepare({ live, busy, draft, onDraftChange, onCreate, onCreated }: Props) {
  const { t } = useSettings();
  const { carId, carName } = useCarParams();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!live?.fresh || !live.identity) return;
    const work = await onCreate({ identity: live.identity, carName: String(live.identity.ordinal) === carId && carName ? carName : 'Car #' + live.identity.ordinal,
      configuration: draft.configuration.trim() || 'unknown', gameBuild: draft.gameBuild.trim() || 'unknown', event: { name: draft.name.trim(), format: draft.format,
        conditions: draft.conditions.trim() || 'unknown', driverAssists: draft.assists.trim() || 'unknown' } });
    if (work) onCreated(work.id);
  };
  return <section className="glass-panel p-4">
    <h2 className="h5">{t('Improve the current Road setup')}</h2>
    <p>{t('Save the current calculated setup and measured engine inputs as baseline A. Confirm the event and apply the listed values in game before recording.')}</p>
    <form onSubmit={submit} className="d-flex flex-column gap-3">
      <div>{t('Measured car')}: {live?.identity ? '#' + live.identity.ordinal + ' · PI ' + live.identity.performanceIndex : t('Unknown')}
        <span className="badge text-bg-secondary ms-2">{t(live?.fresh ? 'Live telemetry' : 'Waiting for progressing telemetry')}</span></div>
      <div className="row g-3">
        <label className="col-md-8">{t('Road event name')}<input className="form-control mt-1" value={draft.name} onChange={e => onDraftChange({ ...draft, name: e.target.value })} required maxLength={160} /></label>
        <label className="col-md-4">{t('Event format')}<select className="form-select mt-1" value={draft.format} onChange={e => onDraftChange({ ...draft, format: e.target.value as RoadPrepareDraft['format'] })}><option value="circuit">{t('Circuit')}</option><option value="sprint">{t('Sprint')}</option></select></label>
      </div>
      <details><summary>{t('Conditions and configuration notes (optional)')}</summary>
        <p className="small text-body-secondary">{t('Telemetry cannot identify weather, installed tires or driver assists. Unknown notes stay unknown.')}</p>
        <div className="row g-3">
          <label className="col-md-4">{t('Configuration note')}<input className="form-control" maxLength={160} value={draft.configuration} onChange={e => onDraftChange({ ...draft, configuration: e.target.value })} /></label>
          <label className="col-md-4">{t('Game build')}<input className="form-control" maxLength={160} value={draft.gameBuild} onChange={e => onDraftChange({ ...draft, gameBuild: e.target.value })} /></label>
          <label className="col-md-4">{t('Event conditions')}<input className="form-control" maxLength={160} value={draft.conditions} onChange={e => onDraftChange({ ...draft, conditions: e.target.value })} /></label>
          <label className="col-md-4">{t('Driver and assists')}<input className="form-control" maxLength={160} value={draft.assists} onChange={e => onDraftChange({ ...draft, assists: e.target.value })} /></label>
        </div>
      </details>
      <div className="d-flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy || !live?.fresh || !draft.name.trim()}>{t('Create baseline A')}</button>
      </div>
    </form>
  </section>;
}
