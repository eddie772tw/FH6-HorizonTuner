import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCarParams, CarParams } from '../../context/CarParamsContext';
import { calculateWorkflowTuning, resolveWorkflowGearingCorrection, toTuningCarParams, Season, type GearingResult, type GearingCorrectionMode } from '../../utils/tuningMath';
import { TuningMeasurementStep } from './components/TuningMeasurementStep';
import { TuningPreparedStatus } from './components/TuningPreparedStatus';
import type { TuningMeasurementState } from './tuningMeasurement';
import { ScopedUnitSettingsProvider, useSettings } from '../../context/SettingsContext';
import { Step1GoalSetup } from './components/Step1GoalSetup';
import { Step2GearboxSetup } from './components/Step2GearboxSetup';
import { Step3ChassisTuner } from './components/Step3ChassisTuner';
import { TireBaselineStep } from './components/TireBaselineStep';
import { WheelAlignmentStep } from './components/WheelAlignmentStep';
import { TuningWorkflowNavigation } from './components/TuningWorkflowNavigation';
import { getWorkflowReadiness, resolveTuningStep, serializeWorkflowProfile } from './tuningWorkflow';
import { DifferentialSetup } from './components/DifferentialSetup';
import { Step5TelemetryCalibration } from './components/Step5TelemetryCalibration';
import { backendFetch } from '../../services/backend';
import { UnitSettingsSidebar } from '../../components/UnitSettingsSidebar';
import { createGranularUnitPreference, loadGranularUnitPreference, resolveGranularUnitPreference, type GranularUnitPreference } from '../../utils/gameUnitSettings';

interface GearingTuning {
  finalDrive: number;
  gears: number[];
  maxRpm: number;
  simulatedTopSpeed?: number;
  softMaxSpeed?: number;
  targetSpeedKmh?: number;
  targetRpm?: number;
  targetFit?: GearingResult['targetFit'];
  correctionMode?: GearingCorrectionMode;
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

interface TuningViewContentProps extends TuningViewProps {
  unitPreference: GranularUnitPreference;
  onUnitPreferenceChange: (preference: GranularUnitPreference) => void;
}

const TuningViewContent: React.FC<TuningViewContentProps> = ({
  currentStep: propStep,
  setCurrentStep: propSetStep,
  setActiveTab,
  unitPreference,
  onUnitPreferenceChange
}) => {
  const { carId, carName, carParams, setCarParams, saveCarParams, loadedCarId, isLoading } = useCarParams();
  const { t } = useSettings();

  // Wizard Steps Internal Fallback State
  const [internalStep, setInternalStep] = useState<number>(1);
  const currentStep = propStep !== undefined ? propStep : internalStep;
  const setCurrentStep = propSetStep !== undefined ? propSetStep : setInternalStep;

  const [selectedRaceGoal, setSelectedRaceGoal] = useState<string>('Road');
  const [season, setSeason] = useState<Season>('Summer');
  const [showUnitSettings, setShowUnitSettings] = useState(false);

  const numGears = carParams?.adjustability?.gears || 6;
  const [tuning, setTuning] = useState<TuningState>(() => initialTuning(numGears));
  const [savedTunings, setSavedTunings] = useState<string[]>([]);
  const [measurement, setMeasurement] = useState<{ key: string; data: TuningMeasurementState; profile: CarParams } | null>(null);
  const profileReady = loadedCarId === carId && !isLoading;
  const staticProfileJson = useMemo(() => serializeWorkflowProfile(carParams), [carParams]);
  const preparationKey = useMemo(() => JSON.stringify([carId, staticProfileJson]), [carId, staticProfileJson]);
  const prepared = profileReady && measurement?.key === preparationKey ? measurement.data : null;
  useEffect(() => {
    if (measurement && measurement.key !== preparationKey) setMeasurement(null);
  }, [measurement, preparationKey]);
  const solverCarParams = useMemo(() => measurement && prepared ? {
    ...toTuningCarParams(measurement.profile), maxHpRpm: prepared.observedPeakPower!.rpm, maxTorqueRpm: prepared.observedPeakTorque!.rpm
  } : null, [measurement, prepared]);
  const engineMaxRpm = prepared?.engineMaxRpm ?? 8000;

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

  // The normal workflow reads the engine limit; it never asks for a desired RPM.
  useEffect(() => {
    setTuning(prev => prev.gearing.maxRpm === engineMaxRpm ? prev : ({
      ...prev, gearing: { ...prev.gearing, maxRpm: engineMaxRpm }
    }));
  }, [carId, numGears, engineMaxRpm, tuning.gearing.maxRpm]);

  const staticCarParams = useMemo(() => {
    const profile = JSON.parse(staticProfileJson) as CarParams | null;
    return profileReady && profile ? toTuningCarParams(profile) : null;
  }, [profileReady, staticProfileJson]);
  const workflow = useMemo(() => staticCarParams ? calculateWorkflowTuning(
    selectedRaceGoal, season, staticCarParams, numGears,
    prepared ? { maxRpm: prepared.engineMaxRpm!, maxHpRpm: prepared.observedPeakPower!.rpm,
      maxTorqueRpm: prepared.observedPeakTorque!.rpm } : null,
    resolveWorkflowGearingCorrection(tuning.gearing)
  ) : null, [staticCarParams, selectedRaceGoal, season, numGears, prepared,
    tuning.gearing.correctionMode, tuning.gearing.simulatedTopSpeed, tuning.gearing.softMaxSpeed,
    tuning.gearing.targetSpeedKmh, tuning.gearing.targetRpm]);
  const chassisResult = workflow?.chassis ?? null;
  const tireAlignResult = workflow?.alignment ?? null;

  const fetchTunings = async () => {
    if (!carId) return;
    try {
      const res = await backendFetch(`/api/tunings/${carId}`);
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
      const res = await backendFetch(`/api/tunings/${cid}/${sname}`);
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

  useEffect(() => {
    const result = workflow?.gearing;
    if (!result) return;

    setTuning(prev => {
      if (
        prev.gearing.finalDrive === result.finalDrive &&
        JSON.stringify(prev.gearing.gears) === JSON.stringify(result.gears) &&
        JSON.stringify(prev.gearing.targetFit) === JSON.stringify(result.targetFit)
      ) {
        return prev;
      }
      return {
        ...prev,
        gearing: {
          ...prev.gearing,
          finalDrive: result.finalDrive,
          gears: result.gears,
          targetFit: result.targetFit
        }
      };
    });
  }, [workflow?.gearing]);

  const readiness = getWorkflowReadiness(profileReady, carParams, Boolean(prepared && workflow?.gearing));
  const { mechanical: hasCoreParams, engineInputs: hasEngineInputs, measuredEngine: hasPreparedInputs } = readiness;
  useEffect(() => {
    const resolved = resolveTuningStep(currentStep, {
      mechanical: hasCoreParams, engineInputs: hasEngineInputs, measuredEngine: hasPreparedInputs
    });
    if (resolved !== currentStep) setCurrentStep(resolved);
  }, [hasCoreParams, hasEngineInputs, hasPreparedInputs, currentStep, setCurrentStep]);
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
                        <span className="badge text-bg-warning">{t("REQUIRED")}</span>
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
                        {t("Weight or front weight percentage is missing or invalid.")}
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
          
        </div>
        <TuningWorkflowNavigation currentStep={currentStep} readiness={readiness} onSelect={setCurrentStep} />
      </div>

      {/* Step Content Area Container */}
      <div className="flex-grow-1 overflow-auto p-2">
        {prepared && <TuningPreparedStatus measurement={prepared} onInvalidate={() => setMeasurement(null)} />}
        {currentStep === 1 && (
          <Step1GoalSetup
            selectedRaceGoal={selectedRaceGoal}
            setSelectedRaceGoal={setSelectedRaceGoal}
            season={season}
            setSeason={setSeason}
            carParams={carParams}
            updateParam={updateParam}
            hasCoreParams={hasCoreParams}
            onOpenUnitSettings={() => setShowUnitSettings(true)}
            onProceed={async () => {
              await saveCarParams();
              setCurrentStep(2);
            }}
          />
        )}

        {currentStep === 5 && hasCoreParams && workflow && staticCarParams && (
          <div className="mb-3"><DifferentialSetup diff={workflow.chassis.diff} drivetrain={staticCarParams.drivetrain} /></div>
        )}
        {currentStep === 5 && !hasPreparedInputs && (
          <TuningMeasurementStep key={preparationKey} carId={carId} enabled={hasEngineInputs}
            onComplete={data => { if (carParams) setMeasurement({ key: preparationKey, data, profile: carParams }); }} />
        )}
        {currentStep === 5 && hasPreparedInputs && (
          <>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setMeasurement(null)}>{t('Collect driving data again')}</button>
          </div>
          <Step2GearboxSetup
            tuning={tuning}
            updateSection={updateSection}
            numGears={numGears}
            savedTunings={savedTunings}
            loadTuning={loadTuning}
            carParams={solverCarParams}
          />
          </>
        )}

        {currentStep === 2 && hasCoreParams && workflow && <TireBaselineStep tires={workflow.tires} />}

        {currentStep === 3 && hasCoreParams && (
          <Step3ChassisTuner
            selectedRaceGoal={selectedRaceGoal}
            tuningResult={chassisResult}
            saveCarParams={saveCarParams}
          />
        )}

        {currentStep === 4 && hasCoreParams && workflow && (
          <WheelAlignmentStep alignment={workflow.alignment} springs={workflow.chassis.springs} />
        )}

        {currentStep === 6 && hasPreparedInputs && (
          <Step5TelemetryCalibration
            gearing={tuning.gearing}
            carId={carId}
            selectedRaceGoal={selectedRaceGoal}
            carParams={solverCarParams}
            chassisTuning={chassisResult}
            alignment={tireAlignResult}
            targetPhot={tireAlignResult?.targetPhot || 32.5}
          />
        )}
      </div>
      <UnitSettingsSidebar
        idPrefix="tuning-units"
        mode="granular"
        show={showUnitSettings}
        title={t("Tuning Workflow Unit Settings")}
        preference={unitPreference}
        onChange={onUnitPreferenceChange}
        onClose={() => setShowUnitSettings(false)}
      />
    </div>
  );
};

const TUNING_UNIT_STORAGE_KEY = 'tuning_unit_preference';

const TuningView: React.FC<TuningViewProps> = props => {
  const { settings } = useSettings();
  const [unitPreference, setUnitPreference] = useState<GranularUnitPreference>(() =>
    loadGranularUnitPreference(TUNING_UNIT_STORAGE_KEY, settings.units)
  );
  const scopedUnits = useMemo(
    () => resolveGranularUnitPreference(settings.units, unitPreference),
    [settings.units, unitPreference]
  );

  const updateUnitPreference = (preference: GranularUnitPreference) => {
    const normalized = unitPreference.followGlobal && !preference.followGlobal
      ? { ...createGranularUnitPreference(settings.units), followGlobal: false }
      : preference;
    setUnitPreference(normalized);
    localStorage.setItem(TUNING_UNIT_STORAGE_KEY, JSON.stringify(normalized));
  };

  return (
    <ScopedUnitSettingsProvider units={scopedUnits}>
      <TuningViewContent {...props} unitPreference={unitPreference} onUnitPreferenceChange={updateUnitPreference} />
    </ScopedUnitSettingsProvider>
  );
};

export default TuningView;

