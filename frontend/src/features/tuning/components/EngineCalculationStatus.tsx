import type { EngineCalculationSummary } from '../engineCalculation';
import type { GearingResult } from '../../../utils/tuningMath';
import { guidanceText } from '../measurementGuidance';

/** Archive readability, analysis readiness and solver feasibility are separate states. */
export function EngineCalculationStatus({ calculation, gearing, hasObservation, t }: {
  calculation: EngineCalculationSummary | null; gearing: GearingResult | null;
  hasObservation: boolean; t: (key: string) => string;
}) {
  return <div role="status" aria-live="polite" className="small text-body-secondary" style={{ minHeight: '3rem' }}>
    {hasObservation && calculation?.status !== 'ready'
      ? !calculation || calculation.reason === 'capture-unavailable'
        ? t('The saved capture is loading or unavailable. Engine history remains readable; reload it or collect a new rolling sweep before calculating.')
        : <>{t('The saved capture does not meet the loaded-sweep requirements. Collect more clean moving data; the original observation is unchanged.')}{' '}
          {t(guidanceText[calculation.reason])}</>
      : gearing?.unsupported ? t(gearing.unsupportedReason ?? 'Engine analysis is ready, but the gearing model has no feasible result. Review Step 3.')
        : calculation?.status === 'ready' ? <>{t('Calculation uses supported moving-sweep bin averages, not instantaneous launch peaks.')}{' '}
          {Math.round(calculation.peakPower!.rpm)} RPM / {Math.round(calculation.peakTorque!.rpm)} RPM</> : null}
  </div>;
}
