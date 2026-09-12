import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { RoadFinish, RoadSummary } from './roadTypes';
import { parseGameTime } from './roadPresentation';

interface Props { summary: RoadSummary; finish?: RoadFinish; busy: boolean; saveFinish: (body: unknown) => Promise<unknown> }
export function RoadObservation({ summary, finish, busy, saveFinish }: Props) {
  const { t } = useSettings();
  const [time, setTime] = useState(''), [clean, setClean] = useState(false);
  useEffect(() => { setTime(finish?.timeSeconds.toString() || ''); setClean(finish?.clean === 'confirmed'); }, [summary.id, finish?.id]);
  const seconds = parseGameTime(time);
  const fmt = (v: number | null | undefined, digits = 1) => v === null || v === undefined ? t('Unknown') : v.toFixed(digits);
  return <section className="glass-panel p-4">
    <h2 className="h5">{t('Saved run observations')}</h2>
    <p>{t('Observed driving')}: {summary.observations.quality.observedSeconds.toFixed(1)} s · {t('Saved samples')}: {summary.observations.sampleCount}</p>
    <form onSubmit={e => { e.preventDefault(); if (seconds !== null) void saveFinish({ completed: true, timeSeconds: seconds, clean: clean ? 'confirmed' : 'unknown', source: 'game-confirmed' }); }}>
      <div className="d-flex flex-wrap align-items-end gap-3">
        <label className="form-label mb-0">{t('Full-event time shown in game')}<input className="form-control" value={time} onChange={e => setTime(e.target.value)} placeholder="1:23.456" required /></label>
        <button className="btn btn-outline-primary" disabled={busy || seconds === null}>{t('Confirm finish result')}</button>
      </div>
      <label className="d-flex gap-2 my-3"><input type="checkbox" checked={clean} onChange={e => setClean(e.target.checked)} />{t('I completed the selected event without a collision, rewind or other known incident.')}</label>
      <p className="small text-body-secondary">{t('Optional until comparing performance. Telemetry sample duration is not a finish time.')}</p>
    </form>
    <details><summary>{t('Four-wheel observations and data quality')}</summary>
      <div className="table-responsive"><table className="table table-sm mt-3"><thead><tr><th>{t('Wheel')}</th><th>{t('Start / end temperature')} °C</th><th>{t('Mean / change')} °C</th><th>{t('Near-compression events')}</th></tr></thead><tbody>
        {Object.entries(summary.observations.wheels).map(([key, wheel]) => <tr key={key}><th>{key}</th><td>{fmt(wheel.startTemperatureC)} / {fmt(wheel.endTemperatureC)}</td><td>{fmt(wheel.temperatureC.mean)} / {fmt(wheel.temperatureChangeC)}</td><td>{fmt(wheel.nearCompression.count, 0)} · {fmt(wheel.nearCompression.seconds)} s</td></tr>)}
      </tbody></table></div>
      <p className="small">{t('Temperatures describe this run. Near-compression is not proof of bottoming. No pressure or tire compound was inferred.')}</p>
      <p className="small">{t('Telemetry gaps')}: {summary.observations.quality.gapSeconds.toFixed(1)} s · {t('End reason')}: {t(summary.recording.endReason)}</p>
      <ul>{summary.observations.laps.map(lap => <li key={lap.lapNumber}>{t('Lap')} {lap.lapNumber}: {fmt(lap.lapTimeSeconds, 3)} s · {t(lap.complete ? 'Complete observed lap' : 'Partial or unconfirmed lap')}</li>)}</ul>
      {summary.observations.channels && <div className="table-responsive"><table className="table table-sm"><thead><tr><th>{t('Telemetry channel')}</th><th>{t('Mean')}</th><th>P05 / P50 / P95</th><th>{t('Observed driving')} s</th></tr></thead>
        <tbody>{Object.entries(summary.observations.channels).map(([key, values]) => <tr key={key}><th>{t(key)}</th><td>{fmt(values.mean, 3)}</td>
          <td>{fmt(values.p05, 3)} / {fmt(values.p50, 3)} / {fmt(values.p95, 3)}</td><td>{fmt(values.observedSeconds)}</td></tr>)}</tbody></table>
        <p className="small">{t('Raw units: speed m/s, power W, torque Nm, acceleration m/s², angular velocity rad/s, controls in game input units. Gaps do not count toward observed duration.')}</p>
      </div>}
    </details>
  </section>;
}
