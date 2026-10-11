import type { ChassisDiagnostics } from '../../../domain/tuning/types';
import { useSettings } from '../../../context/SettingsContext';

const reasonLabels: Record<string, string> = {
  'unsupported-aero-input-version': 'Unsupported aero input version',
  'invalid-downforce': 'Downforce must be finite and non-negative',
  'aero-balance-required': 'Enter front aero balance when only one axle load is provided',
  'invalid-aero-balance': 'Front aero balance must be between 0% and 100%',
  'aero-balance-not-solvable': 'This balance endpoint cannot resolve the missing load',
  'aero-overflow': 'Derived downforce exceeds the calculation range',
  'invalid-front-spring-range': 'Enter a valid installed front spring range',
  'invalid-rear-spring-range': 'Enter a valid installed rear spring range',
  'chassis-calculation-overflow': 'Chassis calculation exceeds the numeric range',
  'missing-weight': 'Valid vehicle weight is missing',
  'missing-distribution': 'Valid front distribution (between 0 and 100%) is missing',
};
export function chassisReasonText(reason: string, t: (key: string) => string) {
  const translated = t(reason);
  return translated === reason ? reasonLabels[reason] ?? reason : translated;
}

export function ChassisCalculationStatus({ diagnostics }: { diagnostics?: ChassisDiagnostics | null }) {
  const { t, convertForce } = useSettings();
  if (!diagnostics?.aero) return null;
  const { aero, axles, reasons } = diagnostics;
  const force = (value: number | null) => value == null ? t('Unknown') : `${Number(convertForce(value).value.toFixed(2))} ${convertForce(value).label}`;
  return <div className="small text-body-secondary" role="status" aria-label={t('Chassis calculation status')}>
    {reasons.length > 0 && <p className="mb-1">{t('Spring and damping correction unavailable')}: {reasons.map(reason => chassisReasonText(reason, t)).join(' · ')}</p>}
    {aero.source === 'omitted' && <p className="mb-1">{t('Downforce omitted: no aerodynamic correction applied.')}</p>}
    {aero.source !== 'omitted' && aero.source !== 'unavailable' && <p className="mb-1">
      {t('Resolved downforce (front / rear)')}: {force(aero.front)} / {force(aero.rear)}
      {aero.source.startsWith('derived-') && <> · {t('Derived from the provided load and front aero balance; inputs remain unchanged.')}</>}
    </p>}
    {axles.map(axle => <span key={axle.axle}>
      {axle.baseLimited && <span className="d-block">{t(axle.axle === 'front' ? 'Front' : 'Rear')}: {t('Baseline spring target is limited by the installed range.')}</span>}
      {axle.aeroLimited && <span className="d-block">{t(axle.axle === 'front' ? 'Front' : 'Rear')}: {t('Downforce spring target exceeds the installed range; support is not guaranteed.')}</span>}
      {(axle.reboundLimited || axle.bumpLimited) && <span className="d-block">{t(axle.axle === 'front' ? 'Front' : 'Rear')}: {t('Damping target is limited by the slider range.')}</span>}
    </span>)}
  </div>;
}
