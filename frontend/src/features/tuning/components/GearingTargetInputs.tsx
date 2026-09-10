import { useSettings } from '../../../context/SettingsContext';
import type { GearingResult, GearingSecondaryCorrection, GearingCorrectionMode } from '../../../utils/tuningMath';

interface Props {
  gearing: GearingSecondaryCorrection & { maxRpm: number; correctionMode?: GearingCorrectionMode; targetFit?: GearingResult['targetFit'] };
  updateSection?: (section: string, field: string, value: number | string | undefined) => void;
}

export function GearingTargetInputs({ gearing, updateSection }: Props) {
  const { settings, t } = useSettings();
  const factor = settings.units.speed === 'mph' ? 0.621371 : 1;
  const unit = settings.units.speed === 'mph' ? 'mph' : 'km/h';
  const fit = gearing.targetFit;
  return (
    <details className="card p-3" style={{ background: 'var(--surface-1)', color: 'var(--text-primary)' }}>
      <summary>{t('Advanced gearing options (optional)')}</summary>
      <p className="small">{t('The normal workflow uses your vehicle data and collected telemetry. Leave this on Automatic unless you already have a specific correction to test.')}</p>
      <label className="form-label" htmlFor="gearing-correction-mode">{t('Gearing calculation mode')}</label>
      <select id="gearing-correction-mode" className="form-select form-select-sm mb-2" value={gearing.correctionMode ?? 'automatic'}
        onChange={event => updateSection?.('gearing', 'correctionMode', event.target.value)}>
        <option value="automatic">{t('Automatic from prepared data')}</option>
        <option value="event">{t('Custom event target')}</option>
        <option value="legacy">{t('Legacy speed correction')}</option>
      </select>
      <fieldset disabled={gearing.correctionMode !== 'event'}>
      <p className="small" style={{ color: 'var(--text-secondary)' }}>
        {t('Choose speed and engine RPM for the fastest section or finish. This fits gearing geometry; verify acceleration and lap time in-game. Drag and Drift retain the legacy first-four-gear baseline.')}
      </p>
      <label className="form-label" htmlFor="gearing-target-speed">{t('Target speed')} ({unit})</label>
      <input id="gearing-target-speed" className="form-control form-control-sm mb-2" type="number" min="1" step="0.1"
        value={gearing.targetSpeedKmh === undefined ? '' : Number((gearing.targetSpeedKmh * factor).toFixed(1))}
        onChange={event => updateSection?.('gearing', 'targetSpeedKmh', event.target.value === '' ? undefined : Number(event.target.value) / factor)} />
      <label className="form-label" htmlFor="gearing-target-rpm">{t('RPM at target speed')}</label>
      <input id="gearing-target-rpm" className="form-control form-control-sm mb-2" type="number" min="1" step="50"
        value={gearing.targetRpm ?? ''}
        onChange={event => updateSection?.('gearing', 'targetRpm', event.target.value === '' ? undefined : Number(event.target.value))} />
      <div className="small" aria-live="polite" style={{ minHeight: '3rem', color: 'var(--text-secondary)' }}>
        {fit?.status === 'invalid' ? t('Enter both positive values; target RPM must not exceed engine redline. Baseline gearing is shown.') :
          fit?.status === 'limited' ? t('Target not met within the current solver bounds. Review the target and installed gearbox.') :
          fit?.status === 'matched' ? t('Gearing target matched within 1%; vehicle performance still needs testing.') :
          t('Select Automatic to use the prepared driving data without a custom target.')}
        {fit?.achievedSpeedKmh !== undefined && <span> {t('Calculated speed')}: {(fit.achievedSpeedKmh * factor).toFixed(1)} {unit}</span>}
      </div>
      </fieldset>
    </details>
  );
}
