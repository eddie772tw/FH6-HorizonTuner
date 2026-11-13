import type { CarParams } from '../../../context/CarParamsContext';
import { useCarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { GearingResult } from '../../../domain/tuning/types';
import type { useEngineMeasurementArchive } from '../useEngineMeasurementArchive';
import { TuningMeasurementStep } from './TuningMeasurementStep';
import { EngineObservationHistory } from './EngineObservationHistory';
import { GearingTuner } from './GearingTuner';
import { RatioBalancePanel } from './RatioBalancePanel';
import { usesCvt } from '../../../domain/tuning/transmission';
import { LegacyTuningHistory } from './LegacyTuningHistory';
import { TireEvidencePanel } from './TireEvidencePanel';
import { useTuneSession } from '../TuneSessionProvider';
import { EngineCalculationStatus } from './EngineCalculationStatus';
import { AegoModelPanel } from './AegoModelPanel';

export function EngineDataStep({ carId, profile, engine, gearing, enabled }: {
  carId: string; profile: CarParams | null; engine: ReturnType<typeof useEngineMeasurementArchive>;
  gearing: GearingResult | null; enabled: boolean;
}) {
  const { t } = useSettings();
  const offline = useCarParams().selectionSource === 'saved';
  const { engineMeasurement, result, calculationStatus, ratioBalance } = useTuneSession();
  const measured = engine.current;
  const calculation = engine.calculation;
  return <section className="d-flex flex-column gap-3">
    <div className="workspace-section"><h3 className="workspace-section-heading workspace-panel-header">{t('Engine data & gearing')}</h3>
    </div>
    <EngineCalculationStatus hasObservation={Boolean(measured)} calculation={calculation} gearing={gearing} t={t} />
    {measured && calculation?.status === 'ready' && calculationStatus === 'ready' && !result?.readiness.measuredEngine && <p className="small text-body-secondary" role="status">
      {t('This saved observation is review-only in the current vehicle/setup context. Follow Data Out to collect new evidence; selecting it again does not restore an invalidated recommendation.')}
    </p>}
    <AegoModelPanel diagnostic={result?.gearingDiagnostics} />
    {gearing && !gearing.unsupported && calculation?.status === 'ready' && <div className="glass-panel p-3"><GearingTuner gearing={gearing} view={result?.gearingView} /></div>}
    {calculation?.status === 'ready' && ratioBalance.active && !profile?.isElectric && !usesCvt(profile) && profile?.adjustability?.gearbox === 'Full' && <RatioBalancePanel
      request={ratioBalance.request} diagnostic={result?.ratioBalance} pending={calculationStatus === 'pending'}
      storageError={ratioBalance.storageError} gearCount={profile.adjustability.gears ?? gearing?.gears.length ?? 0} onChange={ratioBalance.setRequest} />}
    {!enabled && <p>{t('Enter the game-reported vehicle power before collecting engine data.')}</p>}
    <div role="status" aria-live="polite" className="small" style={{ minHeight: '3em' }}>{t(engine.storageError ? 'Engine data could not be saved. Collected frames are retained. Retry Save engine data & calculate.' : engine.pendingSave ? 'Saving engine data…' : measured ? 'Engine data saved. Calculation stays in this step; use Go to setup verification when ready.' : 'Save engine data & calculate stays in this step.')}</div>
    {measured ? <div className="glass-panel p-3">
      <p>{t('Measured engine limit')}: {measured.engineMaxRpm} RPM · {t('Peak power RPM')}: {Math.round(measured.observedPeakPower!.rpm)} · {t('Peak torque RPM')}: {Math.round(measured.observedPeakTorque!.rpm)}</p>
      <TireEvidencePanel evidence={result?.tireEvidence ?? null} provenance={result?.evidenceProvenance ?? null} />
      <button className="btn btn-outline-secondary" disabled={offline || engine.pendingSave} onClick={() => engineMeasurement.restart(enabled)}>{t('Collect driving data again')}</button></div>
      : <TuningMeasurementStep carId={carId} enabled={enabled && !offline} offline={offline} />}
    <EngineObservationHistory entries={engine.archive} compatibleIds={engine.compatible.map(item => item.id)} reuse={engine.reuse} storageError={engine.storageError} busy={engine.pendingSave} />
    <LegacyTuningHistory carId={carId} />
  </section>;
}
