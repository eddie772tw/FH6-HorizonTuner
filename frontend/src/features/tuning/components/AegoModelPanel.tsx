import { useSettings } from '../../../context/SettingsContext';
import type { AegoGearingDiagnostics } from '../aegoTypes';

// Protocol IDs are translated into reader-facing text before the English t() fast path.
const diagnosticLabels: Record<string,string> = {
  'road-engineering-priors': 'Road engineering priors',
  'inherited-rally-engineering-prior': 'Inherited Rally engineering prior',
  'transmission-preview-cap-at-reference-rpm': 'Transmission-preview constraint at reference RPM',
  'user-target': 'User-requested operating target',
  'inherited-drag-engineering-prior': 'Inherited Drag engineering prior',
  'caller-declared-manual': 'Caller-declared manual record; not independently measured by the backend',
  'caller-declared-telemetry': 'Caller-declared telemetry source; speed capability is not independently verified',
  'model-prior-not-game-observation': 'Model prior, not an observed game-part range',
  'user-observed': 'User-observed part bounds',
  'pure-rolling-wheel-speed-at-peak-power-rpm': 'Pure-rolling wheel speed at peak-power RPM',
  'pure-rolling-wheel-speed-not-ground-speed': 'Pure-rolling wheel speed; ground speed during slip is unknown',
  'kinematic-compatibility-only-not-power-drift-validation': 'FWD kinematic compatibility only; power drifting is unvalidated',
  'rwd-uncalibrated-engineering-candidate': 'RWD uncalibrated engineering candidate',
  'awd-uncalibrated-engineering-candidate': 'AWD uncalibrated engineering candidate',
  'frozen-legacy-owner': 'Frozen historical model',
  'legacy-owner-wheel-speed': 'Historical model wheel-speed semantics',
};

export function AegoModelPanel({ diagnostic, className='glass-panel p-3' }: { diagnostic?: AegoGearingDiagnostics | null; className?: string }) {
  const { t } = useSettings();
  if (!diagnostic) return null;
  const label=(value:string|undefined,fallback:string)=>t(value ? diagnosticLabels[value] ?? fallback : fallback);
  const rows: [string, number | undefined, string][] = [
    ['Target endpoint wheel speed', diagnostic.targetSpeedKmh, 'km/h'],
    ['Actual endpoint wheel speed', diagnostic.actualSpeedKmh, 'km/h'],
    ['Endpoint wheel-speed error', diagnostic.endpointErrorKmh, 'km/h'],
    ['Endpoint tolerance', diagnostic.endpointToleranceKmh, 'km/h'],
    ['Launch wheel-speed target', diagnostic.launchTargetSpeedKmh, 'km/h'],
    ['Actual launch wheel speed', diagnostic.actualLaunchSpeedKmh, 'km/h'],
    ['Launch wheel-speed error', diagnostic.launchErrorKmh, 'km/h'],
    ['Main working gear', diagnostic.mainGear, ''],
    ['Target operating RPM', diagnostic.targetRpm, 'RPM'],
    ['Target wheel speed (km/h)', diagnostic.targetWheelSpeedKmh, 'km/h'],
    ['Actual working wheel speed', diagnostic.actualWheelSpeedKmh, 'km/h'],
    ['Working wheel-speed error', diagnostic.wheelSpeedErrorKmh, 'km/h'],
    ['RPM at target wheel speed', diagnostic.actualRpmAtTargetWheelSpeed, 'RPM'],
  ];
  return <section id="aego-model-panel" data-aego-status={diagnostic.status} className={className} aria-labelledby="aego-model-title">
    <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
      <h3 id="aego-model-title" className="fs-6 mb-0">{t('AEGO model & constraints')}</h3>
      <span className={`badge ${diagnostic.status === 'unavailable' ? 'text-bg-danger' : diagnostic.status === 'limited' ? 'text-bg-warning' : 'text-bg-success'}`}>{t(diagnostic.status === 'unavailable' ? 'Unavailable' : diagnostic.status === 'limited' ? 'Limited' : 'Available')}</span>
    </div>
    <p className="small mb-1" style={{ overflowWrap: 'anywhere' }}>{diagnostic.modelVersion}</p>
    <p className="small text-body-secondary">{t('Engineering baseline; game performance, launch grip and optimal shifts remain unvalidated.')}</p>
    {diagnostic.reason && <p role="status" className="small">{t(diagnostic.reason)}</p>}
    {diagnostic.shapePreferenceLimited && <p className="small">{t('The target is feasible, with a compromise from the preferred gear spacing.')}</p>}
    {diagnostic.finalDriveSaturated && <p className="small">{t('The preferred final drive is outside the entered or model-prior range; the operating target remains checked.')}</p>}
    {diagnostic.previewCapApplied && <p className="small">{t('A transmission-preview limit constrains the engineering target. This is not measured vehicle speed capability.')}</p>}
    {diagnostic.outsideModelFinalDrivePrior && <p className="small">{t('The selected final drive uses your observed range beyond the model prior.')}</p>}
    <dl className="small mb-2">
      <dt>{t('Target source')}</dt><dd>{label(diagnostic.targetSource ?? diagnostic.launchSource,'Source unavailable')}</dd>
      {diagnostic.launchSource && diagnostic.targetSource && diagnostic.launchSource !== diagnostic.targetSource && <>
        <dt>{t('Launch target source')}</dt><dd>{label(diagnostic.launchSource,'Source unavailable')}</dd>
      </>}
      <dt>{t('Ratio bounds source')}</dt><dd>{label(diagnostic.boundsSource,'Source unavailable')}</dd>
      <dt>{t('Speed meaning')}</dt><dd>{label(diagnostic.speedSemantics,'Speed meaning unavailable')}</dd>
    </dl>
    {diagnostic.drivetrainApplicability && <p className="small">{label(diagnostic.drivetrainApplicability,'Applicability unvalidated')}</p>}
    {diagnostic.workingBandStatus && <p className="small text-body-secondary">{t('No qualified usable power band. The four-point shape is an uncalibrated prior.')}</p>}
    <div className="table-responsive"><table className="table table-sm mb-0"><tbody>
      {rows.filter(([, value]) => typeof value === 'number' && Number.isFinite(value)).map(([label, value, unit]) => <tr key={label}>
        <th scope="row" className="fw-normal">{t(label)}</th><td className="text-end text-nowrap">{value!.toFixed(unit === 'RPM' || !unit ? 0 : 2)} {unit}</td>
      </tr>)}
    </tbody></table></div>
  </section>;
}
