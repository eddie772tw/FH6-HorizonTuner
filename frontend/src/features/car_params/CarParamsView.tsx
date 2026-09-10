import React from 'react';
import { createCarParamsSaveSnapshot, isCurrentCarParamsSnapshot, useCarParams, CarParams } from '../../context/CarParamsContext';
import { ScopedUnitSettingsProvider, useSettings } from '../../context/SettingsContext';
import { useTelemetry } from '../../hooks/useTelemetry';
import { BasicCarInfo } from './components/BasicCarInfo';
import { AdjustabilityLimits } from './components/AdjustabilityLimits';
import { AdvancedGeometry } from './components/AdvancedGeometry';
import { DynoChart } from './components/DynoChart';
import { backendFetch } from '../../services/backend';
import { UnitSettingsSidebar } from '../../components/UnitSettingsSidebar';
import {
  createGranularUnitPreference,
  loadGranularUnitPreference,
  resolveGranularUnitPreference,
  type GranularUnitPreference,
} from '../../utils/gameUnitSettings';
import {
  displayPowerToProfile,
  displayTorqueToProfile,
  displayWeightToProfile,
  profilePowerToDisplay,
  profileTorqueToDisplay,
  profileWeightToDisplay,
} from '../../utils/profileUnitConversions';

interface CarParamsViewProps {
  subTab?: 'config' | 'dyno';
  setSubTab?: (tab: 'config' | 'dyno') => void;
  setActiveTab?: (tab: any) => void;
}

interface CarParamsViewContentProps extends CarParamsViewProps {
  unitPreference: GranularUnitPreference;
  onUnitPreferenceChange: (preference: GranularUnitPreference) => void;
}

const CarParamsViewContent: React.FC<CarParamsViewContentProps> = ({ subTab: propSubTab, setSubTab: propSetSubTab, setActiveTab, unitPreference, onUnitPreferenceChange }) => {
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
  const [showUnitSettings, setShowUnitSettings] = React.useState(false);
  const [internalSubTab, setInternalSubTab] = React.useState<'config' | 'dyno'>('config');
  const subTab = propSubTab !== undefined ? propSubTab : internalSubTab;
  const setSubTab = propSetSubTab !== undefined ? propSetSubTab : setInternalSubTab;

  
  // Guided Dyno wizard states
  const [testState, setTestState] = React.useState<'ready' | 'waiting' | 'recording' | 'completed'>('ready');
  const [runStartTimestampMs, setRunStartTimestampMs] = React.useState<number | null>(null);
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
            const res = await backendFetch(`/api/tunings/${carId}/${saveName}`);
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
        setRunStartTimestampMs(null);
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
        const timestampMs = Number(telemetryData.TimestampMS);
        setRunStartTimestampMs(Number.isFinite(timestampMs) ? timestampMs : null);
      }
    } else if (testState === 'recording') {
      const shouldStop = !isGearCorrect || accel < 200 || brake > 0 || handbrake > 0 || clutch > 50;
      const isRedline = currentRpm >= maxRpm - 250;
      
      if (shouldStop || isRedline) {
        if (runStartTimestampMs !== null) {
          const timestampMs = Number(telemetryData.TimestampMS);
          const duration = (timestampMs - runStartTimestampMs) / 1000;
          if (duration >= 0 && (currentRpm >= maxRpm * 0.82 || isRedline)) {
            setTestState('completed');
            setRunDuration(duration);
          } else {
            setTestState('ready');
          }
        } else {
          setTestState('ready');
        }
        setRunStartTimestampMs(null);
      }
    } else if (testState === 'completed') {
      if (isGearCorrect && currentRpm > 0 && currentRpm < 2500 && accel < 50 && brake === 0 && handbrake === 0) {
        setTestState('waiting');
      }
    }
  }, [telemetryData, testState, runStartTimestampMs, settings.dyno_test_gear, settings.dyno_recording, carParams]);

  // Auto-save states
  const [saveState, setSaveState] = React.useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSavedTime, setLastSavedTime] = React.useState<string | null>(null);
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCarIdRef = React.useRef(carId);
  activeCarIdRef.current = carId;

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveState('saved');
    setLastSavedTime(null);
  }, [carId]);

  const triggerAutoSave = (snapshot: ReturnType<typeof createCarParamsSaveSnapshot>) => {
    setSaveState('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      if (!isCurrentCarParamsSnapshot(activeCarIdRef.current, snapshot)) return;
      setSaveState('saving');
      try {
        await saveCarParams(snapshot);
        if (!isCurrentCarParamsSnapshot(activeCarIdRef.current, snapshot)) return;
        setSaveState('saved');
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        setLastSavedTime(timeStr);
      } catch {
        if (!isCurrentCarParamsSnapshot(activeCarIdRef.current, snapshot)) return;
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
    return profilePowerToDisplay(hp, settings.units);
  };
  const getPowerLabel = () => {
    if (settings.units.power === 'kw') return 'kW';
    if (settings.units.power === 'ps') return 'PS';
    return 'HP';
  };

  // Torque conversion for dyno (input in lb-ft)
  const getTorqueVal = (lbft: number) => {
    return profileTorqueToDisplay(lbft, settings.units);
  };
  const getTorqueLabel = () => {
    if (settings.units.torque === 'nm') return 'N·m';
    return 'lb-ft';
  };

  if (isLoading) {
    return <div style={{ color: 'var(--text-primary)', padding: '2rem' }}>{t("Loading car parameters...")}</div>;
  }

  if (!carParams) {
    return <div style={{ color: 'var(--text-primary)', padding: '2rem' }}>{t("No car loaded or telemetry inactive. Start driving a car to auto-create profile!")}</div>;
  }

  const updateParam = (field: keyof CarParams, value: any) => {
    if (!carParams) return;
    const next = { ...carParams, [field]: value };
    setCarParams(next);
    triggerAutoSave(createCarParamsSaveSnapshot(carId, next));
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
    const next = { ...carParams, adjustability: { ...carParams.adjustability, [field]: value } };
    setCarParams(next);
    triggerAutoSave(createCarParamsSaveSnapshot(carId, next));
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
  const displayCarWeight = profileWeightToDisplay(carParams.weight, settings.units);

  const handleWeightChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    updateParam('weight', displayWeightToProfile(val, settings.units));
  };

  // Power unit handling (internal is hp)
  const displayMaxHp = profilePowerToDisplay(carParams.maxHp, settings.units);

  const handleMaxHpChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    updateParam('maxHp', displayPowerToProfile(val, settings.units));
  };

  // Torque unit handling (internal is lb-ft)
  const displayMaxTorque = profileTorqueToDisplay(carParams.maxTorque, settings.units);

  const handleMaxTorqueChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    updateParam('maxTorque', displayTorqueToProfile(val, settings.units));
  };

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto">
      
      {/* Standardized Header Banner (Aligned with OverlayView) */}
      <div className="border-bottom pb-3 mb-2 flex-shrink-0">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <div className="d-flex align-items-center gap-3 mb-1">
              <h2 className="text-primary fs-4 fw-bold m-0" style={{ letterSpacing: '0.5px' }}>
                {t("Car Parameters & Dyno")}
              </h2>
              {renderSaveStatus()}
              <span className="badge text-bg-secondary fs-8 px-2 py-1 fw-bold">
                {t('Vehicle Profile')}
              </span>
            </div>
            <p className="text-body-secondary fs-7 mb-0" style={{ lineHeight: '1.4' }}>
              {t("Configure vehicle specifications, weight distribution, spring limits, and real-time dyno curves")}
            </p>
          </div>

          <div className="d-flex align-items-center gap-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowUnitSettings(true)}>
              {t('Profile Units')}
            </button>
            <ul className="nav nav-pills gap-1">
              <li className="nav-item">
                <button 
                  className={`nav-link btn-sm py-1 px-3 ${subTab === 'config' ? 'active fw-bold' : 'text-body-secondary'}`}
                  onClick={() => setSubTab('config')} 
                  aria-current={subTab === 'config' ? 'page' : undefined}
                >
                  {t("Profile Configuration")}
                </button>
              </li>
              <li className="nav-item">
                <button 
                  className={`nav-link btn-sm py-1 px-3 ${subTab === 'dyno' ? 'active fw-bold' : 'text-body-secondary'}`}
                  onClick={() => setSubTab('dyno')} 
                  aria-current={subTab === 'dyno' ? 'page' : undefined}
                >
                  {t("Live Dyno Curve")}
                </button>
              </li>
            </ul>

            <div className="vr opacity-25" style={{ height: '20px' }} />

            <div className="d-flex align-items-center gap-2 fs-7 fw-semibold text-body-secondary">
              <span>{t("Car Target:")}</span>
              <select 
                value={carId} 
                onChange={(e) => setCarId(e.target.value)}
                className="form-select form-select-sm"
                style={{ width: 'auto', minWidth: '200px' }}
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
        </div>
      </div>

      {subTab === 'config' ? (
        <div className="flex-grow-1 overflow-auto p-2 d-flex flex-column gap-3">
          <h3 className="text-primary fs-5 fw-bold m-0">{t("Car Profile Configuration")}</h3>
          
          <div className="row g-4">
            <div className="col-12 col-md-6">
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
            </div>
            
            <div className="col-12 col-md-6">
              <AdjustabilityLimits 
                t={t}
                carParams={carParams}
                updateAdjust={updateAdjust}
              />
            </div>
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

          <span
            title={Object.keys(carParams.dyno_curve).length === 0 ? t("No dyno data available to import. Please run the dyno test first.") : undefined}
            tabIndex={Object.keys(carParams.dyno_curve).length === 0 ? 0 : undefined}
            role={Object.keys(carParams.dyno_curve).length === 0 ? "group" : undefined}
            aria-label={Object.keys(carParams.dyno_curve).length === 0 ? t("No dyno data available to import. Please run the dyno test first.") : undefined}
            className="w-100 d-inline-block mt-2"
            style={Object.keys(carParams.dyno_curve).length === 0 ? { cursor: 'not-allowed' } : undefined}
          >
            <button
              onClick={importDynoValues}
              disabled={Object.keys(carParams.dyno_curve).length === 0}
              className="btn btn-outline-primary w-100 py-2 fw-bold"
              style={Object.keys(carParams.dyno_curve).length === 0 ? { pointerEvents: 'none' } : undefined}
            >
              {t("📥 Import Max HP / Torque from Dyno (includes RPM)")}
            </button>
          </span>
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
      <UnitSettingsSidebar
        idPrefix="car-params-units"
        show={showUnitSettings}
        title={t('Car Profile Unit Settings')}
        preference={unitPreference}
        onChange={onUnitPreferenceChange}
        mode="granular"
        onClose={() => setShowUnitSettings(false)}
      />
    </div>
  );
};

const CAR_PARAMS_UNIT_STORAGE_KEY = 'car_params_unit_preference';

const CarParamsView: React.FC<CarParamsViewProps> = props => {
  const { settings } = useSettings();
  const [unitPreference, setUnitPreference] = React.useState<GranularUnitPreference>(() =>
    loadGranularUnitPreference(CAR_PARAMS_UNIT_STORAGE_KEY, settings.units)
  );
  const scopedUnits = React.useMemo(
    () => resolveGranularUnitPreference(settings.units, unitPreference),
    [settings.units, unitPreference]
  );
  const updateUnitPreference = (preference: GranularUnitPreference) => {
    const normalized = unitPreference.followGlobal && !preference.followGlobal
      ? { ...createGranularUnitPreference(settings.units), followGlobal: false }
      : preference;
    setUnitPreference(normalized);
    localStorage.setItem(CAR_PARAMS_UNIT_STORAGE_KEY, JSON.stringify(normalized));
  };

  return (
    <ScopedUnitSettingsProvider units={scopedUnits}>
      <CarParamsViewContent {...props} unitPreference={unitPreference} onUnitPreferenceChange={updateUnitPreference} />
    </ScopedUnitSettingsProvider>
  );
};

export default CarParamsView;

