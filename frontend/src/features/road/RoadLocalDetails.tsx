import { useSettings } from '../../context/SettingsContext';
import type { RoadSegment } from './roadTypes';

export function RoadLocalDetails({ segments }: { segments?: RoadSegment[] }) {
  const { t } = useSettings();
  const value = (v: number | null, digits = 1) => v === null ? t('Unknown') : (v > 0 ? '+' : '') + v.toFixed(digits);
  return <details className="my-3"><summary>{t('Where the local differences were observed')}</summary>
    <p className="small mt-2">{t('Distance follows the recorded A route, including successive laps. Only matched speed and controls enter this table. Positive values mean B was higher; they are not improvement scores.')}</p>
    {segments?.length ? <div className="table-responsive"><table className="table table-sm"><thead><tr><th>{t('Recorded route section')}</th><th>{t('Matched locations')}</th><th>{t('Normalized slip change')}</th><th>{t('Four-wheel temperature change')} °C</th></tr></thead>
      <tbody>{segments.map(s => <tr key={s.index}><th>{s.fromMeters.toFixed(0)}–{s.toMeters.toFixed(0)} m</th><td>{s.matchedLocations}</td><td>{value(s.meanNormalizedAngleChange, 3)}</td><td>{s.meanTemperatureChangeC.map(v => value(v)).join(' / ')}</td></tr>)}</tbody>
    </table></div> : <p className="small">{t('No comparable local observations are available.')}</p>}
    <p className="small text-body-secondary">{t('Wheel order: FL / FR / RL / RR. Later temperature changes remain part of the observation; no ideal temperature is assumed.')}</p>
  </details>;
}
