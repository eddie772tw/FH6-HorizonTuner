import { useId, useRef, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { RatioBalanceDiagnostic, RatioBalanceRequest } from '../ratioBalanceTypes';

interface Props {
  request: RatioBalanceRequest | null;
  diagnostic?: RatioBalanceDiagnostic;
  pending: boolean;
  storageError: boolean;
  gearCount: number;
  onChange: (request: RatioBalanceRequest | null) => void;
}

/** Only edits requests and presents the authoritative backend allocation. */
export function RatioBalancePanel({ request, diagnostic, pending, storageError, gearCount, onChange }: Props) {
  const { t } = useSettings();
  const id = useId();
  const lastDiagnostic = useRef(diagnostic);
  if (diagnostic) lastDiagnostic.current = diagnostic;
  const shown = diagnostic ?? (pending ? lastDiagnostic.current : undefined);
  const legal = shown?.legalFinalDrives ?? [];
  const selected = request?.candidateFinalDrive ?? shown?.selectedFinalDrive ?? shown?.base?.finalDrive;
  const [fdText, setFdText] = useState('');
  const [editing, setEditing] = useState(false);
  const controlsEnabled = !pending && diagnostic !== undefined && legal.length > 0 && request !== null;
  const commitFd = () => {
    setEditing(false);
    if (!request || !controlsEnabled || fdText.trim() === '') return;
    const candidateFinalDrive = Number(fdText);
    if (Number.isFinite(candidateFinalDrive) && candidateFinalDrive !== selected) onChange({ ...request, candidateFinalDrive });
  };
  const field = (name: string, label: string, value?: number) => <div>
    <label htmlFor={`${id}-${name}`} className="form-label">{label}</label>
    <input id={`${id}-${name}`} name={name} type="number" className="form-control form-control-sm" required step="0.01"
      defaultValue={value} aria-describedby={`${id}-bounds-help`} />
  </div>;
  return <section className="glass-panel p-3" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>{t('Final drive balance')}</h4>
    <p id={`${id}-bounds-help`} className="small text-body-secondary">
      {t('Enter the limits observed in the game for this car and gearbox. Only confirmed 0.01 ratio steps are supported. Unknown limits do not enable adjustment.')}
    </p>
    <details open={!request}>
      <summary>{t('Observed gearbox limits')}</summary>
      <form key={JSON.stringify(request?.bounds ?? null)} onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const range = (name: string) => ({ min: Number(data.get(`${name}-min`)), max: Number(data.get(`${name}-max`)), step: 0.01 as const });
        onChange({ schemaVersion: 'ratio-balance/v1', bounds: { source: 'user-observed', finalDrive: range('fd'),
          gears: Array.from({ length: gearCount }, (_, index) => range(`gear-${index}`)) } });
      }}>
        <fieldset disabled={pending}>
          <div className="row g-2">
            <div className="col-sm-6">{field('fd-min', t('Final drive minimum'), request?.bounds.finalDrive.min)}</div>
            <div className="col-sm-6">{field('fd-max', t('Final drive maximum'), request?.bounds.finalDrive.max)}</div>
            {Array.from({ length: gearCount }, (_, index) => <div className="col-12 row g-2" key={index}>
              <div className="col-sm-6">{field(`gear-${index}-min`, `${t('Gear')} ${index + 1} — ${t('Minimum ratio')}`, request?.bounds.gears[index]?.min)}</div>
              <div className="col-sm-6">{field(`gear-${index}-max`, `${t('Gear')} ${index + 1} — ${t('Maximum ratio')}`, request?.bounds.gears[index]?.max)}</div>
            </div>)}
          </div>
          <label className="form-check mt-2"><input className="form-check-input" type="checkbox" required />
            <span className="form-check-label">{t('I confirmed these limits and 0.01 steps in the game.')}</span></label>
          <button className="btn btn-outline-primary mt-2" type="submit">{t('Validate observed limits')}</button>
        </fieldset>
      </form>
    </details>
    <div className="d-flex gap-2 align-items-end flex-wrap mt-3">
      <div><label className="form-label" htmlFor={`${id}-fd`}>{t('Final Drive Ratio (FD)')}</label>
        <input id={`${id}-fd`} className="form-control" type="number" step="0.01" min={legal[0]} max={legal[legal.length - 1]}
          disabled={!controlsEnabled} value={editing ? fdText : selected ?? ''}
          onFocus={event => { setEditing(true); setFdText(event.currentTarget.value); }}
          onChange={event => { setEditing(true); setFdText(event.currentTarget.value); }} onBlur={commitFd}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-describedby={`${id}-result`} />
      </div>
      <button type="button" className="btn btn-outline-secondary" disabled={pending || !request || request.candidateFinalDrive === undefined}
        onClick={() => { if (request) { const { candidateFinalDrive: _candidate, ...original } = request; onChange(original); } }}>{t('Reset to original gearing')}</button>
      <button type="button" className="btn btn-outline-secondary" disabled={pending || !request} onClick={() => onChange(null)}>{t('Clear observed limits')}</button>
    </div>
    <label htmlFor={`${id}-slider`} className="form-label mt-2">{t('Legal final drive choices')}</label>
    <input id={`${id}-slider`} type="range" className="form-range" min={0} max={Math.max(0, legal.length - 1)} step={1}
      value={Math.max(0, legal.indexOf(selected ?? NaN))} disabled={!controlsEnabled}
      aria-valuetext={selected === undefined ? t('Unavailable') : selected.toFixed(2)} aria-describedby={`${id}-result`}
      onChange={event => { if (request) onChange({ ...request, candidateFinalDrive: legal[Number(event.currentTarget.value)] }); }} />
    <div id={`${id}-result`} role="status" className="small mt-2">
      {pending ? t('Calculating tuning results…') : diagnostic?.reason ? t(diagnostic.reason) : t('Ratios are revalidated before the recommendation can be saved.')}
      {storageError && <p>{t('The ratio balance draft could not be saved locally. Keep this session open or save a recommendation snapshot.')}</p>}
    </div>
    {diagnostic?.status === 'available' && <table className="table table-sm mt-2"><caption>{t('Total reduction error after rounding (ratio units)')}</caption>
      <thead><tr><th>{t('Gear')}</th><th>{t('Error')}</th><th>{t('Tolerance')}</th></tr></thead>
      <tbody>{diagnostic.totalRatioErrors.map((error, index) => <tr key={index}><th>{index + 1}</th><td>{error.toFixed(5)}</td><td>{diagnostic.totalRatioTolerance[index]?.toFixed(5)}</td></tr>)}</tbody>
    </table>}
  </section>;
}
