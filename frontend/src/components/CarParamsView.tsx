import React from 'react';
import { apiClient } from '../services/apiClient';
import { useCarParams, CarParams } from '../context/CarParamsContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useSettings } from '../context/SettingsContext';
import { useTelemetry } from '../hooks/useTelemetry';

const CarParamsView: React.FC<{ setActiveTab?: (tab: any) => void }> = ({ setActiveTab }) => {
  const {
    carId, setCarId, carName, carParams, setCarParams, saveCarParams,
    clearDynoCurve, importDynoValues, updateSettings, isLoading,
    carsWithParams
  } = useCarParams();
  const { 
    settings, 
    t, 
    convertSpringRate, 
    convertSpringRateToKgfmm 
  } = useSettings();
  const { data: telemetryData } = useTelemetry();
  
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  const [subTab, setSubTab] = React.useState<'config' | 'dyno'>('config');
  
  // Guided Dyno wizard states
  const [testState, setTestState] = React.useState<'ready' | 'waiting' | 'recording' | 'completed'>('ready');
  const [runStartTime, setRunStartTime] = React.useState<number | null>(null);
  const [runDuration, setRunDuration] = React.useState<number | null>(null);
  const [gearingData, setGearingData] = React.useState<{ gears: number[]; finalDrive: number } | null>(null);

  // Load gearing data from the active tuning setup
  React.useEffect(() => {
    const loadActiveGearing = async () => {
      if (!carId) return;
      const lastTuning = localStorage.getItem(`last_tuning_${carId}`);
      if (lastTuning) {
        try {
          const prefix = `${carId}-`;
          if (lastTuning.startsWith(prefix)) {
            const saveName = lastTuning.substring(prefix.length);
            const data = await apiClient.getTuningRecord(carId, saveName);
            if (data && !(data as any).error && data.gearing) {
              setGearingData(data.gearing);
              return;
            }
          }
        } catch (e) {
          console.error("Failed to load active gearing data", e);
        }
      }
      setGearingData(null);
    };
    loadActiveGearing();
  }, [carId]);

  // Recommend best gear (closest to 1.00)
  const recommendedGear = React.useMemo(() => {
    if (!gearingData || !gearingData.gears || !carParams) return null;
    const numGears = carParams.adjustability?.gears || 6;
    let bestGearIdx = 3; // Default to 4th gear
    let minDiff = 999;
    
    for (let i = 0; i < Math.min(gearingData.gears.length, numGears); i++) {
      const ratio = gearingData.gears[i];
      const diff = Math.abs(ratio - 1.0);
      if (diff < minDiff) {
        minDiff = diff;
        bestGearIdx = i;
      }
    }
    return {
      gear: bestGearIdx + 1,
      ratio: gearingData.gears[bestGearIdx]
    };
  }, [gearingData, carParams]);

  // Guided Dyno Run state machine
  React.useEffect(() => {
    if (!telemetryData || !settings.dyno_recording) return;
    const currentGear = telemetryData.Gear || 0;
    const currentRpm = telemetryData.CurrentEngineRpm || 0;
    const maxRpm = telemetryData.EngineMaxRpm || 8000;
    const accel = telemetryData.AccelInput || 0;
    const brake = telemetryData.BrakeInput || 0;
    const handbrake = telemetryData.HandBrakeInput || 0;
    const clutch = telemetryData.ClutchInput || 0;
    
    const targetGear = settings.dyno_test_gear ?? 4;
    const isGearCorrect = targetGear === 0 || currentGear === targetGear;
    
    // Launch Control active check
    const isLaunching = currentGear === 1 && handbrake > 50 && accel > 200;
    if (isLaunching) {
      // Pause or reset state machine during launch control
      if (testState === 'recording') {
        setTestState('ready');
        setRunStartTime(null);
      }
      return;
    }

    if (testState === 'ready') {
      if (isGearCorrect && currentRpm > 0 && currentRpm < 2500 && accel < 50 && brake === 0 && handbrake === 0) {
        setTestState('waiting');
      }
    } else if (testState === 'waiting') {
      if (!isGearCorrect) {
        setTestState('ready');
      } else if (accel >= 250 && currentRpm >= 2000 && brake === 0 && handbrake === 0 && clutch === 0) {
        setTestState('recording');
        setRunStartTime(Date.now());
      }
    } else if (testState === 'recording') {
      const shouldStop = !isGearCorrect || accel < 200 || brake > 0 || handbrake > 0 || clutch > 50;
      const isRedline = currentRpm >= maxRpm - 250;
      
      if (shouldStop || isRedline) {
        if (runStartTime) {
          const duration = (Date.now() - runStartTime) / 1000;
          if (currentRpm >= maxRpm * 0.82 || isRedline) {
            setTestState('completed');
            setRunDuration(duration);
          } else {
            setTestState('ready');
          }
        } else {
          setTestState('ready');
        }
        setRunStartTime(null);
      }
    } else if (testState === 'completed') {
      if (isGearCorrect && currentRpm > 0 && currentRpm < 2500 && accel < 50 && brake === 0 && handbrake === 0) {
        setTestState('waiting');
      }
    }
  }, [telemetryData, testState, runStartTime, settings.dyno_test_gear, settings.dyno_recording, carParams]);

  // Auto-save states
  const [saveState, setSaveState] = React.useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSavedTime, setLastSavedTime] = React.useState<string | null>(null);
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const triggerAutoSave = () => {
    setSaveState('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveCarParams();
        setSaveState('saved');
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        setLastSavedTime(timeStr);
      } catch (e) {
        setSaveState('unsaved');
      }
    }, 1500);
  };

  const renderSaveStatus = () => {
    if (saveState === 'unsaved') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ffaa00', fontSize: '0.85rem', fontWeight: 600 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffaa00', boxShadow: '0 0 8px #ffaa00', display: 'inline-block' }} />
          {t("Unsaved changes")}
        </div>
      );
    }
    if (saveState === 'saving') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 600 }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', 
            boxShadow: '0 0 8px var(--primary)', display: 'inline-block',
            animation: 'pulse 1s infinite alternate'
          }} />
          {t("Saving...")}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#00e676', fontSize: '0.85rem', fontWeight: 600 }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e676', boxShadow: '0 0 8px #00e676', display: 'inline-block' }} />
        {t("Changes saved")} {lastSavedTime && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '0.2rem' }}>({lastSavedTime})</span>}
      </div>
    );
  };

  // Power conversion for dyno (input in hp)
  const getPowerVal = (hp: number) => {
    if (settings.units.power === 'kw') return hp * 0.7457;
    if (settings.units.power === 'ps') return hp * 1.01387;
    return hp;
  };
  const getPowerLabel = () => {
    if (settings.units.power === 'kw') return 'kW';
    if (settings.units.power === 'ps') return 'PS';
    return 'HP';
  };

  // Torque conversion for dyno (input in lb-ft)
  const getTorqueVal = (lbft: number) => {
    if (settings.units.torque === 'nm') return lbft * 1.35582;
    return lbft;
  };
  const getTorqueLabel = () => {
    if (settings.units.torque === 'nm') return 'N·m';
    return 'lb-ft';
  };

  if (isLoading) {
    return <div style={{ color: 'white', padding: '2rem' }}>{t("Loading car parameters...")}</div>;
  }

  if (!carParams) {
    return <div style={{ color: 'white', padding: '2rem' }}>{t("No car loaded or telemetry inactive. Start driving a car to auto-create profile!")}</div>;
  }

  const updateParam = (field: keyof CarParams, value: any) => {
    if (!carParams) return;
    setCarParams({ ...carParams, [field]: value });
    triggerAutoSave();
  };

  // Conversions for Spring limits inputs
  const displaySpringFrontMin = carParams.spring_front_min !== undefined
    ? Math.round(convertSpringRate(carParams.spring_front_min).value * 10) / 10
    : '';
  const displaySpringFrontMax = carParams.spring_front_max !== undefined
    ? Math.round(convertSpringRate(carParams.spring_front_max).value * 10) / 10
    : '';
  const displaySpringRearMin = carParams.spring_rear_min !== undefined
    ? Math.round(convertSpringRate(carParams.spring_rear_min).value * 10) / 10
    : '';
  const displaySpringRearMax = carParams.spring_rear_max !== undefined
    ? Math.round(convertSpringRate(carParams.spring_rear_max).value * 10) / 10
    : '';

  const handleSpringFrontMinChange = (valStr: string) => {
    const val = parseFloat(valStr);
    updateParam('spring_front_min', isNaN(val) ? undefined : convertSpringRateToKgfmm(val));
  };
  const handleSpringFrontMaxChange = (valStr: string) => {
    const val = parseFloat(valStr);
    updateParam('spring_front_max', isNaN(val) ? undefined : convertSpringRateToKgfmm(val));
  };
  const handleSpringRearMinChange = (valStr: string) => {
    const val = parseFloat(valStr);
    updateParam('spring_rear_min', isNaN(val) ? undefined : convertSpringRateToKgfmm(val));
  };
  const handleSpringRearMaxChange = (valStr: string) => {
    const val = parseFloat(valStr);
    updateParam('spring_rear_max', isNaN(val) ? undefined : convertSpringRateToKgfmm(val));
  };

  const updateAdjust = (field: keyof CarParams['adjustability'], value: any) => {
    if (!carParams) return;
    setCarParams({ ...carParams, adjustability: { ...carParams.adjustability, [field]: value } });
    triggerAutoSave();
  };

  // Convert dyno_curve dict to sorted array for Recharts
  const dynoData = Object.keys(carParams.dyno_curve)
    .map(rpm => {
      const rawHp = carParams.dyno_curve[rpm].hp;
      const rawTorque = carParams.dyno_curve[rpm].torque;
      return {
        rpm: parseInt(rpm),
        hp: Math.round(getPowerVal(rawHp) * 10) / 10,
        torque: Math.round(getTorqueVal(rawTorque) * 10) / 10
      };
    })
    .sort((a, b) => a.rpm - b.rpm);

  // Weight unit handling (internal is kg)
  const displayCarWeight = settings.units.weight === 'lbs' 
    ? carParams.weight * 2.20462 
    : carParams.weight;

  const handleWeightChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const internalWeight = settings.units.weight === 'lbs'
      ? val / 2.20462
      : val;
    updateParam('weight', internalWeight);
  };

  // Power unit handling (internal is hp)
  const displayMaxHp = settings.units.power === 'kw' ? carParams.maxHp * 0.7457
    : settings.units.power === 'ps' ? carParams.maxHp * 1.01387
    : carParams.maxHp;

  const handleMaxHpChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const internalHp = settings.units.power === 'kw' ? val / 0.7457
      : settings.units.power === 'ps' ? val / 1.01387
      : val;
    updateParam('maxHp', Math.round(internalHp));
  };

  // Torque unit handling (internal is lb-ft)
  const displayMaxTorque = settings.units.torque === 'nm' ? carParams.maxTorque * 1.35582
    : carParams.maxTorque;

  const handleMaxTorqueChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const internalTorque = settings.units.torque === 'nm' ? val / 1.35582
      : val;
    updateParam('maxTorque', Math.round(internalTorque));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden', paddingRight: '0.5rem' }}>
      
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>{t("Car Parameters")}</h2>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={subTab === 'config' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('config')}>{t("Profile Configuration")}</button>
            <button style={subTab === 'dyno' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('dyno')}>{t("Live Dyno Curve")}</button>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          {renderSaveStatus()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          <span>{t("Car Target:")}</span>
          <select 
            value={carId} 
            onChange={(e) => setCarId(e.target.value)}
            style={{ 
              padding: '0.4rem 0.8rem', 
              background: 'rgba(0,0,0,0.4)', 
              color: 'white', 
              border: '1px solid rgba(255,255,255,0.15)', 
              borderRadius: '4px',
              fontWeight: 'normal',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {!carsWithParams.some(c => c.id === carId) && carId && (
              <option value={carId}>
                {carName} (ID: {carId}) {t("*Unsaved Parameters*")}
              </option>
            )}
            {carsWithParams.map(car => (
              <option key={car.id} value={car.id}>
                {car.name} (ID: {car.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {subTab === 'config' ? (
        /* Upper Section: Form Configurations */
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1, overflowY: 'auto' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{t("Car Profile Configuration")}</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Left Column: Static Info */}
            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>{t("Static Info")}</h3>
              <div style={formRowStyle}>
                <label>{t("Weight")} ({settings.units.weight})</label>
                <input type="number" value={Math.round(displayCarWeight)} onChange={e => handleWeightChange(e.target.value)} style={inputStyle} />
              </div>
              <div style={formRowStyle}>
                <label>{t("Front Weight (%)")}</label>
                <input type="number" value={carParams.weight_distribution} onChange={e => updateParam('weight_distribution', parseFloat(e.target.value))} style={inputStyle} step="0.1" />
              </div>
              <div style={formRowStyle}>
                <label>{t("Drivetrain")}</label>
                <select value={carParams.drivetrain} onChange={e => updateParam('drivetrain', e.target.value)} style={inputStyle}>
                  <option value="FWD">{t("FWD (Front Wheel Drive)")}</option>
                  <option value="RWD">{t("RWD (Rear Wheel Drive)")}</option>
                  <option value="AWD">{t("AWD (All Wheel Drive)")}</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>{t("Induction")}</label>
                <select value={carParams.induction} onChange={e => updateParam('induction', e.target.value)} style={inputStyle}>
                  <option value="NA">{t("Naturally Aspirated (NA)")}</option>
                  <option value="Supercharger">{t("Supercharger")}</option>
                  <option value="Turbo">{t("Single Turbo")}</option>
                  <option value="TwinTurbo">{t("Twin Turbo")}</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>{t("Max HP")} ({getPowerLabel()})</label>
                <input type="number" value={Math.round(displayMaxHp)} onChange={e => handleMaxHpChange(e.target.value)} style={inputStyle} step="10" />
              </div>
              <div style={formRowStyle}>
                <label>{t("Max HP RPM (rpm)")}</label>
                <input type="number" value={carParams.maxHpRpm || 0} onChange={e => updateParam('maxHpRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
              </div>
              <div style={formRowStyle}>
                <label>{t("Max Torque")} ({getTorqueLabel()})</label>
                <input type="number" value={Math.round(displayMaxTorque)} onChange={e => handleMaxTorqueChange(e.target.value)} style={inputStyle} step="10" />
              </div>
              <div style={formRowStyle}>
                <label>{t("Max Torque RPM (rpm)")}</label>
                <input type="number" value={carParams.maxTorqueRpm || 0} onChange={e => updateParam('maxTorqueRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
              </div>
              
              <div style={formRowStyle}>
                <label>{t("Front Tire (mm/% R in)")}</label>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input type="number" value={carParams.frontTireWidth || 245} onChange={e => updateParam('frontTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} placeholder="245" />
                  <span style={{ color: 'gray' }}>/</span>
                  <input type="number" value={carParams.frontTireAspect || 40} onChange={e => updateParam('frontTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="40" />
                  <span style={{ color: 'gray' }}>R</span>
                  <input type="number" value={carParams.frontTireRim || 18} onChange={e => updateParam('frontTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="18" />
                </div>
              </div>
              <div style={formRowStyle}>
                <label>{t("Rear Tire (mm/% R in)")}</label>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input type="number" value={carParams.rearTireWidth || 245} onChange={e => updateParam('rearTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} placeholder="245" />
                  <span style={{ color: 'gray' }}>/</span>
                  <input type="number" value={carParams.rearTireAspect || 40} onChange={e => updateParam('rearTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="40" />
                  <span style={{ color: 'gray' }}>R</span>
                  <input type="number" value={carParams.rearTireRim || 18} onChange={e => updateParam('rearTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="18" />
                </div>
              </div>
              
              <h4 style={{ margin: '1rem 0 0.5rem 0', color: 'var(--text-secondary)' }}>{t("Assist Inputs")}</h4>
              <div style={formRowStyle}>
                <label>{t("Aero Bal (0-1)")}</label>
                <input type="number" value={carParams.aeroBalance ?? 0.5} onChange={e => updateParam('aeroBalance', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
              </div>
              <div style={formRowStyle}>
                <label>{t("Aero Eff (0-1)")}</label>
                <input type="number" value={carParams.aeroEfficiency ?? 0.5} onChange={e => updateParam('aeroEfficiency', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
              </div>
              <div style={formRowStyle}>
                <label>{t("Mech Bal (0-1)")}</label>
                <input type="number" value={carParams.mechBalance ?? 0.5} onChange={e => updateParam('mechBalance', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
              </div>
            </div>
            
            {/* Right Column: Adjustability Limits */}
            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>{t("Adjustability Limits")}</h3>
              <div style={formRowStyle}>
                <label>{t("Gearbox")}</label>
                <select value={carParams.adjustability.gearbox} onChange={e => updateAdjust('gearbox', e.target.value)} style={inputStyle}>
                  <option value="Fixed">{t("Fixed (Unadjustable)")}</option>
                  <option value="FinalDrive">{t("Final Drive Only")}</option>
                  <option value="Full">{t("Full Adjustable")}</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>{t("Gears Count")}</label>
                <input type="number" value={carParams.adjustability.gears} min={4} max={10} onChange={e => updateAdjust('gears', parseInt(e.target.value))} style={inputStyle} />
              </div>
              <div style={formRowStyle}>
                <label>{t("Suspension")}</label>
                <select value={carParams.adjustability.suspension} onChange={e => updateAdjust('suspension', e.target.value)} style={inputStyle}>
                  <option value="Fixed">{t("Fixed")}</option>
                  <option value="Street">{t("Street (No Springs/Dampers)")}</option>
                  <option value="Sport">{t("Sport (No Springs/Dampers)")}</option>
                  <option value="Race">{t("Race (Full Adjustable)")}</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>{t("Anti-roll Bars")}</label>
                <select value={carParams.adjustability.arb} onChange={e => updateAdjust('arb', e.target.value)} style={inputStyle}>
                  <option value="Fixed">{t("Fixed")}</option>
                  <option value="Adjustable">{t("Adjustable")}</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>{t("Aero")}</label>
                <select value={carParams.adjustability.aero || 'Fixed'} onChange={e => updateAdjust('aero', e.target.value)} style={inputStyle}>
                  <option value="Fixed">{t("Fixed")}</option>
                  <option value="Front Only">{t("Front Only")}</option>
                  <option value="Rear Only">{t("Rear Only")}</option>
                  <option value="Adjustable">{t("Adjustable")}</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>{t("Brakes")}</label>
                <select value={carParams.adjustability.brakes || 'Fixed'} onChange={e => updateAdjust('brakes', e.target.value)} style={inputStyle}>
                  <option value="Fixed">{t("Fixed")}</option>
                  <option value="Adjustable">{t("Adjustable")}</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>{t("Differential")}</label>
                <select value={carParams.adjustability.diff || 'Fixed'} onChange={e => updateAdjust('diff', e.target.value)} style={inputStyle}>
                  <option value="Fixed">{t("Fixed")}</option>
                  <option value="Adjustable">{t("Adjustable")}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Advanced Suspension Limits & Geometry */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem', marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              ⚙️ {t("Advanced Suspension Limits & Geometry")}
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
              {/* Column 1: Spring & ARB Limits */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Spring & ARB Slider Limits")}</h4>
                <div style={formRowStyle}>
                  <label>{t("Front Spring Min")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
                  <input type="number" value={displaySpringFrontMin} onChange={e => handleSpringFrontMinChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 10.0" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Front Spring Max")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
                  <input type="number" value={displaySpringFrontMax} onChange={e => handleSpringFrontMaxChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 120.0" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Rear Spring Min")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
                  <input type="number" value={displaySpringRearMin} onChange={e => handleSpringRearMinChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 10.0" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Rear Spring Max")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
                  <input type="number" value={displaySpringRearMax} onChange={e => handleSpringRearMaxChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 120.0" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Front ARB Min / Max")}</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input type="number" value={carParams.arb_front_min ?? 1.0} onChange={e => updateParam('arb_front_min', parseFloat(e.target.value) || 1.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="1.0" />
                    <input type="number" value={carParams.arb_front_max ?? 65.0} onChange={e => updateParam('arb_front_max', parseFloat(e.target.value) || 65.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="65.0" />
                  </div>
                </div>
                <div style={formRowStyle}>
                  <label>{t("Rear ARB Min / Max")}</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input type="number" value={carParams.arb_rear_min ?? 1.0} onChange={e => updateParam('arb_rear_min', parseFloat(e.target.value) || 1.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="1.0" />
                    <input type="number" value={carParams.arb_rear_max ?? 65.0} onChange={e => updateParam('arb_rear_max', parseFloat(e.target.value) || 65.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="65.0" />
                  </div>
                </div>
              </div>
              
              {/* Column 2: Suspension Geometry */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Suspension Geometry")}</h4>
                <div style={formRowStyle}>
                  <label>{t("Front Roll Center Offset")}</label>
                  <input type="number" value={carParams.roll_center_front ?? 0.0} onChange={e => updateParam('roll_center_front', parseFloat(e.target.value) || 0)} style={inputStyle} step="0.01" placeholder="e.g. 0.00" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Rear Roll Center Offset")}</label>
                  <input type="number" value={carParams.roll_center_rear ?? 0.0} onChange={e => updateParam('roll_center_rear', parseFloat(e.target.value) || 0)} style={inputStyle} step="0.01" placeholder="e.g. 0.00" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Anti-Dive Geometry (%)")}</label>
                  <input type="number" value={carParams.anti_dive ?? 0} onChange={e => updateParam('anti_dive', parseInt(e.target.value) || 0)} style={inputStyle} step="1" placeholder="e.g. 0" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Anti-Squat Geometry (%)")}</label>
                  <input type="number" value={carParams.anti_squat ?? 0} onChange={e => updateParam('anti_squat', parseInt(e.target.value) || 0)} style={inputStyle} step="1" placeholder="e.g. 0" />
                </div>
              </div>
              
              {/* Column 3: Tuning Preferences */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Tuning Goal Preferences")}</h4>
                <div style={formRowStyle}>
                  <label>{t("Target Ride Freq (Hz)")}</label>
                  <input type="number" value={carParams.target_ride_frequency ?? 2.4} onChange={e => updateParam('target_ride_frequency', parseFloat(e.target.value) || 2.4)} style={inputStyle} step="0.05" min="1.0" max="4.0" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Target Rebound Ratio")}</label>
                  <input type="number" value={carParams.target_rebound_ratio ?? 0.70} onChange={e => updateParam('target_rebound_ratio', parseFloat(e.target.value) || 0.70)} style={inputStyle} step="0.01" min="0.30" max="0.95" />
                </div>
                <div style={formRowStyle}>
                  <label>{t("Target Bump Ratio")}</label>
                  <input type="number" value={carParams.target_bump_ratio ?? 0.55} onChange={e => updateParam('target_bump_ratio', parseFloat(e.target.value) || 0.55)} style={inputStyle} step="0.01" min="0.20" max="0.90" />
                </div>
              </div>
            </div>
          </div>

          {/* Import from Dyno button */}
          <button
            onClick={importDynoValues}
            disabled={Object.keys(carParams.dyno_curve).length === 0}
            style={{
              ...btnStyle,
              background: Object.keys(carParams.dyno_curve).length === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0, 180, 255, 0.15)',
              color: Object.keys(carParams.dyno_curve).length === 0 ? 'rgba(255,255,255,0.3)' : '#00b4ff',
              border: '1px solid rgba(0, 180, 255, 0.3)',
              fontSize: '0.85rem',
              padding: '0.4rem 0.75rem',
              cursor: Object.keys(carParams.dyno_curve).length === 0 ? 'not-allowed' : 'pointer',
              width: '100%',
              textAlign: 'center',
              marginTop: '0.5rem'
            }}
          >
            {t("📥 Import Max HP / Torque from Dyno (includes RPM)")}
          </button>
        </div>
      ) : (
        /* Lower Section: Dyno Chart */
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, minHeight: 0 }}>
          {/* Title row with toggles */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.1rem' }}>{t("Live Dyno Curve")}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setShowClearConfirm(true)}
                style={{
                  ...btnStyle,
                  background: 'rgba(255, 60, 60, 0.15)',
                  color: '#ff6b6b',
                  border: '1px solid rgba(255, 60, 60, 0.3)',
                  fontSize: '0.8rem',
                  padding: '0.3rem 0.6rem'
                }}
              >
                {t("Clear Data")}
              </button>
            </div>
          </div>

          {/* Toggle switches and Gearing controls row */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
            padding: '0.8rem',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '6px',
            fontSize: '0.85rem'
          }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <ToggleSwitch
                label={t("Dyno Record")}
                checked={settings.dyno_recording}
                onChange={(v) => updateSettings({ dyno_recording: v })}
                color="#00e676"
              />
              
              {settings.dyno_recording && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t("Target Test Gear")}:</span>
                    <select
                      value={settings.dyno_test_gear ?? 4}
                      onChange={(e) => updateSettings({ dyno_test_gear: parseInt(e.target.value) })}
                      style={{
                        background: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '4px',
                        padding: '0.2rem 0.4rem',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value={0}>{t("Any Gear (Free Run)")}</option>
                      {[1,2,3,4,5,6,7,8,9,10].map(g => (
                        <option key={g} value={g}>{g} {t("st")}</option>
                      ))}
                    </select>
                  </div>
                  
                  <ToggleSwitch
                    label={t("Filter Tire Slip")}
                    checked={settings.dyno_filter_slip ?? true}
                    onChange={(v) => updateSettings({ dyno_filter_slip: v })}
                    color="#00b4ff"
                  />
                  
                  <ToggleSwitch
                    label={t("Filter Gear Shifting Spikes")}
                    checked={settings.dyno_filter_transients ?? true}
                    onChange={(v) => updateSettings({ dyno_filter_transients: v })}
                    color="#00b4ff"
                  />
                </>
              )}
            </div>
          </div>

          {/* Guided Dyno Wizard Panel */}
          {settings.dyno_recording && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />
                  {t("Dyno Test Wizard")}
                </h3>
                
                {telemetryData && (
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>{t("GEAR")}: <strong style={{ color: 'white' }}>{telemetryData.Gear}</strong></span>
                    <span>RPM: <strong style={{ color: 'white' }}>{Math.round(telemetryData.CurrentEngineRpm || 0)}</strong></span>
                    <span>{t("Throttle")}: <strong style={{ color: 'white' }}>{Math.round((telemetryData.AccelInput || 0) / 2.55)}%</strong></span>
                  </div>
                )}
              </div>

              {/* Guided Status Card */}
              {(() => {
                if (!telemetryData) {
                  return (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0.5rem 0', fontStyle: 'italic' }}>
                      {t("No car loaded or telemetry inactive. Start driving a car to auto-create profile!")}
                    </div>
                  );
                }

                const currentGear = telemetryData.Gear || 0;
                const currentRpm = telemetryData.CurrentEngineRpm || 0;
                const maxRpm = telemetryData.EngineMaxRpm || 8000;
                const accel = telemetryData.AccelInput || 0;
                const handbrake = telemetryData.HandBrakeInput || 0;
                const targetGear = settings.dyno_test_gear ?? 4;
                
                // Launch Control active check
                const isLaunching = currentGear === 1 && handbrake > 50 && accel > 200;
                if (isLaunching) {
                  return (
                    <div style={{
                      background: 'rgba(0, 180, 255, 0.1)',
                      border: '1px solid rgba(0, 180, 255, 0.3)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      color: '#33c5ff',
                      fontSize: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem'
                    }}>
                      <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>🚀</span> {t("🚀 Launch Control Active! Recording paused.")}
                      </div>
                      <div style={{ opacity: 0.8, fontSize: '0.85rem' }}>
                        {t("Launch Control Active. Please perform Dyno test in 4th/5th gear for accuracy.")}
                      </div>
                    </div>
                  );
                }

                // Slip check
                const drivetrain = carParams.drivetrain || "RWD";
                const slipRatios = telemetryData.TireSlipRatio || [0,0,0,0];
                let isSlipped = false;
                if (settings.dyno_filter_slip ?? true) {
                  if (drivetrain === "RWD" && (Math.abs(slipRatios[2]) > 0.10 || Math.abs(slipRatios[3]) > 0.10)) isSlipped = true;
                  else if (drivetrain === "FWD" && (Math.abs(slipRatios[0]) > 0.10 || Math.abs(slipRatios[1]) > 0.10)) isSlipped = true;
                  else if (drivetrain === "AWD" && slipRatios.some(s => Math.abs(s) > 0.10)) isSlipped = true;
                }

                if (isSlipped && testState === 'recording') {
                  return (
                    <div style={{
                      background: 'rgba(255, 170, 0, 0.1)',
                      border: '1px solid rgba(255, 170, 0, 0.3)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      color: '#ffaa00',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      animation: 'pulse 1s infinite alternate'
                    }}>
                      {t("⚠️ Tire Slip Detected! Recording paused.")}
                    </div>
                  );
                }

                switch (testState) {
                  case 'ready':
                    return (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem'
                      }}>
                        {targetGear === 0 
                          ? t("Ready! Perform a Full Throttle (WOT) run in any gear.") 
                          : t("Please shift to gear {gear} and slow down below 2,000 RPM.").replace('{gear}', targetGear.toString())}
                      </div>
                    );
                  case 'waiting':
                    return (
                      <div style={{
                        background: 'rgba(0, 230, 118, 0.08)',
                        border: '1px solid rgba(0, 230, 118, 0.25)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        color: '#00e676',
                        fontSize: '0.85rem',
                        fontWeight: 600
                      }}>
                        {t("Ready! Perform a Full Throttle (WOT) run on a straight.")}
                      </div>
                    );
                  case 'recording':
                    const progress = Math.min(100, Math.max(0, ((currentRpm - 2000) / (maxRpm - 2000)) * 100));
                    return (
                      <div style={{
                        background: 'rgba(255, 60, 60, 0.08)',
                        border: '1px solid rgba(255, 60, 60, 0.25)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        color: '#ff6b6b',
                        fontSize: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}>
                        <div style={{ fontWeight: 600 }}>{t("Recording Dyno Curve... Keep Full Throttle!")}</div>
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${progress}%`, height: '100%', background: '#ff4444', transition: 'width 0.1s ease' }} />
                        </div>
                      </div>
                    );
                  case 'completed':
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{
                          background: 'rgba(0, 230, 118, 0.12)',
                          border: '1px solid rgba(0, 230, 118, 0.4)',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          color: '#00e676',
                          fontSize: '0.85rem',
                          fontWeight: 600
                        }}>
                          {t("Dyno Run Completed! Check your new curve.")}
                        </div>
                        
                        {runDuration !== null && (
                          <div style={{ fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {runDuration < 3.0 ? (
                              <span style={{ color: '#ffaa00' }}>
                                {t("Run duration too short ({sec}s). Gearing might be too short (high ratio). Low-gear inertial losses can underestimate horsepower. Consider tuning this gear longer (lower ratio) or using a higher gear.").replace('{sec}', runDuration.toFixed(1))}
                              </span>
                            ) : runDuration > 12.0 ? (
                              <span style={{ color: '#ffaa00' }}>
                                {t("Run duration too long ({sec}s). Aerodynamic drag at high speeds will underestimate high-RPM horsepower. Consider tuning this gear shorter (higher ratio) or using a lower gear.").replace('{sec}', runDuration.toFixed(1))}
                              </span>
                            ) : (
                              <span style={{ color: '#00e676' }}>
                                🏆 {t("Run duration optimal ({sec}s). Excellent Dyno measurement quality!").replace('{sec}', runDuration.toFixed(1))}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                }
              })()}

              {/* Gearing Optimization Recommendations or Warnings */}
              {recommendedGear ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.4rem',
                  fontSize: '0.82rem',
                  color: '#00b4ff',
                  background: 'rgba(0, 180, 255, 0.05)',
                  border: '1px solid rgba(0, 180, 255, 0.15)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px'
                }}>
                  <span style={{ flexShrink: 0 }}>💡</span>
                  <span>
                    {t("Recommended Test Gear: {gear} (Ratio: {ratio}, closest to 1.00)")
                      .replace('{gear}', recommendedGear.gear.toString())
                      .replace('{ratio}', recommendedGear.ratio.toFixed(2))}
                  </span>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  fontSize: '0.82rem',
                  color: '#ffaa00',
                  background: 'rgba(255, 170, 0, 0.05)',
                  border: '1px solid rgba(255, 170, 0, 0.15)',
                  padding: '0.75rem',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}>
                    <span>⚠️</span>
                    <span>{t("Gearing data not found for this car. The system cannot recommend the optimal test gear or perform precise diagnostics.")}</span>
                  </div>
                  <p style={{ margin: 0, opacity: 0.8, fontSize: '0.8rem', lineHeight: '1.4' }}>
                    {t("Please complete your gearing setup in Tuning Setup -> Gearing first, save it, and then return here for the Dyno run.")}
                  </p>
                  {setActiveTab && (
                    <button
                      onClick={() => setActiveTab('tuning')}
                      style={{
                        ...btnStyle,
                        background: 'rgba(255, 170, 0, 0.15)',
                        color: '#ffbb33',
                        border: '1px solid rgba(255, 170, 0, 0.3)',
                        fontSize: '0.8rem',
                        padding: '0.3rem 0.6rem',
                        alignSelf: 'flex-start',
                        marginTop: '0.2rem',
                        cursor: 'pointer'
                      }}
                    >
                      {t("Go to Gearing Setup")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Clear Confirmation Dialog */}
          {showClearConfirm && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.85)',
              border: '1px solid rgba(255, 60, 60, 0.5)',
              borderRadius: '8px',
              padding: '1rem 1.25rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}>
              <span style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>
                {t("⚠ Are you sure you want to clear all Dyno data for this car? This cannot be undone.")}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    await clearDynoCurve();
                    setShowClearConfirm(false);
                  }}
                  style={{
                    ...btnStyle,
                    background: '#ff4444',
                    color: 'white',
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.75rem'
                  }}
                >
                  {t("Confirm Clear")}
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    ...btnStyle,
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.75rem'
                  }}
                >
                  {t("Cancel")}
                </button>
              </div>
            </div>
          )}

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
            {t("Drive the car at full throttle in-game to collect horsepower and torque data across RPM ranges. Each RPM point retains up to 50 historical records, filtered using IQR and weighted.")}
          </p>

          <div style={{ flex: 1, minHeight: 0 }}>
            {dynoData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dynoData} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="rpm" 
                    stroke="var(--text-secondary)" 
                    label={{ value: 'Engine RPM', position: 'bottom', fill: 'var(--text-secondary)', offset: -5 }} 
                  />
                  <YAxis 
                    yAxisId="hp" 
                    stroke="var(--accent)" 
                    label={{ value: `Power (${getPowerLabel()})`, angle: -90, position: 'insideLeft', fill: 'var(--accent)' }} 
                  />
                  <YAxis 
                    yAxisId="torque" 
                    orientation="right" 
                    stroke="hsl(120, 80%, 60%)" 
                    label={{ value: `Torque (${getTorqueLabel()})`, angle: -90, position: 'insideRight', fill: 'hsl(120, 80%, 60%)' }} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }}
                  />
                  <Legend verticalAlign="top" height={24}/>
                  <Line yAxisId="hp" type="monotone" dataKey="hp" name={`Power (${getPowerLabel()})`} stroke="var(--accent)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
                  <Line yAxisId="torque" type="monotone" dataKey="torque" name={`Torque (${getTorqueLabel()})`} stroke="hsl(120, 80%, 60%)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                {settings.dyno_recording
                  ? t("No Dyno data collected yet. Please drive at full throttle in-game!")
                  : t("Dyno recording is disabled. Enable it to start collecting data.")}
              </div>
            )}
          </div>
        </div>
      )}
      
    </div>
  );
};

// --- Toggle Switch Component ---
const ToggleSwitch: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
}> = ({ label, checked, onChange, color = '#00e676' }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        background: checked ? color : 'rgba(255,255,255,0.15)',
        position: 'relative',
        transition: 'background 0.2s ease',
        flexShrink: 0,
        cursor: 'pointer'
      }}
    >
      <div style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'white',
        position: 'absolute',
        top: '2px',
        left: checked ? '18px' : '2px',
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }} />
    </div>
    <span style={{ color: checked ? 'white' : 'var(--text-secondary)', fontSize: '0.85rem', transition: 'color 0.2s' }}>
      {label}
    </span>
  </label>
);

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem'
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'white',
  borderRadius: '4px',
  width: '180px',
  textAlign: 'right'
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

const activeTabStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

const inactiveTabStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  border: 'none',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

export default CarParamsView;
