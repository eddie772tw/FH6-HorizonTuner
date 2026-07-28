import React, { useState, useEffect, useRef } from 'react';
import { useCarParams, CarParams } from '../../context/CarParamsContext';
import { useTelemetryRecorder } from '../../context/TelemetryRecorderContext';
import { analyzeTelemetrySession, DiagnosisReport } from '../../utils/tuningDiagnosis';
import { 
  calculateARBsAdvanced,
  calculateSpringsByFrequency,
  calculateDampersCritical,
  getDifferentialBaseline,
  calculateTirePressures,
  RaceType,
  Drivetrain,
  calculateAEGOGearing
} from '../../utils/tuningMath';
import { useSettings } from '../../context/SettingsContext';
import { SuspensionTuner } from './components/SuspensionTuner';
import { GearingTuner } from './components/GearingTuner';
import { DifferentialTuner } from './components/DifferentialTuner';
import { DiagnosisPanel } from './components/DiagnosisPanel';
import { DragTestSection } from './components/DragTestSection';
import { TuningSliderGrid } from './components/TuningSliderGrid';
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
  const { settings, convertTirePressure, convertTirePressureToBar, convertSpringRate, convertSpeed, t } = useSettings();

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>{t("Tire Compound")}:</label>
                    <select value={carParams?.tireType || 'Stock'} onChange={e => updateParam('tireType', e.target.value)} style={{ ...inputStyle, width: '120px' }}>
                      <option value="Stock">Stock</option>
                      <option value="Street">Street</option>
                      <option value="Sport">Sport</option>
                      <option value="Semi-Slick">Semi-Slick</option>
                      <option value="Slick">Slick</option>
                      <option value="Rally">Rally</option>
                      <option value="Off-Road">Off-Road</option>
                      <option value="Snow">Snow</option>
                      <option value="Drag">Drag</option>
                      <option value="Drift">Drift</option>
                    </select>
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
                    <div><span style={{ color: 'gray' }}>{t("Tire Compound")}:</span> {carParams.tireType || 'Stock'}</div>
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

                  {/* Aerodynamics */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t("Aerodynamics")}</span>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
                      <input 
                        type="number" step="1" 
                        value={tuning.aero.front} 
                        onChange={e => updateSection('aero', 'front', parseFloat(e.target.value) || 0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
                      <input 
                        type="number" step="1" 
                        value={tuning.aero.rear} 
                        onChange={e => updateSection('aero', 'rear', parseFloat(e.target.value) || 0)}
                        disabled={tuningMode === 'recommended'}
                        style={{ ...smallInputStyle, opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
                      />
                      <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}></span>
                    </div>
                  </div>
                </div>
              </div>

              <SuspensionTuner tuning={tuning} tuningMode={tuningMode} updateSection={updateSection} />

              {/* Differential Settings */}
              <DifferentialTuner tuning={tuning} tuningMode={tuningMode} updateSection={updateSection} drivetrain={carParams?.drivetrain} />

            </div>

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
            <DragTestSection 
              selectedRaceGoal={selectedRaceGoal}
              dragTestStatus={dragTestStatus}
              dragPointsCount={dragPointsCount}
              selectedDragSession={selectedDragSession}
              globalSavedSessions={globalSavedSessions}
              activeDragData={activeDragData}
              handleStartDragTest={handleStartDragTest}
              handleClearDragTest={handleClearDragTest}
              handleLoadDragSession={handleLoadDragSession}
              handleSaveDragSession={handleSaveDragSession}
              applyDragOptimizedGearing={applyDragOptimizedGearing}
            />

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

<DiagnosisPanel 
              diagnosisReport={diagnosisReport} 
              telemetryPoints={telemetryPoints} 
            />
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
            <TuningSliderGrid 
              tuning={tuning} 
              carParams={carParams} 
              updateSection={updateSection} 
            />
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



export default TuningView;
