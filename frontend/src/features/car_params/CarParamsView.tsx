import React from 'react';
import { useCarParams, CarParams } from '../../context/CarParamsContext';
import { useSettings } from '../../context/SettingsContext';
import { useTelemetry } from '../../hooks/useTelemetry';
import { BasicCarInfo } from './components/BasicCarInfo';
import { AdjustabilityLimits } from './components/AdjustabilityLimits';
import { AdvancedGeometry } from './components/AdvancedGeometry';
import { DynoChart } from './components/DynoChart';
import { activeTabStyle, inactiveTabStyle, btnStyle } from './components/CommonStyles';

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
            const res = await fetch(`http://127.0.0.1:8001/api/tunings/${carId}/${saveName}`);
            const data = await res.json();
            if (data && data.gearing) {
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
            <button style={subTab === 'config' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('config')} aria-current={subTab === 'config' ? 'page' : undefined}>{t("Profile Configuration")}</button>
            <button style={subTab === 'dyno' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('dyno')} aria-current={subTab === 'dyno' ? 'page' : undefined}>{t("Live Dyno Curve")}</button>
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
            {!carsWithParams.some((c: any) => c.id === carId) && carId && (
              <option value={carId}>
                {carName} (ID: {carId}) {t("*Unsaved Parameters*")}
              </option>
            )}
            {carsWithParams.map((car: any) => (
              <option key={car.id} value={car.id}>
                {car.name} (ID: {car.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {subTab === 'config' ? (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1, overflowY: 'auto' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{t("Car Profile Configuration")}</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <BasicCarInfo 
              t={t} 
              settings={settings} 
              carParams={carParams} 
              updateParam={updateParam}
              displayCarWeight={displayCarWeight}
              displayMaxHp={displayMaxHp}
              displayMaxTorque={displayMaxTorque}
              handleWeightChange={handleWeightChange}
              handleMaxHpChange={handleMaxHpChange}
              handleMaxTorqueChange={handleMaxTorqueChange}
              getPowerLabel={getPowerLabel}
              getTorqueLabel={getTorqueLabel}
            />
            
            <AdjustabilityLimits 
              t={t}
              carParams={carParams}
              updateAdjust={updateAdjust}
            />
          </div>

          <AdvancedGeometry 
            t={t}
            settings={settings}
            carParams={carParams}
            updateParam={updateParam}
            displaySpringFrontMin={displaySpringFrontMin}
            displaySpringFrontMax={displaySpringFrontMax}
            displaySpringRearMin={displaySpringRearMin}
            displaySpringRearMax={displaySpringRearMax}
            handleSpringFrontMinChange={handleSpringFrontMinChange}
            handleSpringFrontMaxChange={handleSpringFrontMaxChange}
            handleSpringRearMinChange={handleSpringRearMinChange}
            handleSpringRearMaxChange={handleSpringRearMaxChange}
          />

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
        <DynoChart 
          t={t}
          settings={settings}
          updateSettings={updateSettings}
          carParams={carParams}
          telemetryData={telemetryData}
          testState={testState}
          runDuration={runDuration}
          recommendedGear={recommendedGear}
          showClearConfirm={showClearConfirm}
          setShowClearConfirm={setShowClearConfirm}
          clearDynoCurve={clearDynoCurve}
          setActiveTab={setActiveTab}
          dynoData={dynoData}
          getPowerLabel={getPowerLabel}
          getTorqueLabel={getTorqueLabel}
        />
      )}
    </div>
  );
};

export default CarParamsView;
