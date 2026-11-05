import type { CompanionSnapshot } from './companionProtocol';
import { useSettings } from '../../context/SettingsContext';

const n = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
function Stat({ label, value, unit = '' }: { label: string; value: string; unit?: string }) { return <div><span className="companion-stat-label">{label}</span><strong>{value}{unit && ` ${unit}`}</strong></div>; }

export function ChassisResults({ result }: { result: CompanionSnapshot['results']['chassis'] }) {
  const { t } = useSettings();
  return <article id="companion-chassis" className="companion-panel companion-result-card"><h3>{t('Chassis')}</h3>{result ? <div className="companion-result-list"><Stat label={t('Front spring')} value={n(result.springs.front)} unit="kgf/mm" /><Stat label={t('Rear spring')} value={n(result.springs.rear)} unit="kgf/mm" /><Stat label={t('Ride height F/R')} value={`${n(result.springs.heightF)} / ${n(result.springs.heightR)}`} unit="cm" /><Stat label={t('Damping rebound F/R')} value={`${n(result.damping.reboundF)} / ${n(result.damping.reboundR)}`} /><Stat label={t('Damping bump F/R')} value={`${n(result.damping.bumpF)} / ${n(result.damping.bumpR)}`} /><Stat label={t('ARB F/R')} value={`${n(result.arb.front)} / ${n(result.arb.rear)}`} /><Stat label={t('Diff accel F/R')} value={`${n(result.diff.accelF)} / ${n(result.diff.accelR)}`} unit="%" /><Stat label={t('Diff decel F/R')} value={`${n(result.diff.decelF)} / ${n(result.diff.decelR)}`} unit="%" /><Stat label={t('AWD center rear')} value={n(result.diff.centerRear)} unit="%" /></div> : <span className="text-body-secondary">{t('No result yet')}</span>}</article>;
}

export function AlignmentResults({ result }: { result: CompanionSnapshot['results']['alignment'] }) {
  const { t } = useSettings();
  return <article id="companion-alignment" className="companion-panel companion-result-card"><h3>{t('Alignment')}</h3>{result ? <div className="companion-result-list"><Stat label={t('Cold pressure F/R')} value={`${n(result.pcF)} / ${n(result.pcR)}`} unit="psi" /><Stat label={t('Target hot pressure')} value={n(result.targetPhot)} unit="psi" /><Stat label={t('Camber F/R')} value={`${n(result.camber.front)} / ${n(result.camber.rear)}`} unit="deg" /><Stat label={t('Toe F/R')} value={`${result.toe.front} / ${result.toe.rear}`} /><Stat label={t('Caster')} value={n(result.caster)} unit="deg" /></div> : <span className="text-body-secondary">{t('No result yet')}</span>}</article>;
}

export function GearingResults({ result, measurementPhase, unavailableMessage }: { result: CompanionSnapshot['results']['gearing']; measurementPhase: string; unavailableMessage?: string }) {
  const { t } = useSettings();
  return <article id="companion-gearing" className="companion-panel companion-result-card"><h3>{t('Gearing')}</h3>{unavailableMessage ? <p className="text-body-secondary mb-0">{unavailableMessage}</p> : result ? <div className="companion-result-list"><Stat label={t('Final drive')} value={n(result.finalDrive, 3)} unit="ratio" />{result.gears.map((ratio, index) => <Stat key={index} label={t('Gear {index}', { index: index + 1 })} value={n(ratio, 3)} unit="ratio" />)}</div> : <p className="text-body-secondary mb-0">{t('Complete a valid engine measurement to calculate gear ratios. Current phase: {measurementPhase}.', { measurementPhase })}</p>}</article>;
}
