import React, { useEffect, useMemo } from 'react';
import { useCarParams } from '../../context/CarParamsContext';
import { useSettings } from '../../context/SettingsContext';
import { createDefaultCapabilityContract } from '../../domain/tuning/contracts';
import {
  calculateDevTuning,
  type DevRaceGoal,
  type DevSurface,
  type DevTuningInput,
  type DevTuningOutput,
} from '../../utils/tuningMath_dev';
import CapabilityContractPanel from './components/CapabilityContractPanel';
import DevInputPanel from './components/DevInputPanel';
import DevOutputPanel from './components/DevOutputPanel';
import TuningTelemetryCaptureView from './components/TuningTelemetryCaptureView';
import { TuneSessionBoundary, useTuneSession } from './TuneSessionProvider';

interface TuningViewDevProps {
  currentStep?: number;
  setCurrentStep?: (step: number | ((prev: number) => number)) => void;
}

const TuningViewDevContent: React.FC<TuningViewDevProps> = ({ currentStep: externalStep, setCurrentStep: externalSetStep }) => {
  const { carName, carParams } = useCarParams();
  const { t } = useSettings();
  const session = useTuneSession();
  const developer = session.developer;

  useEffect(() => {
    if (externalStep !== undefined && externalStep !== developer.step) developer.setStep(externalStep);
  }, [developer, externalStep]);

  useEffect(() => {
    externalSetStep?.(developer.step);
  }, [developer.step, externalSetStep]);

  const input = useMemo<DevTuningInput | null>(() => {
    if (!carParams) return null;
    return {
      raceGoal: developer.raceGoal,
      surface: developer.surface,
      car: carParams,
      targetTopSpeedKmh: developer.targetTopSpeedKmh,
      targetRideFrequencyFrontHz: developer.targetRideFrequencyFrontHz,
      targetRideFrequencyRearHz: developer.targetRideFrequencyRearHz,
      dampingRatioFront: developer.dampingRatioFront,
      dampingRatioRear: developer.dampingRatioRear,
    };
  }, [carParams, developer]);

  const output = useMemo<DevTuningOutput | null>(() => (input ? calculateDevTuning(input) : null), [input]);
  const capabilityContract = useMemo(() => (carParams ? createDefaultCapabilityContract(carParams) : null), [carParams]);

  const updateRaceGoal = (nextGoal: DevRaceGoal) => {
    developer.setRaceGoal(nextGoal);
    const validSurfaces: Record<DevRaceGoal, DevSurface[]> = {
      Road: ['tarmac'], Rally: ['gravel', 'snow'], Drag: ['dragStrip', 'tarmac'], Drift: ['tarmac', 'gravel'],
    };
    if (!validSurfaces[nextGoal].includes(developer.surface)) developer.setSurface(validSurfaces[nextGoal][0]);
  };

  if (developer.showCapture) return <TuningTelemetryCaptureView t={t} onBack={() => developer.setShowCapture(false)} />;

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto">
      <div className="border-bottom pb-3 flex-shrink-0">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <h2 className="text-primary fs-4 fw-bold mb-1">{t('Developer Tuning View')}</h2>
            <p className="text-body-secondary fs-7 mb-0">{t('Explicit typed input/output for the experimental tuningMath_dev.ts calculation layer.')}</p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-outline-primary btn-sm" onClick={() => developer.setShowCapture(true)}>{t('Open Telemetry Capture')}</button>
            <span className="badge bg-warning-subtle text-warning-emphasis">{t('EXPERIMENTAL')}</span>
            <span className="badge bg-primary-subtle text-primary-emphasis">tuning-dev/v1</span>
          </div>
        </div>
      </div>
      <div className="alert alert-warning mb-0 py-2" role="alert">
        {t('This view is for algorithm validation. Tire coefficients and game-slider mappings are calibration priors, not official FH6 values.')}
      </div>
      {!carParams || !input || !output ? (
        <div className="alert alert-info" role="status">{t('Select or load a car with parameters before calculating a developer tune.')}</div>
      ) : (
        <>
          <div className="row g-3">
            <div className="col-12 col-xl-5">
              <DevInputPanel
                carName={carName}
                carParams={carParams}
                raceGoal={developer.raceGoal}
                surface={developer.surface}
                targetTopSpeedKmh={developer.targetTopSpeedKmh}
                targetRideFrequencyFrontHz={developer.targetRideFrequencyFrontHz}
                targetRideFrequencyRearHz={developer.targetRideFrequencyRearHz}
                dampingRatioFront={developer.dampingRatioFront}
                dampingRatioRear={developer.dampingRatioRear}
                t={t}
                onRaceGoalChange={updateRaceGoal}
                onSurfaceChange={developer.setSurface}
                onTargetTopSpeedChange={developer.setTargetTopSpeedKmh}
                onFrontFrequencyChange={developer.setTargetRideFrequencyFrontHz}
                onRearFrequencyChange={developer.setTargetRideFrequencyRearHz}
                onFrontDampingChange={developer.setDampingRatioFront}
                onRearDampingChange={developer.setDampingRatioRear}
              />
            </div>
            <div className="col-12 col-xl-7">
              <DevOutputPanel output={output} currentStep={developer.step} t={t} />
            </div>
          </div>
          <section className="card">
            <div className="card-body">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2">{t('Warnings and Boundaries')}</h5>
              <ul className="mb-0 ps-3">{output.warnings.map((warning) => <li key={warning} className="text-body-secondary fs-7 mb-1">{warning}</li>)}</ul>
            </div>
          </section>
          {capabilityContract && <CapabilityContractPanel contract={capabilityContract} t={t} />}
          <details className="card mb-3">
            <summary className="card-body fw-bold text-primary">{t('Raw typed input/output JSON')}</summary>
            <pre className="card-body pt-0 mb-0 small text-body-secondary overflow-auto">{JSON.stringify({ input, capabilityContract, output }, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
};

const TuningViewDev: React.FC<TuningViewDevProps> = props => (
  <TuneSessionBoundary><TuningViewDevContent {...props} /></TuneSessionBoundary>
);

export default TuningViewDev;
