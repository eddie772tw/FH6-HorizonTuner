import { useSettings } from '../../../context/SettingsContext';
import type { TireEvidenceResult } from '../tireEvidence';

export function TireEvidencePanel({ evidence }: { evidence: TireEvidenceResult | null }) {
  const { t, settings, convertTemp } = useSettings();
  if (!evidence || evidence.status === 'unavailable') return <div className="border-top pt-2 mt-2"><strong>{t('Observed tire evidence')}</strong><p className="mb-0">{t('Unavailable')}</p><small className="text-body-secondary">{t('Capture a continuous straight-line run with throttle applied, no braking or clutch input, and stable suspension.')}</small></div>;
  const unit = settings.units.temperature;
  return <div className="border-top pt-2 mt-2">
    <strong>{t('Observed tire evidence')}</strong>
    <p className="mb-0">
      {t('Observed longitudinal acceleration')}: {evidence.observedLongitudinalAccelerationMps2 == null
        ? t('Unavailable') : `${evidence.observedLongitudinalAccelerationMps2.toFixed(2)} m/s²`}
      {' · '}{t('Maximum normalized slip')}: {evidence.maxObservedNormalizedSlip == null
        ? t('Unavailable') : evidence.maxObservedNormalizedSlip.toFixed(3)}
      {' · '}{t('Temperature')}: {evidence.observedTireTemperature == null ? t('Unavailable')
        : evidence.observedTireTemperature.map(value => `${convertTemp(value).value.toFixed(1)}°${unit}`).join(' / ')}
    </p>
    <small className="text-body-secondary">{t('Observation is conditional telemetry evidence, not friction or maximum grip identification.')}</small>
  </div>;
}
