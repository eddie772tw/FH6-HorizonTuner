import { useSettings } from '../../../context/SettingsContext';
import type { EvidenceProvenance, TireEvidenceResult } from '../../../domain/tuning/types';

export function TireEvidencePanel({ evidence, provenance = null }: {
  evidence: TireEvidenceResult | null; provenance?: EvidenceProvenance | null;
}) {
  const { t, settings, convertTemp } = useSettings();
  const unknown = t('Unknown');
  const reasons = evidence?.unavailableReasons ?? [provenance?.powertrain === 'ev' ? 'ev-tire-channels-unavailable' : 'qualified-capture-unavailable'];
  return <section className="border-top pt-2 mt-2 small" aria-label={t('Observed tire evidence')} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <strong>{t('Observed tire evidence')}</strong> <span className="badge text-bg-secondary">{t(evidence?.status ?? 'unavailable')}</span>
    <p className="mb-1">{t('Accepted samples')}: {evidence?.acceptedSampleCount ?? unknown}</p>
    <div className="d-grid gap-1">
      <div>{t('Observed longitudinal acceleration')}: {evidence?.observedLongitudinalAccelerationMps2 == null
        ? t('Unavailable') : `${evidence.observedLongitudinalAccelerationMps2.toFixed(2)} m/s²`}</div>
      <div>{t('Maximum normalized slip')}: {evidence?.maxObservedNormalizedSlip == null
        ? t('Unavailable') : evidence.maxObservedNormalizedSlip.toFixed(3)} · {t('Dimensionless')}</div>
      <div>{t('Temperature')} ({t('FL / FR / RL / RR')}): {evidence?.observedTireTemperature == null ? t('Unavailable')
        : evidence.observedTireTemperature.map(value => `${convertTemp(value).value.toFixed(1)}°${settings.units.temperature}`).join(' / ')}</div>
    </div>
    {reasons.length > 0 && <div className="mt-2"><strong>{t('Unavailable reasons')}</strong><ul className="mb-1 ps-3">{[...new Set(reasons)].map(reason => <li key={reason}>{t(reason)}</li>)}</ul></div>}
    <dl className="mt-2 mb-2">
      {[
        ['Vehicle', provenance?.carId], ['Powertrain', provenance?.powertrain],
        ['Evidence source', provenance?.source], ['Evidence ID', provenance?.evidenceId],
        ['Observation ID', provenance?.observationId], ['Analysis version', provenance?.analysisVersion],
        ['Dependency key', provenance?.dependencyKey],
        ['Observation recorded at (Unix ms)', provenance?.observationRecordedAt],
        ['Capture time', provenance?.capturedAt], ['Session', provenance?.sessionId],
        ['Setup version', provenance?.setupVersion], ['Upgrade version', provenance?.upgradeVersion],
        ['Lap window', provenance?.lapWindow], ['Time window', provenance?.timeWindow],
      ].map(([label, value]) => <div key={label} className="d-flex flex-wrap gap-1"><dt>{t(String(label))}:</dt><dd className="mb-0">{value == null ? unknown : String(value)}</dd></div>)}
      <div className="d-flex flex-wrap gap-1"><dt>{t('Telemetry identity')}:</dt><dd className="mb-0">{provenance ? JSON.stringify(provenance.identity) : unknown}</dd></div>
    </dl>
    <p className="mb-1 text-body-secondary">{t('Setup and capture windows are unverified. This observation does not establish same-setup evidence or an A/B comparison.')}</p>
    <p className="mb-1 text-body-secondary">{t('Capture a continuous straight-line run with throttle applied, no braking or clutch input, and stable suspension.')}</p>
    <p className="mb-0 text-body-secondary">{t('Observation is conditional telemetry evidence, not friction or maximum grip identification.')}</p>
  </section>;
}
