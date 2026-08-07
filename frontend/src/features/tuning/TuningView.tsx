import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCarParams, CarParams } from '../../context/CarParamsContext';
import { calculateAEGOGearing, calculateChassisTuning, calculateStaticTireAlignment, Season } from '../../utils/tuningMath';
import { useSettings } from '../../context/SettingsContext';
import { Step1GoalSetup } from './components/Step1GoalSetup';
import { Step2GearboxSetup } from './components/Step2GearboxSetup';
import { Step3ChassisTuner } from './components/Step3ChassisTuner';
import { Step4TireAlignSetup } from './components/Step4TireAlignSetup';
import { Step5TelemetryCalibration } from './components/Step5TelemetryCalibration';

interface GearingTuning {
  finalDrive: number;
  gears: number[];
  maxRpm: number;
  simulatedTopSpeed?: number;
  softMaxSpeed?: number;
}

interface TuningState {
  gearing: GearingTuning;
}

const initialTuning = (numGears: number): TuningState => ({
  gearing: {
    finalDrive: 3.40,
    gears: Array(numGears).fill(0).map((_, i) => [2.89, 1.99, 1.49, 1.16, 0.94, 0.78, 0.68, 0.60, 0.54, 0.50][i] || 0.50),
    maxRpm: 8000
  }
});



interface TuningViewProps {
  currentStep?: number;
  setCurrentStep?: (step: number | ((prev: number) => number)) => void;
  setActiveTab?: (tab: any) => void;
}

const TuningView: React.FC<TuningViewProps> = ({ currentStep: propStep, setCurrentStep: propSetStep, setActiveTab }) => {
  const { carId, carName, carParams, setCarParams, saveCarParams } = useCarParams();
  const { t } = useSettings();

  // Wizard Steps Internal Fallback State
  const [internalStep, setInternalStep] = useState<number>(1);
  const currentStep = propStep !== undefined ? propStep : internalStep;
  const setCurrentStep = propSetStep !== undefined ? propSetStep : setInternalStep;

  const [selectedRaceGoal, setSelectedRaceGoal] = useState<string>('Road');
  const [season, setSeason] = useState<Season>('Summer');

  const numGears = carParams?.adjustability?.gears || 6;
  const [tuning, setTuning] = useState<TuningState>(() => initialTuning(numGears));
  const [savedTunings, setSavedTunings] = useState<string[]>([]);

  const latestCarIdRef = useRef(carId);
  useEffect(() => {
    latestCarIdRef.current = carId;
  }, [carId]);

  // Reset/load baseline on car selection
  useEffect(() => {
    if (carId) {
      setTuning(initialTuning(numGears));
      fetchTunings();
      loadLastTuning();
    }
  }, [carId, numGears]);

  // Sync maxRpm with engine spec
  useEffect(() => {
    if (carParams?.maxHpRpm) {
      setTuning(prev => ({
        ...prev,
        gearing: {
          ...prev.gearing,
          maxRpm: Math.round(carParams.maxHpRpm * 1.15)
        }
      }));
    }
  }, [carParams]);

  // Inherited calculations across steps
  const chassisResult = useMemo(() => {
    if (!carParams) return null;
    return calculateChassisTuning(selectedRaceGoal, carParams);
  }, [selectedRaceGoal, carParams]);

  const tireAlignResult = useMemo(() => {
    if (!carParams) return null;
    return calculateStaticTireAlignment(selectedRaceGoal, season, carParams);
  }, [selectedRaceGoal, season, carParams]);

  const fetchTunings = async () => {
    if (!carId) return;
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/tunings/${carId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSavedTunings(data.filter((t: string) => t.includes('gearing_')));
      }
    } catch (e) {}
  };

  const loadLastTuning = async () => {
    const last = localStorage.getItem(`last_tuning_${carId}`);
    if (last) {
      loadTuning(last);
    }
  };

  const loadTuning = async (fullName: string) => {
    if (!fullName) return;
    const parts = fullName.split('-');
    const cid = parts[0];
    const sname = parts.slice(1).join('-');
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/tunings/${cid}/${sname}`);
      const data = await res.json();
      if (!data.error && latestCarIdRef.current === cid) {
        setTuning(data);
        localStorage.setItem(`last_tuning_${cid}`, fullName);
      }
    } catch (e) {}
  };

  const updateParam = (field: keyof CarParams, value: any) => {
    if (!carParams) return;
    setCarParams({
      ...carParams,
      [field]: value
    });
  };

  const updateSection = (section: any, field: string, value: any) => {
    setTuning(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof tuning],
        [field]: value
      }
    }));
  };

  const applyScientificGearing = () => {
    if (!carParams) return;
    const result = calculateAEGOGearing(
      selectedRaceGoal,
      numGears,
      carParams,
      tuning.gearing.maxRpm,
      {
        simulatedTopSpeed: tuning.gearing.simulatedTopSpeed,
        softMaxSpeed: tuning.gearing.softMaxSpeed
      }
    );

    setTuning(prev => ({
      ...prev,
      gearing: {
        ...prev.gearing,
        finalDrive: result.finalDrive,
        gears: result.gears
      }
    }));
  };

  useEffect(() => {
    if (!carParams) return;
    const result = calculateAEGOGearing(
      selectedRaceGoal,
      numGears,
      carParams,
      tuning.gearing.maxRpm,
      {
        simulatedTopSpeed: tuning.gearing.simulatedTopSpeed,
        softMaxSpeed: tuning.gearing.softMaxSpeed
      }
    );

    setTuning(prev => {
      if (
        prev.gearing.finalDrive === result.finalDrive &&
        JSON.stringify(prev.gearing.gears) === JSON.stringify(result.gears)
      ) {
        return prev;
      }
      return {
        ...prev,
        gearing: {
          ...prev.gearing,
          finalDrive: result.finalDrive,
          gears: result.gears
        }
      };
    });
  }, [selectedRaceGoal, numGears, carParams, tuning.gearing.maxRpm, tuning.gearing.simulatedTopSpeed, tuning.gearing.softMaxSpeed]);

  const hasCoreParams = Boolean(carParams && carParams.weight > 0 && carParams.weight_distribution > 0);
  const [showParamsPopover, setShowParamsPopover] = useState<boolean>(!hasCoreParams);

  useEffect(() => {
    if (!hasCoreParams) {
      setShowParamsPopover(true);
    }
  }, [hasCoreParams]);

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto">
      
      {/* Standardized Header Banner (Aligned with OverlayView) */}
      <div className="border-bottom pb-3 mb-2 flex-shrink-0">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              <h2 className="text-primary fs-4 fw-bold m-0" style={{ letterSpacing: '0.5px' }}>
                {t("Tuning Wizard")}
              </h2>
              <div 
                className="position-relative d-inline-flex align-items-center gap-1"
                onClick={() => { if (!hasCoreParams) setShowParamsPopover(prev => !prev); }}
                onMouseEnter={() => { if (!hasCoreParams) setShowParamsPopover(true); }}
                onMouseLeave={() => { if (!hasCoreParams) setShowParamsPopover(false); }}
                style={{ cursor: !hasCoreParams ? 'pointer' : 'default' }}
              >
                <span className="badge text-bg-secondary fs-7">{carName} (ID: {carId})</span>
                {!hasCoreParams && (
                  <span className="badge text-bg-warning fs-7">{t("PARAMS INCOMPLETE")}</span>
                )}

                {!hasCoreParams && showParamsPopover && (
                  <div 
                    className="popover bs-popover-bottom show glass-panel shadow-lg border"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      zIndex: 1050,
                      minWidth: '320px',
                      backdropFilter: 'blur(16px)',
                      background: 'var(--glass-bg)',
                      borderColor: 'var(--bs-warning)',
                      cursor: 'default'
                    }}
                    role="tooltip"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div 
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        left: '20px',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderBottom: '6px solid var(--bs-warning)'
                      }} 
                    />
                    <div className="popover-header bg-transparent border-bottom border-secondary border-opacity-25 px-3 py-2 text-warning fw-bold fs-7 d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center gap-2">
                        <span>{t("Vehicle Parameters Required")}</span>
                        <span className="badge text-bg-warning">REQUIRED</span>
                      </div>
                      <button
                        type="button"
                        className="btn-close btn-sm"
                        aria-label="Close"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowParamsPopover(false);
                        }}
                      ></button>
                    </div>
                    <div className="popover-body px-3 py-2 text-start">
                      <div className="fs-7 text-body fw-medium">
                        {t("Basic physics parameters (Vehicle Weight / Distribution) are missing.")}
                      </div>
                      <div className="fs-8 text-secondary mt-1 mb-2">
                        {t("Complete them in Step 1 or Car Parameters tab to perform calculations.")}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-warning btn-sm fw-bold w-100"
                        onClick={() => {
                          setShowParamsPopover(false);
                          setActiveTab?.('car_params');
                        }}
                      >
                        {t("Go to Car Parameters")} &gt;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-body-secondary fs-7 mb-0" style={{ lineHeight: '1.4' }}>
              {t("Scientific physics-based suspension, spring, ARB, damper & AEGO gearing tuning wizard")}
            </p>
          </div>
          
          <div className="d-flex gap-2">
            {currentStep > 1 && (
              <button 
                type="button"
                className="btn btn-outline-secondary fw-bold px-3 py-2"
                onClick={() => setCurrentStep(prev => prev - 1)} 
              >
                &lt; {t("Previous")}
              </button>
            )}

            {currentStep < 5 && (
              <span title={!hasCoreParams ? t("Please set basic vehicle parameters in Step 1 to proceed.") : undefined}>
                <button
                  type="button"
                  className="btn btn-primary fw-bold px-4 py-2"
                  onClick={() => {
                    if (currentStep === 1) applyScientificGearing();
                    setCurrentStep(prev => prev + 1);
                  }}
                  disabled={!hasCoreParams}
                >
                  {t("Next")} &gt;
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Wizard Stepper Nav Pills */}
        <ul className="nav nav-pills nav-justified gap-2 bg-body-tertiary p-1.5 rounded border">
          <li className="nav-item">
            <button 
              className={`nav-link btn-sm d-flex align-items-center justify-content-center gap-2 ${currentStep === 1 ? 'active fw-bold' : ''}`}
              onClick={() => setCurrentStep(1)}
            >
              <span className="badge text-bg-secondary">1</span> {t("Goal & Setup")}
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link btn-sm d-flex align-items-center justify-content-center gap-2 ${currentStep === 2 ? 'active fw-bold' : ''}`}
              disabled={!hasCoreParams}
              onClick={() => hasCoreParams && setCurrentStep(2)}
            >
              <span className="badge text-bg-secondary">2</span> {t("Gearbox")}
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link btn-sm d-flex align-items-center justify-content-center gap-2 ${currentStep === 3 ? 'active fw-bold' : ''}`}
              disabled={!hasCoreParams}
              onClick={() => hasCoreParams && setCurrentStep(3)}
            >
              <span className="badge text-bg-secondary">3</span> {t("Chassis")}
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link btn-sm d-flex align-items-center justify-content-center gap-2 ${currentStep === 4 ? 'active fw-bold' : ''}`}
              disabled={!hasCoreParams}
              onClick={() => hasCoreParams && setCurrentStep(4)}
            >
              <span className="badge text-bg-secondary">4</span> {t("Tire & Alignment")}
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link btn-sm d-flex align-items-center justify-content-center gap-2 ${currentStep === 5 ? 'active fw-bold' : ''}`}
              disabled={!hasCoreParams}
              onClick={() => hasCoreParams && setCurrentStep(5)}
            >
              <span className="badge text-bg-secondary">5</span> {t("Telemetry Calibration")}
            </button>
          </li>
        </ul>
      </div>

      {/* Step Content Area Container */}
      <div className="flex-grow-1 overflow-auto p-2">
        {currentStep === 1 && (
          <Step1GoalSetup
            selectedRaceGoal={selectedRaceGoal}
            setSelectedRaceGoal={setSelectedRaceGoal}
            season={season}
            setSeason={setSeason}
            carParams={carParams}
            updateParam={updateParam}
            saveCarParams={saveCarParams}
            hasCoreParams={hasCoreParams}
          />
        )}

        {currentStep === 2 && (
          <Step2GearboxSetup
            tuning={tuning}
            updateSection={updateSection}
            numGears={numGears}
            savedTunings={savedTunings}
            loadTuning={loadTuning}
            carParams={carParams}
          />
        )}

        {currentStep === 3 && (
          <Step3ChassisTuner
            selectedRaceGoal={selectedRaceGoal}
            carParams={carParams}
            saveCarParams={saveCarParams}
          />
        )}

        {currentStep === 4 && (
          <Step4TireAlignSetup
            selectedRaceGoal={selectedRaceGoal}
            season={season}
            carParams={carParams}
            onNextStep={() => setCurrentStep(5)}
          />
        )}

        {currentStep === 5 && (
          <Step5TelemetryCalibration
            selectedRaceGoal={selectedRaceGoal}
            carParams={carParams}
            chassisTuning={chassisResult}
            alignment={tireAlignResult}
            targetPhot={tireAlignResult?.targetPhot || 32.5}
          />
        )}
      </div>

    </div>
  );
};

export default TuningView;

