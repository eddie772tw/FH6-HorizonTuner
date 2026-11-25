import { useLayoutEffect, useRef, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useAutoTuneRun } from './useAutoTuneRun';
import { tuningRows } from './tuningRows';

function duration(ms: number, precise = false) {
  const seconds = Math.floor(ms / 1000);
  const clock = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  return precise ? clock + '.' + String(Math.floor(ms % 1000)).padStart(3, '0') : clock;
}

const statusLabels = { running: 'Running', stopping: 'Stopping', stopped: 'Stopped', completed: 'Completed', failed: 'Failed' };

export default function AutoTuneWorkspace() {
  const { t } = useSettings();
  const { run, image, error, pending, start, stop } = useAutoTuneRun();
  const [goal, setGoal] = useState('Road');
  const [season, setSeason] = useState('Winter');
  const rows = tuningRows(run?.observed ?? {}, run?.recommended ?? {}, t);
  const disabled = pending || !!run?.active;
  const displayedTarget = run && !run.active && run.goal && run.season && (run.goal !== goal || run.season !== season)
    ? [t(run.goal === 'Road' ? 'Road / Circuit' : run.goal), t(run.season)] : [];
  const log = useRef<HTMLOListElement>(null);
  const followLog = useRef(true);
  useLayoutEffect(() => { followLog.current = true; }, [run?.runId]);
  useLayoutEffect(() => {
    if (followLog.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [run?.runId, run?.logs.length]);
  return <article className="overflow-auto p-2">
    <header className="d-flex flex-wrap align-items-end gap-3 mb-3">
      <h2 className="h4 me-auto mb-1">{t('Automated tuning')}</h2>
      <label>{t('Tuning goal')}<select className="form-select form-select-sm" value={run?.active && run.goal ? run.goal : goal} disabled={disabled} onChange={e => setGoal(e.target.value)}>
        {['Road', 'Rally', 'Drag'].map(g => <option key={g} value={g}>{t(g === 'Road' ? 'Road / Circuit' : g)}</option>)}
        <option disabled value="Drift">{t('Drift · manual targets required')}</option>
      </select></label>
      <label>{t('Season')}<select className="form-select form-select-sm" value={run?.active && run.season ? run.season : season} disabled={disabled} onChange={e => setSeason(e.target.value)}>
        {['Spring', 'Summer', 'Autumn', 'Winter'].map(s => <option key={s} value={s}>{t(s)}</option>)}
      </select></label>
      {run?.active ? <button type="button" className="btn btn-outline-secondary" disabled={pending || run.status === 'stopping'} onClick={() => void stop()}>{t('Stop')}</button>
        : <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void start(goal, season)}>{t('Start')}</button>}
    </header>
    <p className="mb-3"><span role="status">{run
      ? [run.step ? 'Step ' + run.step : '', t(statusLabels[run.status]), ...displayedTarget].filter(Boolean).join(' · ')
      : t('Select the target vehicle in the FH6 festival garage before starting.')}</span>
      {run && <time className="ms-2 font-monospace" dateTime={'PT' + (run.elapsedMs / 1000) + 'S'}>{duration(run.elapsedMs, !run.active)}</time>}
    </p>
    {error && <p role="alert" className="text-danger">{t(error)}</p>}
    <div className="row g-3">
      <section className="col-12 col-lg-6">
        <div className="glass-panel p-3">
          <h3 className="h6 workspace-panel-header">{t('Tuning values')}</h3>
          <table className="table table-sm align-middle mb-0"><thead><tr><th scope="col">{t('Parameter')}</th><th scope="col">{t('Observed')}</th><th scope="col">{t('Recommended')}</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.key}><th scope="row" className="fw-normal text-break">{row.label}</th><td>{row.observed}</td><td>{row.recommended}</td></tr>)}</tbody></table>
        </div>
      </section>
      <div className="col-12 col-lg-6 d-flex flex-column gap-3">
        <section className="glass-panel p-3"><h3 className="h6 workspace-panel-header">{t('Latest game screenshot')}</h3>
          {image ? <img src={image} className="img-fluid" alt={t('Latest game screenshot')} /> : <p className="mb-0 text-body-secondary">{t('Waiting for game capture')}</p>}
        </section>
        <section className="glass-panel p-3"><h3 className="h6 workspace-panel-header">{t('Action history')}</h3>
          <ol ref={log} role="log" aria-label={t('Action history')} aria-live="polite" aria-relevant="additions"
            onScroll={event => {
              const list = event.currentTarget;
              followLog.current = list.scrollHeight - list.clientHeight - list.scrollTop < 24;
            }} className="list-unstyled mb-0 overflow-auto" style={{ maxHeight: '20rem' }}>
            {run?.logs.map((log, index) => <li key={index} className="d-flex gap-2 py-1 border-bottom"><span className="font-monospace text-body-secondary">{duration(log.elapsedMs)}</span><span className="text-break">{t(log.message)}</span></li>)}
          </ol>
        </section>
      </div>
    </div>
  </article>;
}
