import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { GearingResult } from '../../../utils/tuningMath';
import type { useEngineMeasurementArchive } from '../useEngineMeasurementArchive';
import { TuningMeasurementStep } from './TuningMeasurementStep';
import { EngineObservationHistory } from './EngineObservationHistory';
import { GearingTuner } from './GearingTuner';
import { LegacyTuningHistory } from './LegacyTuningHistory';

export function EngineDataStep({ carId, profile, engine, gearing, enabled }: {
  carId: string; profile: CarParams | null; engine: ReturnType<typeof useEngineMeasurementArchive>;
  gearing: GearingResult | null; enabled: boolean;
}) {
  const { t } = useSettings();
  const measured = engine.current;
  return <section className="d-flex flex-column gap-3">
    <div className="glass-panel p-3"><h3 className="h5">{t('Engine data & gearing')}</h3>
      <p className="mb-0">{t('Engine limit and peak output RPM come from measured acceleration. Missing measurements do not use an estimated redline.')}</p>
    </div>
    <EngineObservationHistory entries={engine.archive} compatibleIds={engine.compatible.map(item => item.id)} reuse={engine.reuse} storageError={engine.storageError} />
    <LegacyTuningHistory carId={carId} />
    {engine.storageError && <p role="status">{t('The observation could not be saved. Keep this page open and retry Continue; collected frames are retained.')}</p>}
    {measured ? <div className="glass-panel p-3"><p>{t('Measured engine limit')}: {measured.engineMaxRpm} RPM · {t('Peak power RPM')}: {Math.round(measured.observedPeakPower!.rpm)} · {t('Peak torque RPM')}: {Math.round(measured.observedPeakTorque!.rpm)}</p>
      <button className="btn btn-outline-secondary" onClick={engine.invalidate}>{t('Collect driving data again')}</button></div>
      : <TuningMeasurementStep carId={carId} enabled={enabled} onComplete={engine.complete} />}
    {!enabled && <p>{t('Enter the game-reported vehicle power before collecting engine data.')}</p>}
    {gearing && measured && <div className="glass-panel p-3"><GearingTuner showCorrections={false} numGears={gearing.gears.length}
      tuning={{ gearing: { ...gearing, maxRpm: measured.engineMaxRpm } }}
      carParams={{ ...profile, maxHpRpm: measured.observedPeakPower!.rpm, maxTorqueRpm: measured.observedPeakTorque!.rpm }} /></div>}
  </section>;
}
