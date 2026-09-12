import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { RoadLive, RoadSetup, RoadWorkflow } from './roadTypes';

interface Props { readOnly?: boolean; workflow: RoadWorkflow; setups: RoadSetup[]; selectedSetupId: string; selectSetup: (id: string) => void; live: RoadLive | null; busy: boolean; start: (body: unknown) => Promise<unknown>; stop: () => Promise<unknown>; currentInputSnapshot: Record<string, unknown> }
export function RoadRunPanel({ readOnly, workflow, setups, selectedSetupId, selectSetup, live, busy, start, stop, currentInputSnapshot }: Props) {
  const { t } = useSettings();
  const [confirmed, setConfirmed] = useState(false), [unchanged, setUnchanged] = useState(false);
  const selected = setups.find(s => s.id === selectedSetupId);
  const active = live?.activeRun;
  const snapshotKey = JSON.stringify(currentInputSnapshot);
  const inputsMatch = !workflow.recommendation || JSON.stringify(workflow.recommendation.inputSnapshot) === snapshotKey;
  useEffect(() => { setConfirmed(false); setUnchanged(false); }, [selectedSetupId, active?.id, snapshotKey]);
  const match = inputsMatch && live?.fresh && live.identity?.ordinal === workflow.identity.ordinal && live.identity?.performanceIndex === workflow.identity.performanceIndex && live.identity?.drivetrain === workflow.identity.drivetrain;
  const begin = async () => {
    if (!confirmed || !selected) return;
    const condition = unchanged ? 'unchanged' : 'unknown';
    const result = await start({ setupId: selected.id, settingsConfirmed: true, otherSettings: condition, tires: condition, conditions: condition, driverAssists: condition });
    if (result) setConfirmed(false);
  };
  return <section className="glass-panel p-4">
    <div className="d-flex flex-wrap justify-content-between gap-2 mb-2"><h2 className="h5">{t('Drive one Road event')}</h2><span className="badge text-bg-secondary" role="status">{t(live?.state || 'Unknown')}</span></div>
    <p>{workflow.event.name} · {t(workflow.event.format === 'circuit' ? 'Circuit' : 'Sprint')} · {workflow.carName} · PI {workflow.identity.performanceIndex}</p>
    {active ? <>
      <p>{t(active.workflowId === workflow.id ? 'This Road run is being saved automatically.' : 'A different Road workflow is recording.')} {live?.sampleCount} {t('samples')}</p>
      <p className="text-body-secondary">{t('Drive the selected event. A partial run can be saved; completion is never inferred from elapsed samples.')}</p>
      <button className="btn btn-primary" disabled={busy} onClick={() => void stop()}>{t('Stop and save observations')}</button>
    </> : <>
      <label className="form-label w-100">{t('Setting to test')}<select className="form-select mt-1" value={selectedSetupId} onChange={e => selectSetup(e.target.value)}>
        {setups.map((s, i) => <option key={s.id} value={s.id}>{s.label} · {i + 1} · {t(s.confirmationScope)}</option>)}
      </select></label>
      {selected && Object.keys(selected.fields).length > 0 && <div className="table-responsive"><table className="table table-sm"><thead><tr><th>{t('Parameter')}</th><th>{t('Apply in game')}</th><th>{t('Source')}</th></tr></thead><tbody>
        {Object.entries(selected.fields).map(([key, field]) => <tr key={key}><td>{t(key)}</td><td>{field.value} {field.unit}</td><td>{t(field.source)}</td></tr>)}
      </tbody></table></div>}
      <label className="d-flex gap-2 my-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('I have confirmed the current car and applied the listed game values. Unlisted values remain unknown.')}</label>
      <label className="d-flex gap-2 my-3"><input type="checkbox" checked={unchanged} onChange={e => setUnchanged(e.target.checked)} />{t('Other settings, tires, event conditions and driver assists are unchanged for this comparison.')}</label>
      <p className="small text-body-secondary">{t('Start recording before starting the event. All laps stay in this run. After recording, return here to review the saved result.')}</p>
      {!inputsMatch && <p>{t('Vehicle inputs changed. Create a new baseline and confirm the game settings again.')}</p>}
      <button className="btn btn-primary" disabled={readOnly || busy || !confirmed || !selected || !match} onClick={() => void begin()}>{t('Start Road recording')}</button>
      {!match && <span className="small ms-3">{t('Connect fresh telemetry from this car to begin a new run. Saved results remain available.')}</span>}
    </>}
  </section>;
}
