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

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  padding: '0.4rem 1rem',
  fontSize: '0.85rem',
  transition: 'all 0.2s ease'
};

const TuningView: React.FC<{ setActiveTab?: (tab: any) => void }> = () => {
  const { carId, carName, carParams, setCarParams, saveCarParams } = useCarParams();
  const { t } = useSettings();

  // Wizard Steps State
  const [currentStep, setCurrentStep] = useState<number>(1);
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

  // Auto-calculate AEGO gearing whenever race goal, vehicle params, gear count, max RPM or secondary corrections change
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

  // Stepper Header Button Style
  const stepHeaderStyle = (stepNum: number) => ({
    padding: '0.5rem 0.9rem',
    background: currentStep === stepNum
      ? 'var(--primary)'
      : currentStep > stepNum
        ? 'var(--primary-glow)'
        : 'var(--surface-1)',
    color: currentStep === stepNum
      ? '#ffffff'
      : currentStep > stepNum
        ? 'var(--primary)'
        : 'var(--text-secondary)',
    border: currentStep === stepNum
      ? '1px solid var(--primary)'
      : currentStep > stepNum
        ? '1px solid var(--primary)'
        : '1px solid var(--glass-border)',
    borderRadius: '20px',
    fontWeight: 'bold',
    fontSize: '0.8rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    cursor: stepNum === 1 || hasCoreParams ? 'pointer' : 'not-allowed',
    transition: 'all 0.3s ease',
    boxShadow: currentStep === stepNum ? '0 0 12px var(--primary-glow)' : 'none'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflow: 'hidden' }}>
      
      {/* Stepper Navigation Header */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '1rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.1rem' }}>{t("Tuning Wizard")}</span>
            <span style={{ color: 'gray' }}>|</span>
            <span style={{ color: 'white', fontWeight: 600 }}>{carName} (ID: {carId})</span>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentStep > 1 && (
              <button 
                type="button"
                onClick={() => setCurrentStep(prev => prev - 1)} 
                style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                &lt; {t("Previous")}
              </button>
            )}

            {currentStep < 5 && (
              <span title={!hasCoreParams ? t("Please set basic vehicle parameters in Step 1 to proceed.") : undefined}>
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep === 1) applyScientificGearing();
                    setCurrentStep(prev => prev + 1);
                  }}
                  disabled={!hasCoreParams}
                  style={{
                    ...btnStyle,
                    background: !hasCoreParams ? 'gray' : 'var(--primary)',
                    color: !hasCoreParams ? 'rgba(255,255,255,0.4)' : 'black',
                    cursor: !hasCoreParams ? 'not-allowed' : 'pointer'
                  }}
                >
                  {t("Next")} &gt;
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Wizard Stepper Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={stepHeaderStyle(1)} onClick={() => setCurrentStep(1)}>1. {t("Goal & Setup")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.4rem' }} />
          <div style={stepHeaderStyle(2)} onClick={() => hasCoreParams && setCurrentStep(2)}>2. {t("Gearbox")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.4rem' }} />
          <div style={stepHeaderStyle(3)} onClick={() => hasCoreParams && setCurrentStep(3)}>3. {t("Chassis")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.4rem' }} />
          <div style={stepHeaderStyle(4)} onClick={() => hasCoreParams && setCurrentStep(4)}>4. {t("Tire & Alignment")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.4rem' }} />
          <div style={stepHeaderStyle(5)} onClick={() => hasCoreParams && setCurrentStep(5)}>5. {t("Telemetry Calibration")}</div>
        </div>
      </div>

      {/* Step Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.2rem' }}>
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
