import React, { useState, useEffect, useRef } from 'react';
import { useCarParams, CarParams } from '../../context/CarParamsContext';
import { 
  calculateAEGOGearing,
  calcGearSpeed,
  calcGearRpm
} from '../../utils/tuningMath';
import { useSettings } from '../../context/SettingsContext';
import { GearingTuner } from './components/GearingTuner';

const TIRE_RADIUS_M = 0.32;

interface GearingTuning {
  finalDrive: number;
  gears: number[];
  maxRpm: number;
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

const TuningView: React.FC<{ setActiveTab?: (tab: any) => void }> = () => {
  const { carId, carName, carParams, setCarParams, saveCarParams } = useCarParams();
  const { settings, convertSpeed, t } = useSettings();

  // Wizard Steps
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedRaceGoal, setSelectedRaceGoal] = useState<string>('Road');
  const [tuningMode, setTuningMode] = useState<'recommended' | 'custom'>('recommended');
  const [pMin, setPMin] = useState<number>(0.40);
  const [pMax, setPMax] = useState<number>(0.65);

  // Gearing states
  const [gearingMethod, setGearingMethod] = useState<'scientific' | 'custom'>('scientific');
  const [customGearingModel, setCustomGearingModel] = useState<string>('Basic Linear');
  const [gearingDiscipline, setGearingDiscipline] = useState<'GT' | 'Rally' | 'Drift' | 'Custom'>('GT');
  const [basicCustomP, setBasicCustomP] = useState<number>(0.5);

  const numGears = carParams?.adjustability?.gears || 6;
  const [tuning, setTuning] = useState<TuningState>(() => initialTuning(numGears));
  const [savedTunings, setSavedTunings] = useState<string[]>([]);

  const latestCarIdRef = useRef(carId);
  useEffect(() => {
    latestCarIdRef.current = carId;
  }, [carId]);

  // Load baseline on car select
  useEffect(() => {
    if (carId) {
      setTuning(initialTuning(numGears));
      fetchTunings();
      loadLastTuning();
    }
  }, [carId, numGears]);

  // Sync maxRpm
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

  // Sync Gearing Discipline, default P value, and narrow range with selectedRaceGoal
  useEffect(() => {
    if (selectedRaceGoal === 'Rally' || selectedRaceGoal === 'DangerSign') {
      setGearingDiscipline('Rally');
      setBasicCustomP(0.7);
      setPMin(0.60);
      setPMax(0.80);
    } else if (selectedRaceGoal === 'Drift') {
      setGearingDiscipline('Drift');
      setBasicCustomP(0.4);
      setPMin(0.30);
      setPMax(0.50);
    } else if (selectedRaceGoal === 'Touge') {
      setGearingDiscipline('GT');
      setBasicCustomP(0.6);
      setPMin(0.50);
      setPMax(0.70);
    } else {
      // Road, SpeedZone
      setGearingDiscipline('GT');
      setBasicCustomP(0.5);
      setPMin(0.40);
      setPMax(0.65);
    }
  }, [selectedRaceGoal]);

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

  const updateSection = (section: keyof typeof tuning, field: string, value: any) => {
    setTuning(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof tuning],
        [field]: value
      }
    }));
  };

  // Automated Gearing Logic
  const getLimits = () => {
    return {
      finalDriveMin: 2.0,
      finalDriveMax: 6.5,
      gearMin: 0.3,
      gearMax: 6.0
    };
  };

  const getBasicPreviewGear = (idx: number, numGears: number) => {
    const limits = getLimits();
    const g1 = 2.89;
    const g_top = 0.50;
    const x = idx / (numGears - 1);
    const fx = Math.pow(x, basicCustomP);
    return Math.max(limits.gearMin, Math.min(limits.gearMax, g1 * Math.pow(g_top / g1, fx)));
  };

  const applyBasicGearing = () => {
    const limits = getLimits();
    const newGears = [...tuning.gearing.gears];
    const g1 = tuning.gearing.gears[0];
    const g_top = tuning.gearing.gears[numGears - 1];

    for (let i = 1; i < numGears - 1; i++) {
      const x = i / (numGears - 1);
      const fx = Math.pow(x, basicCustomP);
      newGears[i] = Math.max(limits.gearMin, Math.min(limits.gearMax, g1 * Math.pow(g_top / g1, fx)));
    }
    setTuning(prev => ({
      ...prev,
      gearing: {
        ...prev.gearing,
        gears: newGears.map(g => Number(g.toFixed(2)))
      }
    }));
  };

  const getTheoreticalYi = (i: number, numGears: number) => {
    if (!carParams || numGears < 2 || i >= numGears - 1) {
      return tuning.gearing.maxRpm * 0.7;
    }
    const result = calculateAEGOGearing(
      selectedRaceGoal,
      numGears,
      carParams,
      tuning.gearing.maxRpm
    );
    const gCurr = result.gears[i];
    const gNext = result.gears[i + 1];
    if (!gCurr || !gNext) return tuning.gearing.maxRpm * 0.7;
    return tuning.gearing.maxRpm * (gNext / gCurr);
  };

  const applyScientificGearing = () => {
    if (!carParams) return;
    const result = calculateAEGOGearing(
      selectedRaceGoal,
      numGears,
      carParams,
      tuning.gearing.maxRpm
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

  const generateBaselineTuning = () => {
    if (!carParams || carParams.weight <= 0 || carParams.weight_distribution <= 0) {
      return;
    }
    applyScientificGearing();
  };

  // Pure functions used for chart speed/RPM calculations
  const calcSpeed = (rpm: number, gearRatio: number) => {
    const speedMs = calcGearSpeed(rpm, gearRatio, tuning.gearing.finalDrive, TIRE_RADIUS_M);
    return convertSpeed(speedMs).value;
  };
  const calcRpm = (speed: number, gearRatio: number) => {
    const speedMs = settings.units.speed === 'mph' ? speed / 2.23694 : speed / 3.6;
    return calcGearRpm(speedMs, gearRatio, tuning.gearing.finalDrive, TIRE_RADIUS_M);
  };

  const chartData: any[] = [{ speed: 0, gear1: 0, currentEnvelope: 0, theoreticalEnvelope: 0, basicPreviewEnvelope: 0 }];
  for (let i = 0; i < numGears; i++) {
    const gearRatio = tuning.gearing.gears[i];
    if (gearRatio <= 0) continue;
    const maxSpeedForGear = calcSpeed(tuning.gearing.maxRpm, gearRatio);
    const endPoint: any = { speed: maxSpeedForGear };
    endPoint[`gear${i + 1}`] = tuning.gearing.maxRpm;
    if (i + 1 < numGears && tuning.gearing.gears[i + 1] > 0 && tuning.gearing.gears[i + 1] < tuning.gearing.gears[i]) {
      endPoint[`gear${i + 2}`] = calcRpm(maxSpeedForGear, tuning.gearing.gears[i + 1]);
      endPoint.currentEnvelope = tuning.gearing.maxRpm * (tuning.gearing.gears[i + 1] / gearRatio);
      endPoint.theoreticalEnvelope = getTheoreticalYi(i, numGears);
      endPoint.basicPreviewEnvelope = tuning.gearing.maxRpm * (getBasicPreviewGear(i + 1, numGears) / getBasicPreviewGear(i, numGears));
    }
    chartData.push(endPoint);
  }

  const maxSpeed = chartData.length > 0 ? Math.max(...chartData.map(d => d.speed)) : 400;
  const xMax = Math.max(100, Math.ceil(maxSpeed / 50) * 50);
  const yMax = Math.ceil((tuning.gearing.maxRpm + 500) / 1000) * 1000;

  // Stepper Header Styles
  const stepHeaderStyle = (stepNum: number) => ({
    padding: '0.6rem 1.2rem',
    background: currentStep === stepNum 
      ? 'var(--primary)' 
      : currentStep > stepNum 
        ? 'rgba(0, 230, 118, 0.15)' 
        : 'rgba(255,255,255,0.03)',
    color: currentStep === stepNum 
      ? 'black' 
      : currentStep > stepNum 
        ? '#00e676' 
        : 'var(--text-secondary)',
    border: currentStep === stepNum 
      ? '1px solid var(--primary)' 
      : currentStep > stepNum 
        ? '1px solid rgba(0, 230, 118, 0.3)' 
        : '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    cursor: stepNum <= 2 ? 'pointer' : 'not-allowed',
    transition: 'all 0.3s ease',
    boxShadow: currentStep === stepNum ? '0 0 12px rgba(0, 180, 255, 0.3)' : 'none'
  });

  const hasCoreParams = carParams && carParams.weight > 0 && carParams.weight_distribution > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflow: 'hidden' }}>
      
      {/* Stepper Header */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '1rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.1rem' }}>🛠️ {t("Tuning Wizard")}</span>
            <span style={{ color: 'gray' }}>|</span>
            <span style={{ color: 'white', fontWeight: 600 }}>{carName} (ID: {carId})</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentStep > 1 && (
              <button 
                onClick={() => setCurrentStep(prev => prev - 1)} 
                style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                ◀ {t("Previous")}
              </button>
            )}
            {currentStep === 1 && (
              <span title={!hasCoreParams ? t("Please set basic vehicle parameters in step 1 to proceed.") : undefined}>
                <button
                  onClick={() => {
                    generateBaselineTuning();
                    setCurrentStep(2);
                  }}
                  disabled={!hasCoreParams}
                  style={{
                    ...btnStyle,
                    background: !hasCoreParams ? 'gray' : 'var(--primary)',
                    color: !hasCoreParams ? 'rgba(255,255,255,0.4)' : 'black',
                    cursor: !hasCoreParams ? 'not-allowed' : 'pointer'
                  }}
                >
                  {t("Next")} ▶
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Wizard Stepper Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={stepHeaderStyle(1)} onClick={() => setCurrentStep(1)}>1. {t("Goal & Setup")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }} />
          <div style={stepHeaderStyle(2)} onClick={() => hasCoreParams && setCurrentStep(2)}>2. {t("Gearbox Setup")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }} />
          <div style={{ ...stepHeaderStyle(3), opacity: 0.4, cursor: 'not-allowed' }}>3. {t("Chassis Tuning (Refactoring)")}</div>
        </div>
      </div>

      {/* Step Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.2rem' }}>
        
        {/* ================= STEP 1: GOAL & SETUP ================= */}
        {currentStep === 1 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>🎯 Step 1: {t("Define tuning goals & check parameters")}</h3>

            {/* Select Goal */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(0, 180, 255, 0.05)', border: '1px solid rgba(0, 180, 255, 0.15)', padding: '1.2rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>{t("Select Race / Tuning Goal:")}</span>
                <select 
                  value={selectedRaceGoal} 
                  onChange={e => setSelectedRaceGoal(e.target.value)} 
                  style={{ ...inputStyle, width: '280px', border: '1px solid var(--primary)', background: 'black' }}
                >
                  <option value="Road">{t("Road / Circuit")}</option>
                  <option value="Drift">{t("Drift")}</option>
                  <option value="Rally">{t("Rally")}</option>
                  <option value="Drag">{t("Drag")}</option>
                </select>
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.3' }}>
                {selectedRaceGoal === 'Road' && t("Road / Circuit setting optimizes gearbox ratios for balanced acceleration and corner exit speed.")}
                {selectedRaceGoal === 'Drift' && t("Drift configuration focuses gear ratios on powerband retention for continuous wheelspin.")}
                {selectedRaceGoal === 'Rally' && t("Rally mode adjusts transmission for fast acceleration out of tight dirt corners.")}
                {selectedRaceGoal === 'Drag' && t("Drag setting targets maximum launch acceleration and trap speed.")}
              </p>
            </div>

            {/* Vehicle Parameters Form */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)' }}>{t("Vehicle Parameters")}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 2rem' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Weight")} ({settings.units.weight})</label>
                  <input type="number" value={carParams?.weight ? Math.round(settings.units.weight === 'lbs' ? carParams.weight * 2.2046 : carParams.weight) : ''} onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    updateParam('weight', settings.units.weight === 'lbs' ? val / 2.2046 : val);
                  }} style={{ ...inputStyle, width: '120px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Weight Distribution")} (%)</label>
                  <input type="number" value={carParams?.weight_distribution || ''} onChange={e => updateParam('weight_distribution', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="0.1" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Drivetrain")}</label>
                  <select value={carParams?.drivetrain || 'RWD'} onChange={e => updateParam('drivetrain', e.target.value)} style={{ ...inputStyle, width: '120px' }}>
                    <option value="FWD">{t("FWD")}</option>
                    <option value="RWD">{t("RWD")}</option>
                    <option value="AWD">{t("AWD")}</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Tire Compound")}</label>
                  <select value={carParams?.tireType || 'Stock'} onChange={e => updateParam('tireType', e.target.value)} style={{ ...inputStyle, width: '120px' }}>
                    <option value="Stock">{t("Stock")}</option>
                    <option value="Street">{t("Street")}</option>
                    <option value="Sport">{t("Sport")}</option>
                    <option value="Semi-Slick">{t("Semi-Slick")}</option>
                    <option value="Slick">{t("Slick")}</option>
                    <option value="Rally">{t("Rally")}</option>
                    <option value="Off-Road">{t("Off-Road")}</option>
                    <option value="Snow">{t("Snow")}</option>
                    <option value="Drag">{t("Drag")}</option>
                    <option value="Drift">{t("Drift")}</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Max HP")}</label>
                  <input type="number" value={carParams?.maxHp || 0} onChange={e => updateParam('maxHp', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="10" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Max HP RPM (rpm)")}</label>
                  <input type="number" value={carParams?.maxHpRpm || 0} onChange={e => updateParam('maxHpRpm', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="100" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Max Torque")}</label>
                  <input type="number" value={carParams?.maxTorque || 0} onChange={e => updateParam('maxTorque', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="10" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Max Torque RPM (rpm)")}</label>
                  <input type="number" value={carParams?.maxTorqueRpm || 0} onChange={e => updateParam('maxTorqueRpm', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="100" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Gears Count")}</label>
                  <input type="number" value={carParams?.adjustability?.gears || 6} min={4} max={10} onChange={e => {
                    if (!carParams) return;
                    updateParam('adjustability', { ...carParams.adjustability, gears: parseInt(e.target.value) || 6 });
                  }} style={{ ...inputStyle, width: '120px' }} />
                </div>

                {selectedRaceGoal === 'Drift' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Induction")}</label>
                    <select value={carParams?.induction || 'NA'} onChange={e => updateParam('induction', e.target.value)} style={{ ...inputStyle, width: '120px' }}>
                      <option value="NA">{t("Naturally Aspirated (NA)")}</option>
                      <option value="Supercharger">{t("Supercharger")}</option>
                      <option value="Turbo">{t("Single Turbo")}</option>
                      <option value="TwinTurbo">{t("Twin Turbo")}</option>
                    </select>
                  </div>
                )}
                
              </div>

              {/* Tire Specs */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Front Tire (mm/% R in)")}</label>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input type="number" value={carParams?.frontTireWidth || 245} onChange={e => updateParam('frontTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} />
                    <span style={{ color: 'gray' }}>/</span>
                    <input type="number" value={carParams?.frontTireAspect || 40} onChange={e => updateParam('frontTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
                    <span style={{ color: 'gray' }}>R</span>
                    <input type="number" value={carParams?.frontTireRim || 18} onChange={e => updateParam('frontTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Rear Tire (mm/% R in)")}</label>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input type="number" value={carParams?.rearTireWidth || 245} onChange={e => updateParam('rearTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} />
                    <span style={{ color: 'gray' }}>/</span>
                    <input type="number" value={carParams?.rearTireAspect || 40} onChange={e => updateParam('rearTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
                    <span style={{ color: 'gray' }}>R</span>
                    <input type="number" value={carParams?.rearTireRim || 18} onChange={e => updateParam('rearTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={saveCarParams} style={{ ...btnStyle, background: 'var(--primary)', color: 'black', padding: '0.4rem 1.2rem', fontSize: '0.9rem' }}>
                  💾 {t("Save Parameters")}
                </button>
              </div>
            </div>
            
            {!hasCoreParams && (
              <div style={{ padding: '0.8rem', background: 'rgba(255, 61, 0, 0.05)', border: '1px solid #ff3d00', borderRadius: '8px', color: '#ff3d00', fontSize: '0.9rem', textAlign: 'center' }}>
                {t("Tuning calculator requires valid vehicle weight and weight distribution parameters. Please fill them out above to unlock tuning wizard.")}
              </div>
            )}
            
          </div>
        )}

        {/* ================= STEP 2: GEARBOX SETUP ================= */}
        {currentStep === 2 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>📐 Step 2: {t("Apply calculated gearbox ratios in-game")}</h3>
              <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', padding: '0.3rem 0.6rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                {t("Goal:")} <strong style={{ color: 'var(--primary)' }}>{selectedRaceGoal.toUpperCase()}</strong>
              </span>
            </div>

            {/* Tuning Mode Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>{t("Tuning Mode:")}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button 
                    onClick={() => {
                      setTuningMode('recommended');
                      generateBaselineTuning();
                    }} 
                    style={{ ...btnStyle, fontSize: '0.8rem', padding: '0.3rem 0.8rem', background: tuningMode === 'recommended' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: tuningMode === 'recommended' ? 'black' : 'white' }}
                  >
                    {t("Recommended")}
                  </button>
                  <button 
                    onClick={() => setTuningMode('custom')} 
                    style={{ ...btnStyle, fontSize: '0.8rem', padding: '0.3rem 0.8rem', background: tuningMode === 'custom' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: tuningMode === 'custom' ? 'black' : 'white' }}
                  >
                    {t("Custom")}
                  </button>
                </div>
              </div>
              
              {tuningMode === 'custom' && (
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t("Load Profile:")}</span>
                  <select 
                    onChange={(e) => loadTuning(e.target.value)} 
                    style={{ padding: '0.3rem', background: 'black', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', fontSize: '0.8rem' }}
                  >
                    <option value="">-- {t("Select Saved Tuning")} --</option>
                    {savedTunings.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {t("These gearbox ratios are calculated mathematically using the vehicle's torque curve, tire grip, and aerodynamics. Set these values in your Forza Tuning menu:")}
            </p>

            <GearingTuner
              tuning={tuning}
              tuningMode={tuningMode}
              updateSection={updateSection}
              numGears={numGears}
              chartData={chartData}
              xMax={xMax}
              yMax={yMax}
              carParams={carParams}
              gearingMethod={gearingMethod}
              setGearingMethod={setGearingMethod}
              customGearingModel={customGearingModel}
              setCustomGearingModel={setCustomGearingModel}
              basicCustomP={basicCustomP}
              setBasicCustomP={setBasicCustomP}
              pMin={pMin}
              pMax={pMax}
              gearingDiscipline={gearingDiscipline}
              applyBasicGearing={applyBasicGearing}
              applyScientificGearing={applyScientificGearing}
            />

          </div>
        )}

        {/* ================= STEP 3: CHASSIS TUNING (Refactoring Placeholder) ================= */}
        {currentStep === 3 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem', textAlign: 'center', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem' }}>⚙️ Step 3: {t("Chassis Tuning (Refactoring)")}</h3>
            <div style={{ background: 'rgba(0, 180, 255, 0.05)', border: '1px solid rgba(0, 180, 255, 0.2)', padding: '1.5rem', borderRadius: '12px', maxWidth: '500px' }}>
              <p style={{ color: 'white', fontSize: '0.95rem', lineHeight: '1.5', margin: 0 }}>
                {t("Chassis tuning model (suspension, ARB, damping & differential) is currently undergoing full physical refactoring to align with exact Forza vehicle dynamics. New model will be available in the upcoming release.")}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--primary)',
  color: 'black',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '4px',
  padding: '0.4rem',
  outline: 'none'
};

export default TuningView;
