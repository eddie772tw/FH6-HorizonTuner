import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useCarParams } from '../context/CarParamsContext';
import { 
  calculateARBs, 
  calculateSprings, 
  calculateDampers,
  calculateARBsAdvanced,
  calculateSpringsByFrequency,
  calculateDampersCritical,
  getDifferentialBaseline,
  calculateTirePressures,
  calculateAlignmentSettings,
  RaceType,
  Drivetrain
} from '../utils/tuningMath';
import { useSettings } from '../context/SettingsContext';
import { useTelemetry } from '../hooks/useTelemetry';

const TuningView: React.FC<{ setActiveTab?: (tab: any) => void }> = ({ setActiveTab }) => {
  const { carId, carName, carParams, setCarParams, saveCarParams } = useCarParams();
  const [activeSubTab, setActiveSubTab] = useState<string>('Gearing');
  const [saveName, setSaveName] = useState<string>(`Untitled_${new Date().toISOString().slice(0,10)}`);
  const [savedTunings, setSavedTunings] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>('');
  
  const { data: telemetryData } = useTelemetry();
  
  const { 
    settings, 
    convertTirePressure, 
    convertTirePressureToBar, 
    convertSpringRate, 
    convertSpringRateToKgfmm, 
    convertHeight, 
    convertHeightToCm, 
    convertForce, 
    convertForceToKgf, 
    convertSpeed, 
    convertWeight,
    convertWeightToLbs
  } = useSettings();

  const tuningCategories = [
    'Theoretical Performance', 'Tires', 'Gearing', 'Alignment', 'Anti-roll bars', 'Springs', 
    'Damping', 'Aero', 'Brake', 'Differential'
  ];

  // Comprehensive Tuning State (Internal always Metric)
  const [tuning, setTuning] = useState({
    tires: { front: 2.1, rear: 2.1 },
    gearing: { finalDrive: 3.40, gears: [2.89, 1.99, 1.49, 1.16, 0.94, 0.78, 0.65, 0.55, 0.50, 0.45], maxRpm: 8000 },
    alignment: { camberF: -1.5, camberR: -1.0, toeF: 0.0, toeR: 0.0, caster: 5.0 },
    arb: { front: 30, rear: 30 },
    springs: { front: 100, rear: 100, heightF: 15, heightR: 15 },
    damping: { reboundF: 10, reboundR: 10, bumpF: 6, bumpR: 6 },
    aero: { front: 100, rear: 150 },
    brake: { balance: 50, pressure: 100 },
    diff: { accelF: 50, decelF: 0, accelR: 50, decelR: 0, center: 65 }
  });

  const [theoreticalData, setTheoreticalData] = useState({
    weight: '',
    frontBias: '',
    zeroTo100: '',
    lateralG: ''
  });

  const [gearingDiscipline, setGearingDiscipline] = useState<'GT' | 'Rally' | 'Drift'>('GT');
  const [inGameTopSpeed, setInGameTopSpeed] = useState<number>(300);


  // Assist States
  const [targetFreq, setTargetFreq] = useState<number>(2.25);
  const [reboundRatio, setReboundRatio] = useState<number>(0.75);
  const [bumpRatio, setBumpRatio] = useState<number>(0.55);
  const [slipFeedback, setSlipFeedback] = useState<string>('none');
  
  const [tireRaceType, setTireRaceType] = useState<RaceType>('Road');
  const [tireDriveType, setTireDriveType] = useState<Drivetrain>(carParams?.drivetrain as Drivetrain || 'AWD');
  const [alignRaceType, setAlignRaceType] = useState<RaceType>('Road');

  useEffect(() => {
    if (carParams?.drivetrain) {
      setTireDriveType(carParams.drivetrain as Drivetrain);
    }
  }, [carParams?.drivetrain]);

  const [limits, setLimits] = useState({
    arbMin: 1.0, arbMax: 65.0,
    springMin: 20, springMax: 300,
    finalDriveMin: 2.20, finalDriveMax: 6.10,
    gearMin: 0.48, gearMax: 6.00
  });

  // Baselines and Theoretical Calculations
  const tWeight = parseFloat(theoreticalData.weight);
  const tBias = parseFloat(theoreticalData.frontBias);
  const hasTheoData = !isNaN(tWeight) && !isNaN(tBias);
  const theoWd = hasTheoData ? tBias : (carParams?.weight_distribution || 50);

  const arbBaseline = calculateARBs(theoWd, limits.arbMin, limits.arbMax);
  const springsBaseline = calculateSprings(theoWd, limits.springMin, limits.springMax);
  const dampingBaseline = calculateDampers(theoWd, 1, 20, 0.6);

  const currentWeightLbs = hasTheoData ? convertWeightToLbs(tWeight) : convertWeightToLbs(carParams?.weight || 1500);

  const applyArbAssist = () => {
    const res = calculateARBsAdvanced(theoWd, carParams?.drivetrain || 'RWD', limits.arbMin, limits.arbMax);
    updateSection('arb', 'front', res.front);
    updateSection('arb', 'rear', res.rear);
  };

  const applyTireAssist = () => {
    const res = calculateTirePressures(tireRaceType, tireDriveType, tuning.alignment);
    updateSection('tires', 'front', res.front);
    updateSection('tires', 'rear', res.rear);
  };

  const applyAlignmentAssist = () => {
    const res = calculateAlignmentSettings(
      alignRaceType,
      (carParams?.drivetrain as Drivetrain) || 'AWD',
      tuning.springs.front,
      tuning.springs.rear,
      limits.springMin,
      limits.springMax,
      tuning.arb.front,
      tuning.arb.rear
    );
    updateSection('alignment', 'camberF', res.camberF);
    updateSection('alignment', 'camberR', res.camberR);
    updateSection('alignment', 'toeF', res.toeF);
    updateSection('alignment', 'toeR', res.toeR);
    updateSection('alignment', 'caster', res.caster);
  };

  const applySpringsAssist = () => {
    const res = calculateSpringsByFrequency(limits.springMin, limits.springMax, theoWd, targetFreq, 2.0, carParams?.maxHp, carParams?.weight);
    updateSection('springs', 'front', res.front);
    updateSection('springs', 'rear', res.rear);
  };

  const applyDampingAssist = () => {
    // Current springs are in internal kgf/mm. Convert to lbs/in for calculation.
    const frontLbsIn = tuning.springs.front * 55.9974;
    const rearLbsIn = tuning.springs.rear * 55.9974;
    const res = calculateDampersCritical(frontLbsIn, rearLbsIn, currentWeightLbs, theoWd, reboundRatio, bumpRatio);
    updateSection('damping', 'reboundF', res.frontRebound);
    updateSection('damping', 'reboundR', res.rearRebound);
    updateSection('damping', 'bumpF', res.frontBump);
    updateSection('damping', 'bumpR', res.rearBump);
  };

  const applyDiffBaseline = () => {
    if (saveCarParams) saveCarParams();
    const res = getDifferentialBaseline(carParams?.drivetrain || 'RWD', carParams?.maxHp, carParams?.maxTorque, carParams?.weight);
    updateSection('diff', 'accelF', res.accelF);
    updateSection('diff', 'decelF', res.decelF);
    updateSection('diff', 'accelR', res.accelR);
    updateSection('diff', 'decelR', res.decelR);
    if (res.center !== undefined) {
      updateSection('diff', 'center', res.center);
    }
  };

  // Auto-sync Max RPM from Telemetry
  useEffect(() => {
    if (telemetryData?.EngineMaxRpm && telemetryData.EngineMaxRpm > 0) {
      if (Math.abs(tuning.gearing.maxRpm - telemetryData.EngineMaxRpm) > 10) {
        setTuning(prev => ({
          ...prev,
          gearing: { ...prev.gearing, maxRpm: Math.round(telemetryData.EngineMaxRpm) }
        }));
      }
    }
  }, [telemetryData?.EngineMaxRpm]);

  const applyDiffDynamicAdjustment = () => {
    // Simple conceptual adjustment based on user feedback (scale roughly 0.14 weight)
    const newDiff = { ...tuning.diff };
    if (slipFeedback === 'accel_slip') {
      newDiff.accelF = Math.min(100, newDiff.accelF + 5);
      newDiff.accelR = Math.min(100, newDiff.accelR + 5);
    } else if (slipFeedback === 'decel_understeer') {
      newDiff.decelF = Math.max(0, newDiff.decelF - 5);
      newDiff.decelR = Math.max(0, newDiff.decelR - 5);
    }
    setTuning(prev => ({ ...prev, diff: newDiff }));
    setSlipFeedback('none');
  };

  const arbFixed = carParams?.adjustability?.arb === 'Fixed';
  const springsFixed = carParams?.adjustability?.suspension === 'Fixed' || carParams?.adjustability?.suspension === 'Street';
  const dampersFixed = carParams?.adjustability?.suspension === 'Fixed' || carParams?.adjustability?.suspension === 'Street';
  const gearboxFixed = carParams?.adjustability?.gearbox === 'Fixed';
  const gearboxFull = carParams?.adjustability?.gearbox === 'Full';

  useEffect(() => {
    fetchTunings();
  }, [carId]);

  const fetchTunings = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/tunings');
      const data = await res.json();
      if (data.tunings) {
        const carTunings = data.tunings.filter((t: string) => t.startsWith(`${carId}-`));
        setSavedTunings(carTunings);
      }
    } catch (e) {}
  };

  const saveTuning = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/tunings/${carId}/${saveName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tuning)
      });
      if (res.ok) {
        setSaveStatus('Saved!');
        fetchTunings();
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (e) {
      setSaveStatus('Save failed.');
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
      if (!data.error) {
        setTuning(data);
        setSaveName(sname);
      }
    } catch (e) {}
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

  const applySuggestedGearing = () => {
    if (saveCarParams) saveCarParams();
    const numGears = carParams?.adjustability?.gears || 6;
    const maxRpm = tuning.gearing.maxRpm;
    const newGears = [...tuning.gearing.gears];
    
    for (let i = 0; i < numGears - 1; i++) {
      const targetYi = getTheoreticalYi(i, numGears);
      newGears[i+1] = newGears[i] * (targetYi / maxRpm);
    }
    
    updateSection('gearing', 'gears', newGears);
  };



  const applyDragCorrection = () => {
    if (saveCarParams) saveCarParams();
    const numGears = carParams?.adjustability?.gears || 6;
    if (numGears < 2) return;
    
    // 1. Target Top Speed from inGameTopSpeed
    const speedMs = settings.units.speed === 'mph' ? inGameTopSpeed / 2.23694 : inGameTopSpeed / 3.6;
    
    // 2. Peak Power RPM
    const pPower = (carParams?.maxHpRpm && carParams.maxHpRpm > 0) ? carParams.maxHpRpm : tuning.gearing.maxRpm * 0.9;
    
    // 3. Required Top Gear Ratio to hit Peak Power at speedMs
    let topGearRatio = (pPower * 2 * Math.PI * 0.35) / (speedMs * tuning.gearing.finalDrive * 60);
    topGearRatio = Math.max(limits.gearMin, Math.min(limits.gearMax, topGearRatio));
    
    // 4. Interpolate gears 2 to N
    const newGears = [...tuning.gearing.gears];
    const gear0 = newGears[0];
    newGears[numGears - 1] = topGearRatio;
    
    const drag = (carParams?.aeroEfficiency ?? 0.5);
    const p = 0.4 + drag * 0.5; // Controls the curve
    
    for (let i = 1; i < numGears - 1; i++) {
      const x = i / (numGears - 1);
      const fx = Math.pow(x, p);
      let r = gear0 * Math.pow(topGearRatio / gear0, fx);
      newGears[i] = Math.max(limits.gearMin, Math.min(limits.gearMax, r));
    }
    
    updateSection('gearing', 'gears', newGears);
  };

  const getTheoreticalYi = (i: number, numGears: number) => {
    const pPower = (carParams?.maxHpRpm && carParams.maxHpRpm > 0) ? carParams.maxHpRpm : tuning.gearing.maxRpm * 0.9;
    const pTorque = (carParams?.maxTorqueRpm && carParams.maxTorqueRpm > 0) ? carParams.maxTorqueRpm : tuning.gearing.maxRpm * 0.7;
    const range = pPower - pTorque;
    
    if (gearingDiscipline === 'Rally') return pTorque;
    if (gearingDiscipline === 'Drift') {
      if (i === 0) return tuning.gearing.maxRpm * 0.5;
      let platformRpm = pTorque + range * 0.5;
      if (carParams?.induction === 'Turbo') platformRpm = pTorque + range * 0.7;
      if (carParams?.induction === 'TwinTurbo') platformRpm = pTorque + range * 0.4;
      return platformRpm;
    }
    
    // GT Discipline - Advanced Calculations
    const dt = carParams?.drivetrain || 'RWD';
    const mech = (carParams?.mechBalance ?? 0.5);
    const drag = (carParams?.aeroEfficiency ?? 0.5);
    const aeroBal = (carParams?.aeroBalance ?? 0.5);
    
    let tractionIndex = 0.7; // default
    if (dt === 'AWD') tractionIndex = 1.0;
    else if (dt === 'RWD') tractionIndex = Math.min(1.0, (1.0 - mech) + 0.2);
    else if (dt === 'FWD') tractionIndex = mech;
    
    const y1_ratio = 0.55 + (tractionIndex * 0.20);
    const y1 = tuning.gearing.maxRpm * y1_ratio;
    
    let p = 0.4 + drag * 0.5;
    if (dt === 'RWD') p += ((1.0 - aeroBal) - 0.5) * 0.1;
    
    if (numGears <= 2) return pPower;
    return y1 + (pPower - y1) * Math.pow(i / (numGears - 2), p);
  };

  // Unit Conversion
  const convertToUI = (val: number, type: string) => {
    if (type === 'pressure') return convertTirePressure(val).value;
    if (type === 'spring') return convertSpringRate(val).value;
    if (type === 'height') return convertHeight(val).value;
    if (type === 'force') return convertForce(val).value;
    return val;
  };
  const convertFromUI = (val: number, type: string) => {
    if (type === 'pressure') return convertTirePressureToBar(val);
    if (type === 'spring') return convertSpringRateToKgfmm(val);
    if (type === 'height') return convertHeightToCm(val);
    if (type === 'force') return convertForceToKgf(val);
    return val;
  };

  const getUnitLabel = (type: string) => {
    if (type === 'pressure') return ' ' + convertTirePressure(1).label;
    if (type === 'spring') return ' ' + convertSpringRate(1).label;
    if (type === 'height') return ' ' + convertHeight(1).label;
    if (type === 'force') return ' ' + convertForce(1).label;
    return '';
  };

    // --- Gearing Chart Logic ---
  const { gears, finalDrive, maxRpm } = tuning.gearing;
  const TIRE_RADIUS_M = 0.35; 
  const calcSpeed = (rpm: number, gearRatio: number) => {
    const speedMs = gearRatio === 0 ? 0 : ((rpm * 2 * Math.PI * TIRE_RADIUS_M) / (gearRatio * finalDrive * 60));
    return convertSpeed(speedMs).value;
  };
  const calcRpm = (speed: number, gearRatio: number) => {
    const speedMs = settings.units.speed === 'mph' ? speed / 2.23694 : speed / 3.6;
    return (speedMs) * (gearRatio * finalDrive * 60) / (2 * Math.PI * TIRE_RADIUS_M);
  };
  
  const numGears = carParams?.adjustability?.gears || 6;
  const chartData: any[] = [{ speed: 0, gear1: 0 }];
  for (let i = 0; i < numGears; i++) {
    const gearRatio = gears[i];
    if (gearRatio <= 0) continue;
    const maxSpeedForGear = calcSpeed(maxRpm, gearRatio);
    const endPoint: any = { speed: maxSpeedForGear };
    endPoint[`gear${i + 1}`] = maxRpm;
    if (i + 1 < numGears && gears[i + 1] > 0) {
      endPoint[`gear${i + 2}`] = calcRpm(maxSpeedForGear, gears[i + 1]);
      
      endPoint.currentEnvelope = maxRpm * (gears[i+1] / gearRatio);
      endPoint.theoreticalEnvelope = getTheoreticalYi(i, numGears);
    }
    chartData.push(endPoint);
  }
  const maxSpeed = chartData.length > 0 ? Math.max(...chartData.map(d => d.speed)) : 400;
  const xMax = Math.max(100, Math.ceil(maxSpeed / 50) * 50);
  const xTicks10s = []; for (let i = 0; i <= xMax; i += 10) xTicks10s.push(i);
  const xTicks50s = []; for (let i = 0; i <= xMax; i += 50) xTicks50s.push(i);
  const yMax = Math.ceil((maxRpm + 500) / 1000) * 1000;
  const yTicks100s = []; for (let i = 0; i <= yMax; i += 100) yTicks100s.push(i);
  const yTicks1000s = []; for (let i = 0; i <= yMax; i += 1000) yTicks1000s.push(i);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      {/* Top Bar */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ color: 'var(--text-secondary)' }}>Car: <strong style={{color:'white'}}>{carName} (ID: {carId})</strong></label>
          <span style={{color: 'gray'}}>|</span>
          <label style={{ color: 'var(--text-secondary)' }}>Save Name:</label>
          <input 
            type="text" 
            value={saveName} 
            onChange={(e) => setSaveName(e.target.value)}
            style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', width: '200px' }}
          />
          <button onClick={saveTuning} style={btnStyle}>Save Setup</button>
          <span style={{ color: 'var(--primary)' }}>{saveStatus}</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ color: 'var(--text-secondary)' }}>Load Profile:</label>
          <select onChange={(e) => loadTuning(e.target.value)} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>
            <option value="">-- Select Saved Tuning --</option>
            {savedTunings.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Left Sub-Nav */}
        <div className="glass-panel" style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
          {tuningCategories.map(cat => (
            <button key={cat} onClick={() => setActiveSubTab(cat)} style={{
                background: activeSubTab === cat ? 'rgba(0, 240, 255, 0.2)' : 'transparent', border: 'none', borderLeft: activeSubTab === cat ? '3px solid var(--primary)' : '3px solid transparent', color: activeSubTab === cat ? 'white' : 'var(--text-secondary)', padding: '0.8rem 1rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '0 4px 4px 0'
            }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Right Content Area */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0, color: 'var(--primary)' }}>{activeSubTab} Setup</h2>
            {setActiveTab && (
              <button onClick={() => setActiveTab('settings')} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>
                Unit Settings
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '2rem', height: '100%' }}>
            <div style={{ flex: 1, maxWidth: '550px', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '1rem' }}>
            
            {activeSubTab === 'Theoretical Performance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Enter the game's theoretical performance data here to reverse-calculate locked tuning settings. 
                  Calculated values will try to update when tuning changes.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Weight ({convertWeight(1).label})</span>
                    <input type="number" value={theoreticalData.weight} onChange={(e) => setTheoreticalData(p => ({...p, weight: e.target.value}))} style={{ width: '120px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }} placeholder="e.g. 1500"/>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Front Weight Bias (%)</span>
                    <input type="number" value={theoreticalData.frontBias} onChange={(e) => setTheoreticalData(p => ({...p, frontBias: e.target.value}))} style={{ width: '120px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }} placeholder="e.g. 52"/>
                  </div>
                </div>
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '1rem 0' }} />
                <h4 style={{ color: 'var(--primary)', margin: 0 }}>Performance Stats</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Top Speed (Calculated from Gearing)</span>
                    <span style={{ color: 'white', fontWeight: 'bold' }}>{maxSpeed.toFixed(1)} {convertSpeed(1/3.6).label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>0-100 km/h (In-game)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="number" value={theoreticalData.zeroTo100} onChange={(e) => setTheoreticalData(p => ({...p, zeroTo100: e.target.value}))} style={{ width: '100px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }}/>
                      <span style={{color: 'gray'}}>s</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Lateral Gs ({settings.units.speed === 'mph' ? '120 mph' : '193 km/h'})</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="number" value={theoreticalData.lateralG} onChange={(e) => setTheoreticalData(p => ({...p, lateralG: e.target.value}))} style={{ width: '100px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }}/>
                      <span style={{color: 'gray'}}>Gs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === 'Tires' && (
              <>
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Pressure" value={tuning.tires.front} min={1.0} max={4.0} unitType="pressure" section="tires" field="front" step={0.05} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear Pressure" value={tuning.tires.rear} min={1.0} max={4.0} unitType="pressure" section="tires" field="rear" step={0.05} />
              </>
            )}

            {activeSubTab === 'Alignment' && (
              <>
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Camber" value={tuning.alignment.camberF} min={-5.0} max={5.0} unitType="none" section="alignment" field="camberF" />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear Camber" value={tuning.alignment.camberR} min={-5.0} max={5.0} unitType="none" section="alignment" field="camberR" />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Toe" value={tuning.alignment.toeF} min={-5.0} max={5.0} unitType="none" section="alignment" field="toeF" />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear Toe" value={tuning.alignment.toeR} min={-5.0} max={5.0} unitType="none" section="alignment" field="toeR" />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Caster" value={tuning.alignment.caster} min={1.0} max={7.0} unitType="none" section="alignment" field="caster" />
              </>
            )}

            {activeSubTab === 'Anti-roll bars' && (
              <>
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front ARB" value={arbFixed ? arbBaseline.front : tuning.arb.front} min={limits.arbMin} max={limits.arbMax} unitType="none" section="arb" field="front" baseline={arbBaseline.front} disabled={arbFixed} isUnknown={arbFixed && !hasTheoData} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear ARB" value={arbFixed ? arbBaseline.rear : tuning.arb.rear} min={limits.arbMin} max={limits.arbMax} unitType="none" section="arb" field="rear" baseline={arbBaseline.rear} disabled={arbFixed} isUnknown={arbFixed && !hasTheoData} />
              </>
            )}

            {activeSubTab === 'Springs' && (
              <>
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Springs" value={springsFixed ? springsBaseline.front : tuning.springs.front} min={limits.springMin} max={limits.springMax} unitType="spring" section="springs" field="front" step={1} baseline={springsBaseline.front} disabled={springsFixed} isUnknown={springsFixed && !hasTheoData} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear Springs" value={springsFixed ? springsBaseline.rear : tuning.springs.rear} min={limits.springMin} max={limits.springMax} unitType="spring" section="springs" field="rear" step={1} baseline={springsBaseline.rear} disabled={springsFixed} isUnknown={springsFixed && !hasTheoData} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Ride Height" value={tuning.springs.heightF} min={5.0} max={30.0} unitType="height" section="springs" field="heightF" step={0.5} disabled={springsFixed} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear Ride Height" value={tuning.springs.heightR} min={5.0} max={30.0} unitType="height" section="springs" field="heightR" step={0.5} disabled={springsFixed} />
              </>
            )}

            {activeSubTab === 'Damping' && (
              <>
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Rebound" value={dampersFixed ? dampingBaseline.frontRebound : tuning.damping.reboundF} min={1.0} max={20.0} unitType="none" section="damping" field="reboundF" baseline={dampingBaseline.frontRebound} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear Rebound" value={dampersFixed ? dampingBaseline.rearRebound : tuning.damping.reboundR} min={1.0} max={20.0} unitType="none" section="damping" field="reboundR" baseline={dampingBaseline.rearRebound} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Front Bump" value={dampersFixed ? dampingBaseline.frontBump : tuning.damping.bumpF} min={1.0} max={20.0} unitType="none" section="damping" field="bumpF" baseline={dampingBaseline.frontBump} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Rear Bump" value={dampersFixed ? dampingBaseline.rearBump : tuning.damping.bumpR} min={1.0} max={20.0} unitType="none" section="damping" field="bumpR" baseline={dampingBaseline.rearBump} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
              </>
            )}

                        {activeSubTab === 'Aero' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: 'white' }}>Front Downforce</span>
                    <button 
                      onClick={() => {
                        const current = carParams?.adjustability?.aero || 'Fixed';
                        let next = current;
                        if (current === 'Fixed') next = 'Front Only';
                        else if (current === 'Rear Only') next = 'Adjustable';
                        else if (current === 'Front Only') next = 'Fixed';
                        else if (current === 'Adjustable') next = 'Rear Only';
                        if (carParams) {
                          setCarParams({ ...carParams, adjustability: { ...carParams.adjustability, aero: next } });
                          if (saveCarParams) saveCarParams();
                        }
                      }}
                      style={{ padding: '0.3rem 0.6rem', background: (carParams?.adjustability?.aero === 'Adjustable' || carParams?.adjustability?.aero === 'Front Only') ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)', color: (carParams?.adjustability?.aero === 'Adjustable' || carParams?.adjustability?.aero === 'Front Only') ? '#0f0' : '#f00', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      {(carParams?.adjustability?.aero === 'Adjustable' || carParams?.adjustability?.aero === 'Front Only') ? 'Unlocked' : 'Locked'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: 'white' }}>Rear Downforce</span>
                    <button 
                      onClick={() => {
                        const current = carParams?.adjustability?.aero || 'Fixed';
                        let next = current;
                        if (current === 'Fixed') next = 'Rear Only';
                        else if (current === 'Front Only') next = 'Adjustable';
                        else if (current === 'Rear Only') next = 'Fixed';
                        else if (current === 'Adjustable') next = 'Front Only';
                        if (carParams) {
                          setCarParams({ ...carParams, adjustability: { ...carParams.adjustability, aero: next } });
                          if (saveCarParams) saveCarParams();
                        }
                      }}
                      style={{ padding: '0.3rem 0.6rem', background: (carParams?.adjustability?.aero === 'Adjustable' || carParams?.adjustability?.aero === 'Rear Only') ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)', color: (carParams?.adjustability?.aero === 'Adjustable' || carParams?.adjustability?.aero === 'Rear Only') ? '#0f0' : '#f00', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      {(carParams?.adjustability?.aero === 'Adjustable' || carParams?.adjustability?.aero === 'Rear Only') ? 'Unlocked' : 'Locked'}
                    </button>
                  </div>
                </div>
                
                <TuningSlider label="Front Downforce" value={tuning.aero.front} min={50} max={500} unitType="force" section="aero" field="front" step={1} disabled={carParams?.adjustability?.aero === 'Fixed' || carParams?.adjustability?.aero === 'Rear Only'} updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} />
                <TuningSlider label="Rear Downforce" value={tuning.aero.rear} min={50} max={500} unitType="force" section="aero" field="rear" step={1} disabled={carParams?.adjustability?.aero === 'Fixed' || carParams?.adjustability?.aero === 'Front Only'} updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} />
              </div>
            )}

            {activeSubTab === 'Brake' && (
              <>
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Braking Balance (% Front)" value={tuning.brake.balance} min={0} max={100} unitType="none" section="brake" field="balance" step={1} disabled={carParams?.adjustability?.brakes === 'Fixed'} />
                <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Braking Pressure (%)" value={tuning.brake.pressure} min={10} max={200} unitType="none" section="brake" field="pressure" step={1} disabled={carParams?.adjustability?.brakes === 'Fixed'} />
              </>
            )}

            {activeSubTab === 'Differential' && (
              <>
                {(carParams?.drivetrain === 'FWD' || carParams?.drivetrain === 'AWD') && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Front</h4>
                    <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Acceleration" value={tuning.diff.accelF} min={0} max={100} unitType="none" section="diff" field="accelF" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                    <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Deceleration" value={tuning.diff.decelF} min={0} max={100} unitType="none" section="diff" field="decelF" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                  </div>
                )}
                {(carParams?.drivetrain === 'RWD' || carParams?.drivetrain === 'AWD') && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Rear</h4>
                    <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Acceleration" value={tuning.diff.accelR} min={0} max={100} unitType="none" section="diff" field="accelR" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                    <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Deceleration" value={tuning.diff.decelR} min={0} max={100} unitType="none" section="diff" field="decelR" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                  </div>
                )}
                {carParams?.drivetrain === 'AWD' && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Center</h4>
                    <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Balance (% Rear)" value={tuning.diff.center} min={0} max={100} unitType="none" section="diff" field="center" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                  </div>
                )}
              </>
            )}

            {activeSubTab === 'Gearing' && (
              <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', opacity: gearboxFixed ? 0.6 : 1, alignItems: 'center' }}>
                    <div>
                      <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Max RPM {gearboxFixed && <span style={{ color: 'gray', fontSize: '0.8rem', fontWeight: 'normal' }}>(Locked)</span>}</span>
                      {telemetryData?.EngineMaxRpm ? (
                        <span style={{ color: 'var(--primary)', fontSize: '0.7rem', marginLeft: '0.5rem', opacity: 0.8 }}>(Auto-Synced)</span>
                      ) : null}
                    </div>
                    <input type="number" value={tuning.gearing.maxRpm} onChange={(e) => updateSection('gearing', 'maxRpm', parseFloat(e.target.value))} step="100" disabled={gearboxFixed || !!telemetryData?.EngineMaxRpm} style={{ width: '100px', background: gearboxFixed ? 'rgba(0,0,0,0.1)' : 'rgba(255,0,0,0.2)', color: gearboxFixed ? 'gray' : 'white', border: '1px solid rgba(255,0,0,0.5)', borderRadius: '4px', textAlign: 'right', cursor: (gearboxFixed || !!telemetryData?.EngineMaxRpm) ? 'not-allowed' : 'text' }}/>
                  </div>
                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0' }} />
                  <TuningSlider updateSection={updateSection} convertToUI={convertToUI} convertFromUI={convertFromUI} getUnitLabel={getUnitLabel} label="Final Drive" value={tuning.gearing.finalDrive} min={limits.finalDriveMin} max={limits.finalDriveMax} unitType="none" section="gearing" field="finalDrive" step={0.01} disabled={gearboxFixed} />
                  
                  {gearboxFull && Array.from({length: numGears}).map((_, i) => (
                    <GearInput 
                      key={i} 
                      index={i} 
                      value={tuning.gearing.gears[i]} 
                      limits={limits}
                      updateGears={(index: number, val: number) => {
                        const newGears = [...tuning.gearing.gears];
                        newGears[index] = val;
                        for (let j = index + 1; j < newGears.length; j++) if (newGears[j] > newGears[j - 1]) newGears[j] = newGears[j - 1];
                        for (let j = index - 1; j >= 0; j--) if (newGears[j] < newGears[j + 1]) newGears[j] = newGears[j + 1];
                        setTuning(prev => ({...prev, gearing: {...prev.gearing, gears: newGears}}));
                      }} 
                    />
                  ))}
              </>
            )}

            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '1.5rem', overflowY: 'auto' }}>
            
            {activeSubTab === 'Tires' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Tires Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Calculates optimized tire pressures based on race type, drivetrain, and current alignment settings.</p>
                
                <div style={{ background: 'rgba(255, 165, 0, 0.1)', borderLeft: '3px solid orange', padding: '0.5rem', borderRadius: '2px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'orange', fontSize: '0.8rem', fontWeight: 'bold' }}>⚠️ Note:</span>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Tire pressures depend heavily on Alignment (Camber, Toe, Caster). Please ensure your Alignment is set before applying Tire Assist.</p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontSize: '0.9rem' }}>Drivetrain:</span>
                  <select value={tireDriveType} onChange={(e) => setTireDriveType(e.target.value as Drivetrain)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', width: '120px' }}>
                    <option value="AWD">AWD (四驅)</option>
                    <option value="RWD">RWD (後驅)</option>
                    <option value="FWD">FWD (前驅)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontSize: '0.9rem' }}>Race Type:</span>
                  <select value={tireRaceType} onChange={(e) => setTireRaceType(e.target.value as RaceType)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', width: '120px' }}>
                    <option value="Road">Road (公路/街頭)</option>
                    <option value="Rally">Rally (拉力/越野)</option>
                    <option value="Drift">Drift (甩尾賽)</option>
                    <option value="Drag">Drag (直線加速)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setActiveSubTab('Alignment')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white' }}>Go to Alignment</button>
                  <button onClick={applyTireAssist} style={{ ...btnStyle, flex: 2 }}>Apply Tire Assist</button>
                </div>
                
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Alignment Corrections Applied:</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Camber (F/R):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>-{ (0.04 * Math.abs(tuning.alignment.camberF)).toFixed(2) } / -{ (0.04 * Math.abs(tuning.alignment.camberR)).toFixed(2) } bar</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Toe (F/R):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>-{ (0.15 * Math.abs(tuning.alignment.toeF)).toFixed(2) } / -{ (0.15 * Math.abs(tuning.alignment.toeR)).toFixed(2) } bar</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Caster (F):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>-{ (0.01 * Math.max(0, tuning.alignment.caster - 5.0)).toFixed(2) } bar</span>
                </div>
              </div>
            )}

            {activeSubTab === 'Alignment' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Alignment Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Calculates optimized alignment based on Spring Stiffness Ratio (SR), ARB bias, and race type.
                </p>

                <div style={{ background: 'rgba(255, 165, 0, 0.1)', borderLeft: '3px solid orange', padding: '0.5rem', borderRadius: '2px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'orange', fontSize: '0.8rem', fontWeight: 'bold' }}>⚠️ Note:</span>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Alignment calculations depend heavily on Spring Stiffness Ratio (SR) and ARB bias. Please finish tuning Springs and ARBs first.</p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontSize: '0.9rem' }}>Race Type:</span>
                  <select value={alignRaceType} onChange={(e) => setAlignRaceType(e.target.value as RaceType)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', width: '130px' }}>
                    <option value="Road">Road (公路/街頭)</option>
                    <option value="Rally">Rally (拉力/越野)</option>
                    <option value="Drift">Drift (漂移賽)</option>
                    <option value="Drag">Drag (直線加速)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setActiveSubTab('Springs')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '0.8rem' }}>Go to Springs</button>
                  <button onClick={() => setActiveSubTab('Anti-roll bars')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '0.8rem' }}>Go to ARBs</button>
                  <button onClick={applyAlignmentAssist} style={{ ...btnStyle, flex: 2 }}>Apply Alignment Assist</button>
                </div>
                
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Current Spring SR (Stiffness Ratio):</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Front SR:</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>
                    {limits.springMax > limits.springMin 
                      ? ((tuning.springs.front - limits.springMin) / (limits.springMax - limits.springMin)).toFixed(2)
                      : '0.50'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Rear SR:</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>
                    {limits.springMax > limits.springMin 
                      ? ((tuning.springs.rear - limits.springMin) / (limits.springMax - limits.springMin)).toFixed(2)
                      : '0.50'}
                  </span>
                </div>
              </div>
            )}

            {activeSubTab === 'Springs' && (
              <>
                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>Dynamic Tuning Bounds</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ color: 'gray', fontSize: '0.8rem' }}>Springs Min/Max</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="number" value={limits.springMin} onChange={e => setLimits(p => ({...p, springMin: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                        <input type="number" value={limits.springMax} onChange={e => setLimits(p => ({...p, springMax: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Springs Assist</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Target Natural Frequency (Hz):</span>
                    <select value={targetFreq} onChange={(e) => setTargetFreq(parseFloat(e.target.value))} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px' }}>
                      <option value={1.75}>Soft (1.5 - 2.0 Hz)</option>
                      <option value={2.25}>Medium (2.0 - 2.5 Hz)</option>
                      <option value={2.75}>Hard (2.5 - 3.0 Hz)</option>
                    </select>
                  </div>
                  <button onClick={applySpringsAssist} disabled={springsFixed} style={{ ...btnStyle, opacity: springsFixed ? 0.5 : 1 }}>Apply Springs Assist</button>
                  
                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Theoretical Parameters</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'gray', fontSize: '0.8rem' }}>Base Frequency:</span>
                    <span style={{ color: 'white', fontSize: '0.8rem' }}>2.0 Hz</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'gray', fontSize: '0.8rem' }}>Target Frequency:</span>
                    <span style={{ color: 'white', fontSize: '0.8rem' }}>{targetFreq.toFixed(2)} Hz</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'gray', fontSize: '0.8rem' }}>Frequency Multiplier:</span>
                    <span style={{ color: 'white', fontSize: '0.8rem' }}>{Math.pow(targetFreq / 2.0, 2).toFixed(3)}x</span>
                  </div>
                </div>
              </>
            )}

            {activeSubTab === 'Anti-roll bars' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>ARB Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Calculates base ARB values based on weight distribution and drivetrain.
                </p>
                <button onClick={applyArbAssist} disabled={arbFixed} style={{ ...btnStyle, opacity: arbFixed ? 0.5 : 1 }}>Apply ARB Assist</button>
              </div>
            )}
            
            {activeSubTab === 'Damping' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Damping Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Uses Critical Damping formula mapping current spring rates.</p>
                
                <div style={{ background: 'rgba(255, 165, 0, 0.1)', borderLeft: '3px solid orange', padding: '0.5rem', borderRadius: '2px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'orange', fontSize: '0.8rem', fontWeight: 'bold' }}>⚠️ Note:</span>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Damping calculations map to your current Springs. Please finish tuning Springs first.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Target Rebound Ratio (0.65 - 0.85):</span>
                    <span style={{ color: 'var(--primary)' }}>{reboundRatio.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.5" max="1.0" step="0.01" value={reboundRatio} onChange={(e) => setReboundRatio(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--primary)' }} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Target Bump Ratio (0.45 - 0.65):</span>
                    <span style={{ color: 'var(--primary)' }}>{bumpRatio.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.3" max="0.8" step="0.01" value={bumpRatio} onChange={(e) => setBumpRatio(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--primary)' }} />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setActiveSubTab('Springs')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white' }}>Go to Springs</button>
                  <button onClick={applyDampingAssist} disabled={dampersFixed} style={{ ...btnStyle, flex: 2, opacity: dampersFixed ? 0.5 : 1 }}>Apply Damping Assist</button>
                </div>
                
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Theoretical Parameters</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Front Spring (lbs/in):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>{(tuning.springs.front * 55.9974).toFixed(1)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Critical Damping (Front):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>{(2 * Math.sqrt(tuning.springs.front * 55.9974 * (currentWeightLbs * (theoWd/100)))).toFixed(0)}</span>
                </div>
              </div>
            )}
            
            {activeSubTab === 'Differential' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Differential Assist</span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={applyDiffBaseline} disabled={carParams?.adjustability?.diff === 'Fixed'} style={{ ...btnStyle, flex: 1 }}>Apply Baseline</button>
                </div>
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                <span style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Dynamic Feedback (Manual)</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <select value={slipFeedback} onChange={(e) => setSlipFeedback(e.target.value)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', flex: 1 }}>
                    <option value="none">-- Select Issue --</option>
                    <option value="accel_slip">Inner wheel slip on corner exit</option>
                    <option value="decel_understeer">Understeer on corner entry</option>
                  </select>
                  <button onClick={applyDiffDynamicAdjustment} disabled={slipFeedback === 'none' || carParams?.adjustability?.diff === 'Fixed'} style={{ ...btnStyle, padding: '0.3rem 1rem' }}>Adjust</button>
                </div>
              </div>
            )}

            {activeSubTab === 'Gearing' && (
              <>
                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>Dynamic Tuning Bounds</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ color: 'gray', fontSize: '0.8rem' }}>Final Drive Min/Max</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="number" value={limits.finalDriveMin} onChange={e => setLimits(p => ({...p, finalDriveMin: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                        <input type="number" value={limits.finalDriveMax} onChange={e => setLimits(p => ({...p, finalDriveMax: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ color: 'gray', fontSize: '0.8rem' }}>Gears Min/Max</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="number" value={limits.gearMin} onChange={e => setLimits(p => ({...p, gearMin: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                        <input type="number" value={limits.gearMax} onChange={e => setLimits(p => ({...p, gearMax: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Gearing Assist (Based on 1st Gear)</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Discipline:</span>
                    <select value={gearingDiscipline} onChange={(e) => setGearingDiscipline(e.target.value as any)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px' }}>
                      <option value="GT">GT (Circuit / Logarithmic)</option>
                      <option value="Rally">Rally (Constant / High Torque)</option>
                      <option value="Drift">Drift (Step / Platform)</option>
                    </select>
                  </div>
                  {gearingDiscipline === 'GT' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.8rem' }}>Mech Balance (Front Ratio):</span>
                        <input type="number" min="0" max="1" step="0.001" value={(carParams?.mechBalance ?? 0.5)} onChange={(e) => { if(carParams) setCarParams({...carParams, mechBalance: parseFloat(e.target.value)}); }} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.2rem', borderRadius: '4px', textAlign: 'right' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.8rem' }}>Aero Drag Index:</span>
                        <input type="number" min="0" max="1" step="0.001" value={(carParams?.aeroEfficiency ?? 0.5)} onChange={(e) => { if(carParams) setCarParams({...carParams, aeroEfficiency: parseFloat(e.target.value)}); }} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.2rem', borderRadius: '4px', textAlign: 'right' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.8rem' }}>Aero Balance (Front Ratio):</span>
                        <input type="number" min="0" max="1" step="0.001" value={(carParams?.aeroBalance ?? 0.5)} onChange={(e) => { if(carParams) setCarParams({...carParams, aeroBalance: parseFloat(e.target.value)}); }} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.2rem', borderRadius: '4px', textAlign: 'right' }} />
                      </div>
                    </div>
                  )}
                  <button onClick={applySuggestedGearing} style={{ background: 'var(--primary)', color: 'black', border: 'none', padding: '0.5rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Apply Envelope to Gears 2-{numGears}</button>

                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Secondary Correction (Drag Optimizer)</span>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Anchors 1st Gear and Top Gear, generating a custom drag-optimized curve in between.</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Calculated Mechanical Limit:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{calcSpeed(tuning.gearing.maxRpm, tuning.gearing.gears[numGears - 1] || 1).toFixed(1)} {convertSpeed(1).label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>In-Game Top Speed ({convertSpeed(1).label}):</span>
                    <input type="number" value={inGameTopSpeed} onChange={(e) => setInGameTopSpeed(parseFloat(e.target.value))} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', textAlign: 'right' }} />
                  </div>
                  <button onClick={applyDragCorrection} style={{ background: 'var(--primary)', color: 'black', border: 'none', padding: '0.5rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Anchor Top Gear & Smooth</button>
                </div>
                
                <div style={{ flex: 1, minHeight: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="speed" type="number" domain={[0, xMax]} ticks={xTicks10s} tickFormatter={(val) => val % 50 === 0 ? val : ''} stroke="var(--text-secondary)" label={{ value: `Speed (${convertSpeed(1/3.6).label})`, position: 'bottom', fill: 'var(--text-secondary)' }} />
                      <YAxis type="number" domain={[0, yMax]} ticks={yTicks100s} tickFormatter={(val) => val % 1000 === 0 ? val : ''} stroke="var(--text-secondary)" label={{ value: 'Engine RPM', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }} labelFormatter={(val) => `Speed: ${Number(val).toFixed(1)} ${convertSpeed(1/3.6).label}`} />
                      {xTicks50s.map(val => <ReferenceLine key={`x-${val}`} x={val} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />)}
                      {yTicks1000s.map(val => <ReferenceLine key={`y-${val}`} y={val} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />)}
                      <ReferenceLine y={maxRpm} stroke="red" strokeDasharray="5 5" label={{ position: 'top', value: 'Redline', fill: 'red' }} />
                      {Array.from({length: numGears}).map((_, i) => (
                        <Line key={`gear-${i}`} type="linear" dataKey={`gear${i+1}`} stroke={`hsl(${i * 45}, 80%, 60%)`} strokeWidth={3} dot={false} isAnimationActive={false} connectNulls={true} />
                      ))}
                      <Line type="monotone" dataKey="currentEnvelope" stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeDasharray="5 5" dot={{r: 4, fill: 'white'}} isAnimationActive={false} connectNulls={true} name="Current Envelope" />
                      <Line type="monotone" dataKey="theoreticalEnvelope" stroke="var(--primary)" strokeWidth={2} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={true} name="Theoretical Envelope" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            
            </div>
          </div>

                    </div>
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


const TuningSlider = React.memo(({label, value, min, max, unitType, section, field, step=0.1, baseline, disabled=false, isUnknown=false, updateSection, convertToUI, convertFromUI, getUnitLabel}: any) => {
  const displayVal = isUnknown ? 'Unknown' : convertToUI(value, unitType);
  const uiMin = convertToUI(min, unitType);
  const uiMax = convertToUI(max, unitType);
  const uiBaseline = baseline !== undefined ? convertToUI(baseline, unitType) : undefined;
  
  const [localVal, setLocalVal] = React.useState(typeof displayVal === 'number' ? displayVal.toFixed(2) : '');
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused && typeof displayVal === 'number') {
      setLocalVal(displayVal.toFixed(2));
    }
  }, [displayVal, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localVal);
    if (!isNaN(parsed)) {
      updateSection(section, field, convertFromUI(parsed, unitType));
    } else {
      if (typeof displayVal === 'number') setLocalVal(displayVal.toFixed(2));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleBlur();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', opacity: disabled ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {label} 
          {uiBaseline !== undefined && !isUnknown && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>(Base: {uiBaseline.toFixed(1)}{getUnitLabel(unitType)})</span>}
          {disabled && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>(Locked)</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {isUnknown ? (
            <span style={{ width: '80px', textAlign: 'right', color: 'gray', fontStyle: 'italic' }}>Unknown</span>
          ) : (
            <>
              <input 
                type="number" 
                value={localVal} 
                onChange={(e) => setLocalVal(e.target.value)} 
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                step={step}
                disabled={disabled}
                style={{ width: '80px', background: disabled ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.3)', color: disabled ? 'gray' : 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', cursor: disabled ? 'not-allowed' : 'text' }}
              />
              <span style={{color: 'gray', fontSize: '0.8rem', width: '45px'}}>{getUnitLabel(unitType)}</span>
            </>
          )}
        </div>
      </div>
      <input 
        type="range" min={uiMin} max={uiMax} step={step} 
        value={isUnknown ? uiMin : (displayVal)} 
        onChange={(e) => updateSection(section, field, convertFromUI(parseFloat(e.target.value), unitType))}
        disabled={disabled}
        style={{ width: '100%', accentColor: disabled ? 'gray' : 'var(--primary)', cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
    </div>
  );
});


const GearInput = React.memo(({ index, value, updateGears, limits }: any) => {
  const [localVal, setLocalVal] = React.useState(typeof value === 'number' ? value.toFixed(2) : '');
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused && typeof value === 'number') {
      setLocalVal(value.toFixed(2));
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localVal);
    if (!isNaN(parsed)) {
      updateGears(index, parsed);
    } else if (typeof value === 'number') {
      setLocalVal(value.toFixed(2));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleBlur();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{index + 1}{index===0?'st':index===1?'nd':index===2?'rd':'th'} Gear</span>
        <input 
          type="number" 
          value={localVal} 
          onChange={(e) => setLocalVal(e.target.value)} 
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          step="0.01"
          style={{ width: '80px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right' }}
        />
      </div>
      <input 
        type="range" min={limits.gearMin} max={limits.gearMax} step={0.01} 
        value={value} 
        onChange={(e) => updateGears(index, parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
      />
    </div>
  );
});

export default TuningView;

