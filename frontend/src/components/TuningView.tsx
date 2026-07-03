import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from 'recharts';
import { useCarParams, CarParams } from '../context/CarParamsContext';
import { useTelemetryRecorder } from '../context/TelemetryRecorderContext';
import { analyzeTelemetrySession, DiagnosisReport } from '../utils/tuningDiagnosis';
import { 
  calculateARBsAdvanced,
  calculateSpringsByFrequency,
  calculateDampersCritical,
  getDifferentialBaseline,
  calculateTirePressures,
  RaceType,
  Drivetrain,
  calculateAEGOGearing
} from '../utils/tuningMath';
import { useSettings } from '../context/SettingsContext';

const TIRE_RADIUS_M = 0.32;

interface GearingTuning {
  finalDrive: number;
  gears: number[];
  maxRpm: number;
}

interface TuningState {
  tires: { front: number; rear: number };
  alignment: { camberF: number; camberR: number; toeF: number; toeR: number; caster: number };
  arb: { front: number; rear: number };
  springs: { front: number; rear: number; heightF: number; heightR: number };
  damping: { reboundF: number; reboundR: number; bumpF: number; bumpR: number };
  aero: { front: number; rear: number };
  brake: { balance: number; pressure: number };
  diff: { accelF: number; decelF: number; accelR: number; decelR: number; center: number };
  gearing: GearingTuning;
}

const initialTuning = (numGears: number): TuningState => ({
  tires: { front: 2.1, rear: 2.1 },
  alignment: { camberF: -1.5, camberR: -1.0, toeF: 0.0, toeR: 0.0, caster: 6.0 },
  arb: { front: 20.0, rear: 15.0 },
  springs: { front: 80.0, rear: 70.0, heightF: 15.0, heightR: 15.0 },
  damping: { reboundF: 9.0, reboundR: 8.0, bumpF: 5.5, bumpR: 5.0 },
  aero: { front: 100, rear: 200 },
  brake: { balance: 50, pressure: 100 },
  diff: { accelF: 40, decelF: 10, accelR: 70, decelR: 20, center: 65 },
  gearing: {
    finalDrive: 3.40,
    gears: Array(numGears).fill(0).map((_, i) => [2.89, 1.99, 1.49, 1.16, 0.94, 0.78, 0.68, 0.60, 0.54, 0.50][i] || 0.50),
    maxRpm: 8000
  }
});

const TuningView: React.FC<{ setActiveTab?: (tab: any) => void }> = () => {
  const { carId, carName, carParams, setCarParams, saveCarParams } = useCarParams();
  const { settings, convertTirePressure, convertTirePressureToBar, convertSpringRate, convertSpringRateToKgfmm, convertHeight, convertHeightToCm, convertSpeed, t } = useSettings();

  // Wizard Steps
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedSessionFile, setSelectedSessionFile] = useState<string>('current');
  const [telemetryPoints, setTelemetryPoints] = useState<any[]>([]);
  const [diagnosisReport, setDiagnosisReport] = useState<DiagnosisReport | null>(null);
  const [selectedRaceGoal, setSelectedRaceGoal] = useState<string>('Road');
  const [manualRecStatus, setManualRecStatus] = useState<'idle' | 'recording' | 'saving'>('idle');
  const [tuningMode, setTuningMode] = useState<'recommended' | 'custom'>('recommended');
  const [pMin, setPMin] = useState<number>(0.40);
  const [pMax, setPMax] = useState<number>(0.65);

  // Gearing states
  const [gearingMethod, setGearingMethod] = useState<'basic' | 'scientific' | 'drag_optimize'>('basic');
  const [gearingDiscipline, setGearingDiscipline] = useState<'GT' | 'Rally' | 'Drift' | 'Custom'>('GT');
  const [basicCustomP, setBasicCustomP] = useState<number>(0.5);

  // Drag states
  const [selectedDragSession, setSelectedDragSession] = useState<string>('');
  const [activeDragData, setActiveDragData] = useState<any[]>([]);
  const [dragTestStatus, setDragTestStatus] = useState<'idle' | 'waiting' | 'recording' | 'finished'>('idle');
  const [dragPointsCount, setDragPointsCount] = useState<number>(0);

  const numGears = carParams?.adjustability?.gears || 6;
  const [tuning, setTuning] = useState<TuningState>(() => initialTuning(numGears));
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [saveName, setSaveName] = useState<string>(`Tuning_${new Date().toISOString().slice(0, 10)}`);
  const [savedTunings, setSavedTunings] = useState<string[]>([]);

  // Telemetry Recorder
  const {
    fetchCurrentSessionData: globalFetchCurrentSessionData,
    savedSessions: globalSavedSessions
  } = useTelemetryRecorder();

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
  useEffect(() => {
    let interval: any;
    if (dragTestStatus === 'recording' || dragTestStatus === 'waiting') {
      interval = setInterval(async () => {
        try {
          const res = await fetch('http://127.0.0.1:8001/api/gearing/drag/status');
          const data = await res.json();
          setDragTestStatus(data.status);
          setDragPointsCount(data.points_count);
          if (data.status === 'finished') {
            clearInterval(interval);
            const dataRes = await fetch('http://127.0.0.1:8001/api/gearing/drag/data');
            const dataPts = await dataRes.json();
            setActiveDragData(dataPts);
          }
        } catch (e) {}
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [dragTestStatus]);

  const fetchTunings = async () => {
    if (!carId) return;
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/tunings/${carId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSavedTunings(data);
      }
    } catch (e) {}
  };

  const loadLastTuning = async () => {
    const last = localStorage.getItem(`last_tuning_${carId}`);
    if (last) {
      loadTuning(last);
    }
  };

  const saveTuning = async () => {
    if (!carId) return;
    try {
      setSaveStatus(t('Saving...'));
      const res = await fetch(`http://127.0.0.1:8001/api/tunings/${carId}/${saveName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tuning)
      });
      const data = await res.json();
      if (data.error) {
        setSaveStatus(data.error);
      } else {
        setSaveStatus(t('Saved successfully!'));
        const fullName = `${carId}-${saveName}`;
        localStorage.setItem(`last_tuning_${carId}`, fullName);
        fetchTunings();
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (e) {
      setSaveStatus(t('Save failed.'));
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
        setSaveName(sname);
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

  const handleStartManualRecord = async () => {
    try {
      setManualRecStatus('recording');
      await fetch('http://127.0.0.1:8001/api/analysis/recorder/start', { method: 'POST' });
    } catch (e) {
      console.error(e);
      setManualRecStatus('idle');
    }
  };

  const handleStopManualRecord = async () => {
    try {
      setManualRecStatus('saving');
      await fetch('http://127.0.0.1:8001/api/analysis/recorder/stop', { method: 'POST' });
      await globalFetchCurrentSessionData();
      const res = await fetch('http://127.0.0.1:8001/api/analysis/data');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setTelemetryPoints(data);
        if (carParams) {
          const report = analyzeTelemetrySession(data, carParams, selectedRaceGoal);
          setDiagnosisReport(report);
        }
        setManualRecStatus('idle');
        setCurrentStep(4);
      } else {
        alert(t("No telemetry points collected. Please drive for a few seconds first!"));
        setManualRecStatus('idle');
      }
    } catch (e) {
      console.error(e);
      setManualRecStatus('idle');
    }
  };

  const handleLoadSessionFile = async (filename: string) => {
    if (!filename) return;
    try {
      let data: any[] = [];
      if (filename === 'current') {
        await globalFetchCurrentSessionData();
        const res = await fetch('http://127.0.0.1:8001/api/analysis/data');
        data = await res.json();
      } else {
        const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${filename}`);
        data = await res.json();
      }

      if (Array.isArray(data) && data.length > 0) {
        setTelemetryPoints(data);
        if (carParams) {
          const report = analyzeTelemetrySession(data, carParams, selectedRaceGoal);
          setDiagnosisReport(report);
        }
        setCurrentStep(4);
      } else {
        alert(t("Failed to load telemetry or file is empty."));
      }
    } catch (e) {
      console.error(e);
    }
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

  // Drag Gearing Handlers
  const handleStartDragTest = async () => {
    try {
      setDragTestStatus('waiting');
      await fetch('http://127.0.0.1:8001/api/gearing/drag/start', { method: 'POST' });
    } catch (e) {}
  };

  const handleClearDragTest = async () => {
    try {
      await fetch('http://127.0.0.1:8001/api/gearing/drag/clear', { method: 'POST' });
      setDragTestStatus('idle');
      setDragPointsCount(0);
      setActiveDragData([]);
    } catch (e) {}
  };

  const handleSaveDragSession = async () => {
    if (!carId) return;
    try {
      await fetch('http://127.0.0.1:8001/api/gearing/drag/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ car_id: carId, car_name: carName })
      });
      alert(t("Drag test session saved successfully!"));
    } catch (e) {
    }
  };

  const handleLoadDragSession = async (filename: string) => {
    setSelectedDragSession(filename);
    if (!filename) {
      setActiveDragData([]);
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/gearing/drag/sessions/${filename}`);
      const data = await res.json();
      setActiveDragData(data.data);
    } catch (e) {}
  };

  const applyDragOptimizedGearing = async () => {
    if (!activeDragData || activeDragData.length === 0 || !carParams) return;
    try {
      const res = await fetch('http://127.0.0.1:8001/api/gearing/drag/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: activeDragData, car_params: carParams })
      });
      const opt = await res.json();
      if (!opt.error) {
        setTuning(prev => ({
          ...prev,
          gearing: {
            ...prev.gearing,
            finalDrive: Number(opt.optimized_fd.toFixed(2)),
            gears: prev.gearing.gears.map((g, idx) => idx === 0 ? Number(opt.optimized_g1.toFixed(2)) : g)
          }
        }));
        alert(t("Drag optimized FD & 1st gear applied!"));
      }
    } catch (e) {}
  };

  // Baseline auto-generator
  const generateBaselineTuning = () => {
    if (!carParams || carParams.weight <= 0 || carParams.weight_distribution <= 0) {
      return;
    }

    const weightKg = carParams.weight;
    const frontBias = carParams.weight_distribution;
    const drivetrain = carParams.drivetrain || 'RWD';

    const springsMin = carParams.spring_front_min ?? 10.0;
    const springsMax = carParams.spring_front_max ?? 120.0;
    const arbMin = carParams.arb_front_min ?? 1.0;
    const arbMax = carParams.arb_front_max ?? 65.0;

    let targetHz = carParams.target_ride_frequency ?? 2.4;
    if (!carParams.target_ride_frequency) {
      if (selectedRaceGoal === 'Rally') targetHz = 1.5;
      else if (selectedRaceGoal === 'Drift') targetHz = 2.0;
      else if (selectedRaceGoal === 'DangerSign') targetHz = 1.7;
      else if (selectedRaceGoal === 'SpeedZone') targetHz = 2.8;
      else if (selectedRaceGoal === 'Touge') targetHz = 2.5;
    }

    const calcSpringsRes = calculateSpringsByFrequency(
      springsMin,
      springsMax,
      frontBias,
      targetHz,
      2.0,
      carParams.maxHp,
      weightKg
    );

    const calcArbsRes = calculateARBsAdvanced(frontBias, drivetrain, arbMin, arbMax);
    if (selectedRaceGoal === 'Rally') {
      calcArbsRes.front *= 0.6;
      calcArbsRes.rear *= 0.6;
    } else if (selectedRaceGoal === 'Drift') {
      calcArbsRes.front *= 0.9;
      calcArbsRes.rear *= 1.2;
    }
    calcArbsRes.front = Math.max(arbMin, Math.min(arbMax, calcArbsRes.front));
    calcArbsRes.rear = Math.max(arbMin, Math.min(arbMax, calcArbsRes.rear));

    const weightLbs = weightKg * 2.20462;
    const frontLbsIn = calcSpringsRes.front * 55.9974;
    const rearLbsIn = calcSpringsRes.rear * 55.9974;
    const reboundRatio = carParams.target_rebound_ratio ?? 0.70;
    const bumpRatio = carParams.target_bump_ratio ?? 0.55;
    const calcDampersRes = calculateDampersCritical(
      frontLbsIn,
      rearLbsIn,
      weightLbs,
      frontBias,
      reboundRatio,
      bumpRatio
    );

    const calcTireRes = calculateTirePressures(
      (selectedRaceGoal === 'Rally' ? 'Rally' : selectedRaceGoal === 'Drift' ? 'Drift' : 'Road') as RaceType,
      drivetrain as Drivetrain,
      { camberF: -1.5, camberR: -1.0, toeF: 0.0, toeR: 0.0, caster: 6.0 }
    );

    const calcDiffRes = getDifferentialBaseline(drivetrain, carParams.maxHp, carParams.maxTorque, weightKg);
    if (selectedRaceGoal === 'Drift') {
      calcDiffRes.accelF = 100;
      calcDiffRes.decelF = 0;
      calcDiffRes.accelR = 100;
      calcDiffRes.decelR = 100;
    } else if (selectedRaceGoal === 'Rally') {
      calcDiffRes.accelF = 50;
      calcDiffRes.decelF = 0;
      calcDiffRes.accelR = 80;
      calcDiffRes.decelR = 10;
    }

    let centerBias = 65;
    if (drivetrain === 'AWD') {
      if (selectedRaceGoal === 'Rally') {
        centerBias = 55;
      } else if (selectedRaceGoal === 'Drift') {
        centerBias = 80;
      } else if (selectedRaceGoal === 'Touge') {
        centerBias = 70;
      } else if (selectedRaceGoal === 'SpeedZone' || selectedRaceGoal === 'Road') {
        centerBias = 65;
      } else if (selectedRaceGoal === 'DangerSign') {
        centerBias = 60;
      }
    }

    setTuning(prev => ({
      ...prev,
      tires: {
        front: Number(calcTireRes.front.toFixed(2)),
        rear: Number(calcTireRes.rear.toFixed(2))
      },
      arb: {
        front: Number(calcArbsRes.front.toFixed(1)),
        rear: Number(calcArbsRes.rear.toFixed(1))
      },
      springs: {
        ...prev.springs,
        front: Number(calcSpringsRes.front.toFixed(1)),
        rear: Number(calcSpringsRes.rear.toFixed(1)),
        heightF: selectedRaceGoal === 'Rally' ? 22 : selectedRaceGoal === 'Drift' ? 14 : 15,
        heightR: selectedRaceGoal === 'Rally' ? 22 : selectedRaceGoal === 'Drift' ? 14 : 15
      },
      damping: {
        reboundF: Number(calcDampersRes.frontRebound.toFixed(1)),
        reboundR: Number(calcDampersRes.rearRebound.toFixed(1)),
        bumpF: Number(calcDampersRes.frontBump.toFixed(1)),
        bumpR: Number(calcDampersRes.rearBump.toFixed(1))
      },
      diff: {
        accelF: calcDiffRes.accelF,
        decelF: calcDiffRes.decelF,
        accelR: calcDiffRes.accelR,
        decelR: calcDiffRes.decelR,
        center: centerBias
      }
    }));
  };

  // Unit Labels local helper
  const getUnitLabel = (type: string) => {
    if (type === 'pressure') return ' ' + convertTirePressure(1).label;
    if (type === 'spring') return ' ' + convertSpringRate(1).label;
    if (type === 'height') return ' cm';
    if (type === 'force') return ' kgf';
    return '';
  };

  // Chart speed calculators
  const calcSpeed = (rpm: number, gearRatio: number) => {
    const speedMs = gearRatio === 0 ? 0 : ((rpm * 2 * Math.PI * TIRE_RADIUS_M) / (gearRatio * tuning.gearing.finalDrive * 60));
    return convertSpeed(speedMs).value;
  };
  const calcRpm = (speed: number, gearRatio: number) => {
    const speedMs = settings.units.speed === 'mph' ? speed / 2.23694 : speed / 3.6;
    return (speedMs) * (gearRatio * tuning.gearing.finalDrive * 60) / (2 * Math.PI * TIRE_RADIUS_M);
  };

  const chartData: any[] = [{ speed: 0, gear1: 0 }];
  for (let i = 0; i < numGears; i++) {
    const gearRatio = tuning.gearing.gears[i];
    if (gearRatio <= 0) continue;
    const maxSpeedForGear = calcSpeed(tuning.gearing.maxRpm, gearRatio);
    const endPoint: any = { speed: maxSpeedForGear };
    endPoint[`gear${i + 1}`] = tuning.gearing.maxRpm;
    if (i + 1 < numGears && tuning.gearing.gears[i + 1] > 0) {
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
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: currentStep === stepNum ? '0 0 12px rgba(0, 180, 255, 0.3)' : 'none'
  });

  const hasCoreParams = carParams && carParams.weight > 0 && carParams.weight_distribution > 0;
  const hasOptionalSuspParams = carParams && 
    carParams.spring_front_min !== undefined && 
    carParams.spring_front_max !== undefined && 
    carParams.spring_rear_min !== undefined && 
    carParams.spring_rear_max !== undefined;

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
            {currentStep < 5 && (
              <button 
                onClick={() => {
                  if (currentStep === 1) {
                    generateBaselineTuning();
                  }
                  setCurrentStep(prev => prev + 1);
                }} 
                disabled={currentStep === 1 && !hasCoreParams}
                style={{ 
                  ...btnStyle, 
                  background: (currentStep === 1 && !hasCoreParams) ? 'gray' : 'var(--primary)',
                  color: (currentStep === 1 && !hasCoreParams) ? 'rgba(255,255,255,0.4)' : 'black',
                  cursor: (currentStep === 1 && !hasCoreParams) ? 'not-allowed' : 'pointer'
                }}
              >
                {t("Next")} ▶
              </button>
            )}
          </div>
        </div>

        {/* Wizard Stepper Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={stepHeaderStyle(1)} onClick={() => setCurrentStep(1)}>1. {t("Goal & Setup")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }} />
          <div style={stepHeaderStyle(2)} onClick={() => hasCoreParams && setCurrentStep(2)}>2. {t("Baseline Setup")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }} />
          <div style={stepHeaderStyle(3)} onClick={() => hasCoreParams && setCurrentStep(3)}>3. {t("Telemetry Load")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }} />
          <div style={stepHeaderStyle(4)} onClick={() => hasCoreParams && diagnosisReport && setCurrentStep(4)}>4. {t("Diagnosis & Correction")}</div>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }} />
          <div style={stepHeaderStyle(5)} onClick={() => hasCoreParams && setCurrentStep(5)}>5. {t("Save Setup")}</div>
        </div>
      </div>

      {/* Step Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.2rem' }}>
        
        {/* ================= STEP 1: GOAL & SETUP ================= */}
        {currentStep === 1 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>🎯 Step 1: {t("Define tuning goals & check parameters")}</h3>
            
            {/* Core Params Validation */}
            {!hasCoreParams ? (
              <div style={{ padding: '1.2rem', border: '1px solid #ff3d00', background: 'rgba(255, 61, 0, 0.05)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.8rem', alignItems: 'center' }}>
                <h4 style={{ color: '#ff3d00', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>⚠️ {t("Missing Core Vehicle Parameters")}</h4>
                <p style={{ textAlign: 'center', maxWidth: '600px', margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {t("Tuning calculator requires valid vehicle weight and weight distribution parameters to compute suspension baseline. Please fill them out below to unlock tuning wizard.")}
                </p>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>{t("Weight (kg)")}:</label>
                    <input type="number" value={carParams?.weight || ''} onChange={e => updateParam('weight', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} placeholder="e.g. 1450" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>{t("Front Bias (%)")}:</label>
                    <input type="number" value={carParams?.weight_distribution || ''} onChange={e => updateParam('weight_distribution', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: '100px' }} step="0.1" placeholder="e.g. 52.4" />
                  </div>
                </div>
                <button onClick={saveCarParams} style={{ ...btnStyle, background: '#ff3d00', color: 'white', padding: '0.4rem 1.2rem', fontSize: '0.85rem' }}>
                  💾 {t("Save Parameters")}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.6rem 0', color: 'var(--text-secondary)' }}>{t("Vehicle Profile Metadata")}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem' }}>
                    <div><span style={{ color: 'gray' }}>{t("Weight")}:</span> {Math.round(settings.units.weight === 'lbs' ? carParams.weight * 2.2046 : carParams.weight)} {settings.units.weight}</div>
                    <div><span style={{ color: 'gray' }}>{t("Weight Distribution")}:</span> {carParams.weight_distribution}% Front</div>
                    <div><span style={{ color: 'gray' }}>{t("Drivetrain")}:</span> {carParams.drivetrain}</div>
                    <div><span style={{ color: 'gray' }}>{t("Max Power")}:</span> {carParams.maxHp} HP @ {carParams.maxHpRpm || 'N/A'} RPM</div>
                  </div>
                </div>
                <div>
                  {/* Optional parameters warning check */}
                  {!hasOptionalSuspParams ? (
                    <div style={{ padding: '0.8rem', background: 'rgba(255, 170, 0, 0.08)', border: '1px solid rgba(255, 170, 0, 0.3)', borderRadius: '6px', color: '#ffaa00', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <div style={{ fontWeight: 600 }}>⚠️ {t("Warning: Missing Suspension Limits")}</div>
                      <div>
                        {t("This profile lacks spring slider limits. Calculator will fallback to default ranges. Consider adding them in 'Car Parameters' for max calculator accuracy.")}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#00e676', fontSize: '0.85rem', background: 'rgba(0, 230, 118, 0.05)', border: '1px solid rgba(0, 230, 118, 0.2)', padding: '0.8rem', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 600 }}>✓ {t("Complete suspension limits detected")}</div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                        {t("Spring limits")} ({convertSpringRate(carParams.spring_front_min || 0).value.toFixed(1)} - {convertSpringRate(carParams.spring_front_max || 0).value.toFixed(1)} {convertSpringRate(1).label}) {t("will be used to scale rigidity.")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Select Goal */}
            {hasCoreParams && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(0, 180, 255, 0.05)', border: '1px solid rgba(0, 180, 255, 0.15)', padding: '1.2rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>{t("Select Race / Tuning Goal:")}</span>
                  <select 
                    value={selectedRaceGoal} 
                    onChange={e => setSelectedRaceGoal(e.target.value)} 
                    style={{ ...inputStyle, width: '280px', border: '1px solid var(--primary)', background: 'black' }}
                  >
                    <option value="Road">{t("Road & Street (公路與街頭賽事)")}</option>
                    <option value="Touge">{t("Touge Mountain Pass (日本山道連續彎)")}</option>
                    <option value="Rally">{t("Rally & Cross Country (拉力與越野路面)")}</option>
                    <option value="Drift">{t("Drift Zone (開放世界甩尾區間)")}</option>
                    <option value="SpeedZone">{t("Speed Zone (高下壓力測速區間)")}</option>
                    <option value="DangerSign">{t("Danger Sign (高飛躍防底盤重擊)")}</option>
                  </select>
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.3' }}>
                  {selectedRaceGoal === 'Road' && t("Road setting optimizes suspension for maximum cornering grip and chassis stiffness on flat asphalt tracks.")}
                  {selectedRaceGoal === 'Touge' && t("Touge setup sharpens steering turn-in response and introduces mild oversteer for tight mountain hairpins.")}
                  {selectedRaceGoal === 'Rally' && t("Rally mode softens spring rates (Natural Freq ~ 1.5 Hz) and unlocks maximum height to absorb gravel and jumps.")}
                  {selectedRaceGoal === 'Drift' && t("Drift configuration locks differentials to 100%, uses front-hard-rear-soft springs, and sets extreme front camber.")}
                  {selectedRaceGoal === 'SpeedZone' && t("Speed Zone targets low drag aero and stiff suspension to withstand high high-speed downforce loads.")}
                  {selectedRaceGoal === 'DangerSign' && t("Danger Sign strengthens shock compression (Bump Damping) to cushion chassis impact upon vertical landings.")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 2: BASELINE SETUP ================= */}
        {currentStep === 2 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>📐 Step 2: {t("Apply calculated baseline setup in-game")}</h3>
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
              {t("These values are calculated mathematically using weight distribution and optimal natural frequency. Set these values in your Forza Tuning menu first:")}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              
              {/* Tires & Alignment */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', fontSize: '0.95rem' }}>
                  🚘 {t("Tires & Alignment")}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                  {/* Tire Pressure */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Tire Pressure")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.01" 
                        value={Number(convertTirePressure(tuning.tires.front).value.toFixed(2))} 
                        onChange={e => updateSection('tires', 'front', convertTirePressureToBar(parseFloat(e.target.value) || 0.0))}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.01" 
                        value={Number(convertTirePressure(tuning.tires.rear).value.toFixed(2))} 
                        onChange={e => updateSection('tires', 'rear', convertTirePressureToBar(parseFloat(e.target.value) || 0.0))}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>{convertTirePressure(1).label}</span>
                    </div>
                  </div>

                  {/* Camber */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Camber")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.alignment.camberF} 
                        onChange={e => updateSection('alignment', 'camberF', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.alignment.camberR} 
                        onChange={e => updateSection('alignment', 'camberR', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>°</span>
                    </div>
                  </div>

                  {/* Toe */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Toe")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.alignment.toeF} 
                        onChange={e => updateSection('alignment', 'toeF', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.alignment.toeR} 
                        onChange={e => updateSection('alignment', 'toeR', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>°</span>
                    </div>
                  </div>

                  {/* Caster */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Caster")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.alignment.caster} 
                        onChange={e => updateSection('alignment', 'caster', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="text" 
                        value="N/A" 
                        disabled={true}
                        style={{ ...smallInputStyle, opacity: 0.3, cursor: 'not-allowed', textAlign: 'center' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>°</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Suspension Settings */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', fontSize: '0.95rem' }}>
                  🔧 {t("Suspension Settings")}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                  {/* Anti-Roll Bars */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Anti-Roll Bars")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.arb.front} 
                        onChange={e => updateSection('arb', 'front', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.arb.rear} 
                        onChange={e => updateSection('arb', 'rear', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }} />
                    </div>
                  </div>

                  {/* Spring Stiffness */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Spring Stiffness")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={Number(convertSpringRate(tuning.springs.front).value.toFixed(1))} 
                        onChange={e => updateSection('springs', 'front', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0.0))}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={Number(convertSpringRate(tuning.springs.rear).value.toFixed(1))} 
                        onChange={e => updateSection('springs', 'rear', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0.0))}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>{convertSpringRate(1).label}</span>
                    </div>
                  </div>

                  {/* Ride Height */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Ride Height")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={Number(convertHeight(tuning.springs.heightF).value.toFixed(1))} 
                        onChange={e => updateSection('springs', 'heightF', convertHeightToCm(parseFloat(e.target.value) || 0.0))}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={Number(convertHeight(tuning.springs.heightR).value.toFixed(1))} 
                        onChange={e => updateSection('springs', 'heightR', convertHeightToCm(parseFloat(e.target.value) || 0.0))}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>{convertHeight(1).label}</span>
                    </div>
                  </div>

                  {/* Rebound Damping */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Rebound Damping")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.damping.reboundF} 
                        onChange={e => updateSection('damping', 'reboundF', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.damping.reboundR} 
                        onChange={e => updateSection('damping', 'reboundR', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }} />
                    </div>
                  </div>

                  {/* Bump Damping */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Bump Damping")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.damping.bumpF} 
                        onChange={e => updateSection('damping', 'bumpF', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="0.1" 
                        value={tuning.damping.bumpR} 
                        onChange={e => updateSection('damping', 'bumpR', parseFloat(e.target.value) || 0.0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Differential Settings */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', fontSize: '0.95rem' }}>
                  ⚙️ {t("Differential Settings")}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                  {/* Front Differential */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Front Differential")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Accel:")}</span>
                      <input 
                        type="number" step="1" 
                        value={tuning.diff.accelF} 
                        onChange={e => updateSection('diff', 'accelF', parseInt(e.target.value) || 0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Decel:")}</span>
                      <input 
                        type="number" step="1" 
                        value={tuning.diff.decelF} 
                        onChange={e => updateSection('diff', 'decelF', parseInt(e.target.value) || 0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>%</span>
                    </div>
                  </div>

                  {/* Rear Differential */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Rear Differential")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Accel:")}</span>
                      <input 
                        type="number" step="1" 
                        value={tuning.diff.accelR} 
                        onChange={e => updateSection('diff', 'accelR', parseInt(e.target.value) || 0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Decel:")}</span>
                      <input 
                        type="number" step="1" 
                        value={tuning.diff.decelR} 
                        onChange={e => updateSection('diff', 'decelR', parseInt(e.target.value) || 0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>%</span>
                    </div>
                  </div>

                  {/* Center Balance */}
                  {carParams?.drivetrain === 'AWD' ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
                      <span>{t("Center Balance")}</span>
                      <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                        <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Rear:")}</span>
                        <input 
                          type="number" step="1" 
                          value={tuning.diff.center} 
                          onChange={e => updateSection('diff', 'center', parseInt(e.target.value) || 0)}
                          disabled={tuningMode === 'recommended'}
                          style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                        />
                        <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '45px', textAlign: 'left' }}>% Rear</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem', opacity: 0.25 }}>
                      <span>{t("Center Balance")}</span>
                      <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                        <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Rear:")}</span>
                        <input 
                          type="text" 
                          value="N/A" 
                          disabled={true}
                          style={{ ...smallInputStyle, width: '40px', textAlign: 'center', cursor: 'not-allowed' }} 
                        />
                        <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '45px', textAlign: 'left' }}>% Rear</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Gearing Subsection inside Step 2 */}
            {/* Gearing Subsection inside Step 2 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem', marginTop: '0.5rem' }}>
              <div style={{ marginBottom: '0.8rem' }}>
                <h4 style={{ margin: 0, color: 'white', fontSize: '0.95rem' }}>⚙️ {t("Gearbox Ratios (Optional)")}</h4>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.9fr 1fr', gap: '1rem', alignItems: 'start' }}>
                {/* Gears Input panel */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '6px', maxHeight: '380px', height: '380px', overflowY: 'auto' }}>
                  <div style={formRowStyle}>
                    <span style={{fontSize: '0.8rem', opacity: tuningMode === 'recommended' ? 0.5 : 1}}>{t("Final Drive")}</span>
                    <input 
                      type="number" step="0.01" value={tuning.gearing.finalDrive} 
                      onChange={(e) => updateSection('gearing', 'finalDrive', parseFloat(e.target.value) || 3.40)} 
                      disabled={tuningMode === 'recommended'}
                      style={{ ...inputStyle, width: '60px', padding: '0.2rem', fontSize: '0.8rem', textAlign: 'right', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                    />
                  </div>
                  {Array.from({length: numGears}).map((_, i) => (
                    <div key={`gear-in-${i}`} style={{ ...formRowStyle, marginBottom: '0.3rem' }}>
                      <span style={{fontSize: '0.8rem', opacity: tuningMode === 'recommended' ? 0.5 : 1}}>{i + 1} Gear</span>
                      <input 
                        type="number" step="0.01" value={tuning.gearing.gears[i] || 0.0} 
                        onChange={(e) => {
                          const newGears = [...tuning.gearing.gears];
                          newGears[i] = parseFloat(e.target.value) || 0.0;
                          updateSection('gearing', 'gears', newGears);
                        }} 
                        disabled={tuningMode === 'recommended'}
                        style={{ ...inputStyle, width: '60px', padding: '0.2rem', fontSize: '0.8rem', textAlign: 'right', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                    </div>
                  ))}
                </div>

                {/* Gearing graph */}
                <div style={{ height: '380px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', padding: '0.5rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 15, right: 15, bottom: 5, left: -20 }}>
                      <XAxis dataKey="speed" type="number" domain={[0, xMax]} stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      <YAxis type="number" domain={[0, yMax]} stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      {carParams?.maxHpRpm && (
                        <ReferenceLine 
                          y={carParams.maxHpRpm} 
                          stroke="#ff3d00" 
                          strokeDasharray="3 3" 
                          label={{ value: `${t("Max HP")}: ${carParams.maxHpRpm} RPM`, fill: '#ff3d00', fontSize: 9, position: 'top' }} 
                        />
                      )}
                      {carParams?.maxTorqueRpm && (
                        <ReferenceLine 
                          y={carParams.maxTorqueRpm} 
                          stroke="#ffaa00" 
                          strokeDasharray="3 3" 
                          label={{ value: `${t("Max Torque")}: ${carParams.maxTorqueRpm} RPM`, fill: '#ffaa00', fontSize: 9, position: 'bottom' }} 
                        />
                      )}
                      {Array.from({length: numGears}).map((_, i) => (
                        <Line key={`gear-graph-${i}`} type="linear" dataKey={`gear${i+1}`} stroke={`hsl(${i * 45}, 80%, 60%)`} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={true} />
                      ))}
                      {/* Envelope Line */}
                      <Line 
                        type="monotone" 
                        dataKey="currentEnvelope" 
                        stroke="#ff00ff" 
                        strokeWidth={1.5}
                        strokeDasharray="4 4" 
                        name={t("Gearing Envelope")}
                        dot={false} 
                        isAnimationActive={false}
                        connectNulls={true}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Gearing Controls panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>{t("Tuning Method")}</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => setGearingMethod('basic')} style={{ ...btnStyle, flex: 1, fontSize: '0.72rem', padding: '0.2rem 0.3rem', background: gearingMethod==='basic'?'var(--primary)':'rgba(255,255,255,0.05)', color: gearingMethod==='basic'?'black':'white' }}>{t("Basic Linear")}</button>
                    <button onClick={() => setGearingMethod('scientific')} style={{ ...btnStyle, flex: 1, fontSize: '0.72rem', padding: '0.2rem 0.3rem', background: gearingMethod==='scientific'?'var(--primary)':'rgba(255,255,255,0.05)', color: gearingMethod==='scientific'?'black':'white' }}>{t("Scientific")}</button>
                  </div>

                  {gearingMethod === 'basic' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{t("Spacing (p):")}</span>
                        <span style={{ fontWeight: 'bold' }}>{basicCustomP.toFixed(2)}</span>
                      </div>
                      <input 
                        type="range" min={pMin} max={pMax} step="0.01" value={basicCustomP} 
                        onChange={(e) => setBasicCustomP(parseFloat(e.target.value))} 
                        style={{ width: '100%', accentColor: 'var(--primary)' }} 
                      />
                      <button 
                        onClick={applyBasicGearing}
                        style={{ ...btnStyle, fontSize: '0.75rem', padding: '0.35rem', marginTop: '0.3rem' }}
                      >
                        ⚙️ {t("Apply")}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{t("Discipline:")}</span>
                        <span style={{ fontWeight: 'bold', color: 'white' }}>{gearingDiscipline}</span>
                      </div>
                      <button 
                        onClick={applyScientificGearing} 
                        style={{ ...btnStyle, background: 'rgba(0, 180, 255, 0.2)', color: '#00b4ff', border: '1px solid rgba(0, 180, 255, 0.3)', fontSize: '0.75rem', padding: '0.35rem', marginTop: '0.3rem', width: '100%' }}
                      >
                        🚀 {t("Apply")}
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 3: TELEMETRY LOAD ================= */}
        {currentStep === 3 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>📊 Step 3: {t("Load telemetry data for analysis")}</h3>
            
            {/* Open World Manual Recording Control */}
            {['Drift', 'SpeedZone', 'DangerSign'].includes(selectedRaceGoal) ? (
              <div style={{ background: 'rgba(255, 61, 0, 0.05)', border: '1px solid rgba(255, 61, 0, 0.2)', padding: '1.2rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>⏺️ {t("Open-World Manual Telemetry Recording")}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: manualRecStatus === 'recording' ? 'red' : 'gray', display: 'inline-block' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {manualRecStatus === 'recording' ? t("RECORDING...") : manualRecStatus === 'saving' ? t("SAVING...") : t("IDLE")}
                    </span>
                  </div>
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.3' }}>
                  {t("Forza's open-world challenges (Drift Zones, Speed Zones, Danger Signs) do not trigger official race mode. Use these buttons to manually start and stop recording when you perform the challenge.")}
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                  {manualRecStatus !== 'recording' ? (
                    <button 
                      onClick={handleStartManualRecord} 
                      disabled={manualRecStatus === 'saving'}
                      style={{ ...btnStyle, background: '#ff3d00', color: 'white', flex: 1, padding: '0.5rem 1rem' }}
                    >
                      ⏺ {t("Start Recording Test")}
                    </button>
                  ) : (
                    <button 
                      onClick={handleStopManualRecord} 
                      style={{ ...btnStyle, background: '#00e676', color: 'black', flex: 1, padding: '0.5rem 1rem' }}
                    >
                      ⏹ {t("Stop & Load Analysis")}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(0, 230, 118, 0.05)', border: '1px solid rgba(0, 230, 118, 0.15)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                ℹ️ {t("Standard race mode will auto-record telemetry. You can load files directly below after finishing your race.")}
              </div>
            )}

            {/* Optional Drag Optimization for SpeedZone */}
            {selectedRaceGoal === 'SpeedZone' && (
              <div style={{ background: 'rgba(255, 150, 0, 0.05)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--accent)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.9rem' }}>🏎️ {t("Drag Test Optimizer (Alternative Gearing)")}</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleStartDragTest} style={{ ...btnStyle, flex: 1, padding: '0.35rem', fontSize: '0.75rem' }}>
                    {t("Start drag run")}
                  </button>
                  <button onClick={handleClearDragTest} style={{ ...btnStyle, flex: 1, padding: '0.35rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', color: 'white' }}>
                    {t("Reset run")}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
                  <span>{t("Drag Status:")} <strong style={{ color: dragTestStatus==='recording'?'#0f0':'white' }}>{dragTestStatus.toUpperCase()}</strong></span>
                  <span>{dragPointsCount} {t("pts collected")}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select 
                    value={selectedDragSession} 
                    onChange={(e) => handleLoadDragSession(e.target.value)}
                    style={{ background: 'black', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', flex: 1, fontSize: '0.8rem' }}
                  >
                    <option value="">-- {t("Select Drag Test Run")} --</option>
                    {globalSavedSessions.map((s: any) => (
                      <option key={s.filename} value={s.filename}>{s.filename}</option>
                    ))}
                  </select>
                  <button onClick={handleSaveDragSession} style={{ ...btnStyle, padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', color: 'white' }}>💾 {t("Save Run")}</button>
                </div>
                <button 
                  onClick={applyDragOptimizedGearing} 
                  disabled={!activeDragData || activeDragData.length === 0}
                  style={{ ...btnStyle, background: (activeDragData && activeDragData.length > 0) ? 'var(--accent)' : 'gray', color: 'black', fontSize: '0.8rem', padding: '0.4rem' }}
                >
                  ⚙️ {t("Calculate optimized FD & 1st gear")}
                </button>
              </div>
            )}

            {/* Load Saved Session Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.2rem', borderRadius: '8px' }}>
              <label style={{ fontWeight: 600, color: 'white' }}>{t("Load Telemetry File (JSON):")}</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <select 
                  value={selectedSessionFile} 
                  onChange={e => setSelectedSessionFile(e.target.value)} 
                  style={{ ...inputStyle, flex: 1, background: 'black' }}
                >
                  <option value="current">-- {t("Latest Raw Telemetry Session (latest.json)")} --</option>
                  {globalSavedSessions.map((s: any) => (
                    <option key={s.filename} value={s.filename}>
                      {s.filename} ({Math.round(s.size / 1024)} KB)
                    </option>
                  ))}
                </select>
                <button 
                  onClick={() => handleLoadSessionFile(selectedSessionFile)} 
                  style={{ ...btnStyle, padding: '0.5rem 1.5rem' }}
                >
                  📥 {t("Load & Analyze")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: DIAGNOSIS & CORRECTION ================= */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            
            {/* Header Status Card */}
            <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>🔍 Step 4: {t("Telemetry Diagnostic Report")}</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t("Analyzed Points:")} <strong style={{ color: 'white' }}>{telemetryPoints.length}</strong>
              </span>
            </div>

            {!diagnosisReport ? (
              <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {t("No telemetry file loaded. Please go to Step 3 to select and analyze a session first.")}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '1.5rem', alignItems: 'start' }}>
                
                {/* Left Side: Dynamic Data Visualizations */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Jump height graph (Only for DangerSign or detected jump) */}
                  {diagnosisReport.jumpAnalysis && (
                    <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>🚀 {t("Danger Sign Height & Airtime Profile")}</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Max Jump Height")}</div>
                          <div style={{ fontSize: '1.1rem', color: '#00ffff', fontWeight: 'bold' }}>
                            {settings.units.rideHeight === 'in' 
                              ? `${(diagnosisReport.jumpAnalysis.maxHeightDelta * 3.28084).toFixed(1)} ft` 
                              : `${diagnosisReport.jumpAnalysis.maxHeightDelta.toFixed(1)} m`}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Airtime")}</div>
                          <div style={{ fontSize: '1.1rem', color: '#00ffff', fontWeight: 'bold' }}>{diagnosisReport.jumpAnalysis.airtime} s</div>
                        </div>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Landing Force")}</div>
                          <div style={{ fontSize: '1.1rem', color: diagnosisReport.jumpAnalysis.landingSuspensionMax >= 0.98 ? '#ff3d00' : 'white', fontWeight: 'bold' }}>
                            {diagnosisReport.jumpAnalysis.maxLandingImpactG.toFixed(1)} G
                          </div>
                        </div>
                      </div>
                      <div style={{ height: '180px', width: '100%', marginTop: '0.4rem' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={telemetryPoints.filter((_, idx) => idx % 4 === 0)} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
                            <defs>
                              <linearGradient id="heightColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#00b4ff" stopOpacity={0.6}/>
                                <stop offset="95%" stopColor="#00b4ff" stopOpacity={0.0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" fontSize={9} />
                            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={9} domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }} />
                            <Area type="monotone" dataKey="PositionY" stroke="#00b4ff" fillOpacity={1} fill="url(#heightColor)" strokeWidth={2} name="PositionY" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Drift Stability Panel */}
                  {diagnosisReport.driftAnalysis && (
                    <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>💨 {t("Drift Angle & Stability Performance")}</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Avg Drift Angle")}</div>
                          <div style={{ fontSize: '1.1rem', color: '#ff9f00', fontWeight: 'bold' }}>{diagnosisReport.driftAnalysis.avgDriftAngle}°</div>
                        </div>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Drift Stability")}</div>
                          <div style={{ fontSize: '1.1rem', color: diagnosisReport.driftAnalysis.driftStability >= 75 ? '#00e676' : 'yellow', fontWeight: 'bold' }}>
                            {diagnosisReport.driftAnalysis.driftStability}%
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Drift Time Ratio")}</div>
                          <div style={{ fontSize: '1.1rem', color: 'white', fontWeight: 'bold' }}>{diagnosisReport.driftAnalysis.driftTimePercent}%</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Speed Cornering and Powerband efficiency */}
                  {diagnosisReport.speedAnalysis && (
                    <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>🏁 {t("Cornering Speed & Powerband Overlap")}</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Max Speed")}</div>
                          <div style={{ fontSize: '1.1rem', color: 'white', fontWeight: 'bold' }}>
                            {convertSpeed(diagnosisReport.speedAnalysis.maxSpeed / 3.6).value.toFixed(1)} {convertSpeed(1/3.6).label}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Corner Speed Loss")}</div>
                          <div style={{ fontSize: '1.1rem', color: diagnosisReport.speedAnalysis.speedDropPercent > 35 ? '#ff5f5f' : 'white', fontWeight: 'bold' }}>
                            {diagnosisReport.speedAnalysis.speedDropPercent}%
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'gray' }}>{t("Powerband Overlap")}</div>
                          <div style={{ fontSize: '1.1rem', color: diagnosisReport.speedAnalysis.powerbandEfficiency >= 70 ? '#00e676' : 'yellow', fontWeight: 'bold' }}>
                            {diagnosisReport.speedAnalysis.powerbandEfficiency}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Suspension Travel Chart */}
                  <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>📊 {t("Suspension Damping Travel & Bottom-Out Rates")}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'gray' }}>{t("Front Max Travel:")}</span> <strong style={{ color: 'white' }}>{(diagnosisReport.suspension.frontMaxTravel * 100).toFixed(0)}%</strong>
                        <div style={{ color: diagnosisReport.suspension.frontBottomOutRate > 1.5 ? '#ff3d00' : '#00e676', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                          {t("Front Bottom-Out Rate:")} {diagnosisReport.suspension.frontBottomOutRate}%
                        </div>
                      </div>
                      <div>
                        <span style={{ color: 'gray' }}>{t("Rear Max Travel:")}</span> <strong style={{ color: 'white' }}>{(diagnosisReport.suspension.rearMaxTravel * 100).toFixed(0)}%</strong>
                        <div style={{ color: diagnosisReport.suspension.rearBottomOutRate > 1.5 ? '#ff3d00' : '#00e676', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                          {t("Rear Bottom-Out Rate:")} {diagnosisReport.suspension.rearBottomOutRate}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Specific Correction Advice */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Automatic corrections */}
                  <div className="glass-panel" style={{ padding: '1.2rem', border: '1px solid rgba(0, 180, 255, 0.2)', background: 'rgba(0, 180, 255, 0.03)' }}>
                    <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', fontSize: '0.95rem' }}>🔧 {t("Recommended Correction Settings")}</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '300px', overflowY: 'auto' }}>
                      {diagnosisReport.suspension.advice.map((adv, idx) => (
                        <div key={`susp-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #ffaa00', background: 'rgba(255,170,0,0.03)' }}>{adv}</div>
                      ))}
                      {diagnosisReport.jumpAnalysis?.advice.map((adv, idx) => (
                        <div key={`jump-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #00b4ff', background: 'rgba(0,180,255,0.03)' }}>{adv}</div>
                      ))}
                      {diagnosisReport.driftAnalysis?.advice.map((adv, idx) => (
                        <div key={`drift-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #ff9f00', background: 'rgba(255,159,0,0.03)' }}>{adv}</div>
                      ))}
                      {diagnosisReport.speedAnalysis?.advice.map((adv, idx) => (
                        <div key={`speed-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #00e676', background: 'rgba(0,230,118,0.03)' }}>{adv}</div>
                      ))}
                    </div>
                  </div>

                  {/* Manual Diagnostic Guide Zone */}
                  <div className="glass-panel" style={{ padding: '1.2rem', background: 'rgba(255, 170, 0, 0.03)', border: '1px solid rgba(255, 170, 0, 0.15)' }}>
                    <h4 style={{ margin: '0 0 0.8rem 0', color: '#ffaa00', fontSize: '0.95rem' }}>📖 {t("Manual Telemetry Diagnostic Guide")}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
                      <div>
                        <strong style={{ color: 'white' }}>{t("1. Camber Temperature Difference:")}</strong><br />
                        {t("Forza UDP telemetry does not provide inner/center/outer tire temps. During high lateral G cornering, open game telemetry UI and check FL/FR/RL/RR tire temp blocks. Outer side temp should be slightly warmer than inner (ideal diff: 2-5°C). If outer side is too hot, increase negative Camber (e.g. -1.5 to -2.0).")}
                      </div>
                      <div>
                        <strong style={{ color: 'white' }}>{t("2. Tire Pressure Status:")}</strong><br />
                        {t("Forza UDP telemetry does not output tire pressure. Drive 2-3 laps and check tire temperature color. Light green is optimal; light blue is cold (under-inflated); orange/red is hot (over-inflated). Adjust cold tire pressure accordingly by +/- 0.1 Bar.")}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ================= STEP 5: ITERATIVE OPTIMIZATION & SAVE ================= */}
        {currentStep === 5 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>💾 Step 5: {t("Final adjustments & Save setup profile")}</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '6px' }}>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                <label style={{ color: 'var(--text-secondary)' }}>{t("Save Setup Name:")}</label>
                <input 
                  type="text" 
                  value={saveName} 
                  onChange={(e) => setSaveName(e.target.value)}
                  style={{ padding: '0.4rem', background: 'black', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', width: '180px' }}
                />
                <button onClick={saveTuning} style={btnStyle}>{t("Save This Setup")}</button>
                <span style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>{saveStatus}</span>
              </div>
              
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                <label style={{ color: 'var(--text-secondary)' }}>{t("Load Profile:")}</label>
                <select onChange={(e) => loadTuning(e.target.value)} style={{ padding: '0.4rem', background: 'black', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>
                  <option value="">-- {t("Select Saved Tuning")} --</option>
                  {savedTunings.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Sliders adjustment list */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              {/* Left sliders */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.3rem', fontSize: '0.95rem' }}>
                  🚘 {t("Tire Pressure & ARB Sliders")}
                </h4>
                <TuningSlider label={t("Front Tire Pressure")} value={tuning.tires.front} min={1.0} max={4.0} step={0.01} unitType="pressure" section="tires" field="front" updateSection={updateSection} convertToUI={convertTirePressure} convertFromUI={convertTirePressureToBar} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Rear Tire Pressure")} value={tuning.tires.rear} min={1.0} max={4.0} step={0.01} unitType="pressure" section="tires" field="rear" updateSection={updateSection} convertToUI={convertTirePressure} convertFromUI={convertTirePressureToBar} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Front Anti-roll Bar")} value={tuning.arb.front} min={carParams?.arb_front_min ?? 1.0} max={carParams?.arb_front_max ?? 65.0} step={0.1} unitType="force" section="arb" field="front" updateSection={updateSection} convertToUI={(v: any) => ({value:v,label:''})} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Rear Anti-roll Bar")} value={tuning.arb.rear} min={carParams?.arb_rear_min ?? 1.0} max={carParams?.arb_rear_max ?? 65.0} step={0.1} unitType="force" section="arb" field="rear" updateSection={updateSection} convertToUI={(v: any) => ({value:v,label:''})} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
              </div>

              {/* Right sliders */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.3rem', fontSize: '0.95rem' }}>
                  {t("Suspension & Damping Sliders")}
                </h4>
                <TuningSlider label={t("Front Springs")} value={tuning.springs.front} min={carParams?.spring_front_min ?? 10.0} max={carParams?.spring_front_max ?? 120.0} step={0.1} unitType="spring" section="springs" field="front" updateSection={updateSection} convertToUI={convertSpringRate} convertFromUI={convertSpringRateToKgfmm} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Rear Springs")} value={tuning.springs.rear} min={carParams?.spring_rear_min ?? 10.0} max={carParams?.spring_rear_max ?? 120.0} step={0.1} unitType="spring" section="springs" field="rear" updateSection={updateSection} convertToUI={convertSpringRate} convertFromUI={convertSpringRateToKgfmm} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Front Ride Height")} value={tuning.springs.heightF} min={5.0} max={35.0} step={0.1} unitType="height" section="springs" field="heightF" updateSection={updateSection} convertToUI={convertHeight} convertFromUI={convertHeightToCm} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Rear Ride Height")} value={tuning.springs.heightR} min={5.0} max={35.0} step={0.1} unitType="height" section="springs" field="heightR" updateSection={updateSection} convertToUI={convertHeight} convertFromUI={convertHeightToCm} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Front Rebound Damping")} value={tuning.damping.reboundF} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="reboundF" updateSection={updateSection} convertToUI={(v: any) => ({value:v,label:''})} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Rear Rebound Damping")} value={tuning.damping.reboundR} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="reboundR" updateSection={updateSection} convertToUI={(v: any) => ({value:v,label:''})} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Front Bump Damping")} value={tuning.damping.bumpF} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="bumpF" updateSection={updateSection} convertToUI={(v: any) => ({value:v,label:''})} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
                <TuningSlider label={t("Rear Bump Damping")} value={tuning.damping.bumpR} min={1.0} max={20.0} step={0.1} unitType="force" section="damping" field="bumpR" updateSection={updateSection} convertToUI={(v: any) => ({value:v,label:''})} convertFromUI={(v: any) => v} getUnitLabel={getUnitLabel} />
              </div>
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

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.8rem'
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '4px',
  padding: '0.4rem',
  outline: 'none'
};

const smallInputStyle: React.CSSProperties = {
  background: 'black',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '4px',
  padding: '0.2rem',
  width: '55px',
  textAlign: 'right',
  fontSize: '0.8rem',
  outline: 'none'
};

const TuningSlider = React.memo(({label, value, min, max, unitType, section, field, step=0.1, baseline, disabled=false, isUnknown=false, updateSection, convertToUI, convertFromUI, getUnitLabel}: any) => {
  const { t } = useSettings();
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
          {uiBaseline !== undefined && !isUnknown && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>({t("Base:")} {uiBaseline.toFixed(1)}{getUnitLabel(unitType)})</span>}
          {disabled && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>({t("Locked")})</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {isUnknown ? (
            <span style={{ width: '80px', textAlign: 'right', color: 'gray', fontStyle: 'italic' }}>{t("Unknown")}</span>
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

export default TuningView;
