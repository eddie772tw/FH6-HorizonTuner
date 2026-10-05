import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { GearingResult } from '../../../domain/tuning/types';
import type { useEngineMeasurementArchive } from '../useEngineMeasurementArchive';
import { TuningMeasurementStep } from './TuningMeasurementStep';
import { EngineObservationHistory } from './EngineObservationHistory';
import { GearingTuner } from './GearingTuner';
import { LegacyTuningHistory } from './LegacyTuningHistory';
import type { TireEvidenceResult } from '../../../domain/tuning/types';
import { backendFetch } from '../../../services/backend';
import { TireEvidencePanel } from './TireEvidencePanel';
import { useEffect, useState } from 'react';
import { useTuneSession } from '../TuneSessionProvider';
import { EngineCalculationStatus } from './EngineCalculationStatus';

export function EngineDataStep({ carId, profile, engine, gearing, enabled }: {
  carId: string; profile: CarParams | null; engine: ReturnType<typeof useEngineMeasurementArchive>;
  gearing: GearingResult | null; enabled: boolean;
}) {
  const { t } = useSettings();
  const { engineMeasurement } = useTuneSession();
  const measured = engine.current;
  const calculation = engine.calculation;
  const [tireResult, setTireResult] = useState<{ capture: unknown; evidence: TireEvidenceResult } | null>(null);
  const capture = engine.observation?.capture;
  useEffect(() => {
    if (!measured?.identity || !capture) return;
    const controller = new AbortController(); let active = true;
    void backendFetch('/api/tuning/tire-evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ samples: capture.samples, identity: { carOrdinal: measured.identity.ordinal, performanceIndex: measured.identity.performanceIndex, carClass: measured.identity.carClass } })
    }).then(async response => { if (!response.ok) throw new Error(); const evidence = await response.json() as TireEvidenceResult; if (active) setTireResult({ capture, evidence }); }).catch(() => {});
    return () => { active = false; controller.abort(); };
  }, [measured, capture]);
  const tireEvidence = capture && tireResult?.capture === capture ? tireResult.evidence : null;
  return <section className="d-flex flex-column gap-3">
    <div className="workspace-section"><h3 className="workspace-section-heading">{t('Engine data & gearing')}</h3>
      <p className="mb-0">{t('Engine limit and peak output RPM come from measured acceleration. Missing measurements do not use an estimated redline.')}</p>
    </div>
    <EngineObservationHistory entries={engine.archive} compatibleIds={engine.compatible.map(item => item.id)} reuse={engine.reuse} storageError={engine.storageError} />
    <LegacyTuningHistory carId={carId} />
    {engine.storageError && <p role="status">{t('The observation could not be saved. Retry Continue after the error; collected frames remain available while this app session is open.')}</p>}
    {measured ? <div className="glass-panel p-3"><p>{t('Recorded instantaneous peaks are historical observations, not the new AEGO calculation inputs.')}</p>
      <p>{t('Measured engine limit')}: {measured.engineMaxRpm} RPM · {t('Peak power RPM')}: {Math.round(measured.observedPeakPower!.rpm)} · {t('Peak torque RPM')}: {Math.round(measured.observedPeakTorque!.rpm)}</p>
      <TireEvidencePanel evidence={tireEvidence} />
      <button className="btn btn-outline-secondary" onClick={() => engineMeasurement.restart(enabled)}>{t('Collect driving data again')}</button></div>
      : <TuningMeasurementStep carId={carId} enabled={enabled} />}
    {!enabled && <p>{t('Enter the game-reported vehicle power before collecting engine data.')}</p>}
    <EngineCalculationStatus hasObservation={Boolean(measured)} calculation={calculation} gearing={gearing} t={t} />
    {gearing && !gearing.unsupported && calculation?.status === 'ready' && <div className="glass-panel p-3"><GearingTuner showCorrections={false} numGears={gearing.gears.length}
      tuning={{ gearing: { ...gearing, maxRpm: calculation.engineMaxRpm, effectiveRedline: calculation.effectiveRedline } }}
      carParams={{ ...profile, maxHpRpm: calculation.peakPower!.rpm, maxTorqueRpm: calculation.peakTorque!.rpm, effectiveRedline: calculation.effectiveRedline }} /></div>}
  </section>;
}
