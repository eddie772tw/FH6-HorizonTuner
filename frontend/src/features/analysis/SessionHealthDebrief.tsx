import type { SessionDebriefData } from './sessionDebriefMath';
import { useSettings } from '../../context/SettingsContext';

export default function SessionHealthDebrief({ debrief, isLoading = false }: {
  debrief: SessionDebriefData; isLoading?: boolean;
}) {
  const { t, convertTemp } = useSettings();
  const { tire_thermals: tires, suspension, handling_balance: slip } = debrief;
  const number = (value: number | null | undefined, unit = '') =>
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) + unit : t('Unknown');
  const temperature = (c: number | null) => {
    if (c === null) return t('Unknown');
    const display = convertTemp(c * 9 / 5 + 32);
    return number(display.value, ' ' + display.label);
  };
  return <section className="glass-panel p-3 d-flex flex-column gap-3" aria-busy={isLoading}>
    <div className="d-flex justify-content-between gap-2 flex-wrap">
      <h3 className="h6 mb-0">{t('Measured session observations')}</h3>
      <span className="text-body-secondary small">{t(isLoading ? 'Analyzing Session Dynamics...' : 'Observed driving time')}: {number(debrief.observed_seconds, ' s')}</span>
    </div>
    <div className="row g-3">
      <div className="col-md-4">
        <h4 className="h6">{t('Time-weighted tire temperatures')}</h4>
        <dl className="row mb-0">
          {(['fl_avg', 'fr_avg', 'rl_avg', 'rr_avg'] as const).map(w => <div key={w} className="col-6">
            <dt className="small text-body-secondary">{w.slice(0, 2).toUpperCase()}</dt><dd>{temperature(tires[w])}</dd>
          </div>)}
        </dl>
        <span className="badge text-bg-secondary">{t(tires.status)}</span>
      </div>
      <div className="col-md-4">
        <h4 className="h6">{t('Suspension observations')}</h4>
        <p className="mb-1">{t('Peak observed travel')}: {number(suspension.peak_travel_pct, '%')}</p>
        <p className="mb-1">{t('Near-compression wheel events')}: {suspension.bottom_out_count ?? t('Unknown')}</p>
        <p className="small text-body-secondary mb-0">{t('Continuous events near maximum compression do not prove physical bottoming.')}</p>
      </div>
      <div className="col-md-4">
        <h4 className="h6">{t('Normalized slip observations')}</h4>
        <p className="mb-1">{t('Front slip higher')}: {number(slip.understeer_pct, '%')}</p>
        <p className="mb-1">{t('Rear slip higher')}: {number(slip.oversteer_pct, '%')}</p>
        <p className="small text-body-secondary mb-0">{t('Shares of observed turning time; these do not identify a tuning cause.')}</p>
      </div>
    </div>
    <p className="small text-body-secondary mb-0">{t('Completed laps with timing evidence')}: {debrief.valid_laps} / {debrief.observed_laps} · {t('Missing channels remain unknown. Observations do not certify an optimal setup.')}</p>
  </section>;
}
