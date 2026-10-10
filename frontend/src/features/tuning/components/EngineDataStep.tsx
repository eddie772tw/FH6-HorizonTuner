import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { GearingResult } from '../../../domain/tuning/types';
import type { useEngineMeasurementArchive } from '../useEngineMeasurementArchive';
import { TuningMeasurementStep } from './TuningMeasurementStep';
import { EngineObservationHistory } from './EngineObservationHistory';
import { GearingTuner } from './GearingTuner';
import { LegacyTuningHistory } from './LegacyTuningHistory';
import { TireEvidencePanel } from './TireEvidencePanel';
import { useTuneSession } from '../TuneSessionProvider';
import { EngineCalculationStatus } from './EngineCalculationStatus';

export function EngineDataStep({ carId, profile, engine, gearing, enabled }: {
  carId: string; profile: CarParams | null; engine: ReturnType<typeof useEngineMeasurementArchive>;
  gearing: GearingResult | null; enabled: boolean;
}) {
  const { t } = useSettings();
  const { engineMeasurement, result } = useTuneSession();
  const measured = engine.current;
  const calculation = engine.calculation;
  return <section className="d-flex flex-column gap-3">
    <div className="workspace-section"><h3 className="workspace-section-heading workspace-panel-header">{t('Engine data & gearing')}</h3>
      <p className="mb-0">{t('Engine limit and peak output RPM come from measured acceleration. Missing measurements do not use an estimated redline.')}</p>
    </div>
    <EngineObservationHistory entries={engine.archive} compatibleIds={engine.compatible.map(item => item.id)} reuse={engine.reuse} storageError={engine.storageError} />
    <LegacyTuningHistory carId={carId} />
    {engine.storageError && <p role="status">{t('The observation could not be saved. Retry Continue after the error; collected frames remain available while this app session is open.')}</p>}
    {measured ? <div className="glass-panel p-3"><p>{t('Recorded instantaneous peaks are historical observations, not the new AEGO calculation inputs.')}</p>
      <p>{t('Measured engine limit')}: {measured.engineMaxRpm} RPM · {t('Peak power RPM')}: {Math.round(measured.observedPeakPower!.rpm)} · {t('Peak torque RPM')}: {Math.round(measured.observedPeakTorque!.rpm)}</p>
      <TireEvidencePanel evidence={result?.tireEvidence ?? null} provenance={result?.evidenceProvenance ?? null} />
      <button className="btn btn-outline-secondary" onClick={() => engineMeasurement.restart(enabled)}>{t('Collect driving data again')}</button></div>
      : <TuningMeasurementStep carId={carId} enabled={enabled} />}
    {!enabled && <p>{t('Enter the game-reported vehicle power before collecting engine data.')}</p>}
    <EngineCalculationStatus hasObservation={Boolean(measured)} calculation={calculation} gearing={gearing} t={t} />
    {gearing && !gearing.unsupported && calculation?.status === 'ready' && <div className="glass-panel p-3"><GearingTuner showCorrections={false} numGears={gearing.gears.length}
      tuning={{ gearing: { ...gearing, maxRpm: calculation.engineMaxRpm, effectiveRedline: calculation.effectiveRedline } }}
      carParams={{ ...profile, maxHpRpm: calculation.peakPower!.rpm, maxTorqueRpm: calculation.peakTorque!.rpm, effectiveRedline: calculation.effectiveRedline }} /></div>}
  </section>;
}
