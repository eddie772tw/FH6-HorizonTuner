import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry } from '../../hooks/useTelemetry';
import { useSettings } from '../../context/SettingsContext';
import { useCarParams } from '../../context/CarParamsContext';
import { useTelemetryRecorder } from '../../context/TelemetryRecorderContext';
import SteerBar from './components/SteerBar';
import GForceRadar from './components/GForceRadar';
import VerticalInputBar from './components/VerticalInputBar';
import PedalTraceCanvas from './components/PedalTraceCanvas';
import TireRadar from './components/TireRadar';
import SuspensionBar from './components/SuspensionBar';
import EngineRpmDisplay from './components/EngineRpmDisplay';
import VehicleDynamicsDisplay from './components/VehicleDynamicsDisplay';

const AnalysisView = React.lazy(() => import('../analysis/AnalysisView'));
const DragTestView = React.lazy(() => import('../drag_test/DragTestView'));


const getCarClassString = (cls?: number) => {
  if (cls === undefined) return '';
  const classes = ['E', 'D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  if (cls >= 0 && cls < classes.length) return classes[cls];
  return `Class ${cls}`;
};




const formatTime = (seconds: number) => {
  if (seconds <= 0) return "--:--.---";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const activeTabStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const inactiveTabStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  cursor: 'pointer',
};

// --- Extracted selectors for memoized components ---
const selectClutch = (d: any) => d.ClutchInput || 0;
const selectHandbrake = (d: any) => d.HandBrakeInput || 0;







// --- COMPONENT: TelemetryView MAIN ---
const TelemetryView: React.FC = () => {
  const [subTab, setSubTab] = useState<'live' | 'analysis' | 'drag'>('live');
  const [isHudPaused, setIsHudPaused] = useState<boolean>(false);
  const { data } = useTelemetry();
  const { t } = useSettings();
  const { carName } = useCarParams();
  const { isRecording, loadSavedSession } = useTelemetryRecorder();

  const activeDataRef = useRef<any>(null);
  const prevIsRacingRef = useRef<boolean>(false);

  useEffect(() => {
    const channel = new BroadcastChannel('horizon_tuner_hud_channel');
    const checkConfig = (cfg: any) => {
      if (cfg && cfg.enabled && cfg.pauseTelemetryViewWhenActive) {
        setIsHudPaused(true);
        (window as any).__IS_HUD_PAUSED__ = true;
      } else {
        setIsHudPaused(false);
        (window as any).__IS_HUD_PAUSED__ = false;
      }
    };

    const port = (window as any).BACKEND_PORT || 8001;
    fetch(`http://127.0.0.1:${port}/api/overlay/config`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) checkConfig(data); })
      .catch(() => {});

    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'config') {
        checkConfig(event.data.data);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // Monitor IsRaceOn to auto-redirect and load the latest session on race completion
  useEffect(() => {
    if (!data) return;
    const isRacingNow = data.IsRaceOn === 1;
    
    // Transition from racing (true) to not racing (false)
    if (prevIsRacingRef.current && !isRacingNow) {
      if (isRecording) {
        const timer = setTimeout(async () => {
          await loadSavedSession('latest.json');
          setSubTab('analysis');
        }, 500);
        return () => clearTimeout(timer);
      }
    }
    prevIsRacingRef.current = isRacingNow;
  }, [data?.IsRaceOn, isRecording, loadSavedSession]);

  if (!isHudPaused) {
    activeDataRef.current = data;
  }
  const displayData = activeDataRef.current;

  const isRacing = displayData?.IsRaceOn === 1;

  const rpm = displayData?.CurrentEngineRpm || 0;
  const rpmIdle = displayData?.EngineIdleRpm || 0;
  const rpmMax = displayData?.EngineMaxRpm || 1;
  const rpmPercent = Math.max(0, Math.min(100, ((rpm - rpmIdle) / (rpmMax - rpmIdle)) * 100));

  const speedData = convertSpeed(displayData?.SpeedMetersPerSecond || 0);
  const powerData = convertPower(displayData?.PowerWatts || 0);
  const torqueData = convertTorque(displayData?.TorqueNewtons || 0);
  const boostData = convertBoost(displayData?.Boost || 0);

  const gear = displayData?.Gear || 0;
  const currentLap = displayData?.CurrentLap || 0;
  const bestLap = displayData?.BestLap || 0;
  const lastLap = displayData?.LastLap || 0;

  const classDisplay = getCarClassString(displayData?.CarClass);

  const isEV = displayData?.EngineIdleRpm === 0;
  const isRegenActive = isEV && (powerData.value < 0 || torqueData.value < 0);


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: isRacing ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: isRacing ? '0 0 10px var(--primary)' : 'none' }} />
            <span style={{ fontWeight: 600, color: isRacing ? '#fff' : 'var(--text-secondary)' }}>
              {isRacing ? t("LIVE TELEMETRY") : t("PAUSED")}
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={subTab === 'live' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('live')} aria-current={subTab === 'live' ? 'page' : undefined}>{t("Dashboard")}</button>
            <button style={subTab === 'analysis' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('analysis')} aria-current={subTab === 'analysis' ? 'page' : undefined}>{t("Post-Race Analysis")}</button>
            <button style={subTab === 'drag' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('drag')} aria-current={subTab === 'drag' ? 'page' : undefined}>{t("Drag Test")}</button>
          </div>
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
          {classDisplay && <span style={{ color: '#00f0ff', marginRight: '0.6rem' }}>{classDisplay}</span>}
          {isEV && <span style={{ background: '#00ff88', color: '#000', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', marginRight: '0.6rem', fontWeight: 'bold' }}>{t("EV")}</span>}
          {carName}
        </div>
      </div>

      {isHudPaused && (
        <div style={{
          padding: '0.8rem 1.2rem',
          marginBottom: '1.5rem',
          background: 'rgba(255, 170, 0, 0.12)',
          border: '1px solid rgba(255, 170, 0, 0.4)',
          borderRadius: '8px',
          color: '#ffaa00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.9rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⏸️</span>
            <strong>{t("Telemetry rendering paused (HUD Overlay is active)")}</strong>
          </div>
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            {t("Can be toggled in HUD Control Panel")}
          </span>
        </div>
      )}

      {subTab === 'analysis' ? (
        <React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{t("Loading Analysis...")}</div>}>
          <AnalysisView />
        </React.Suspense>
      ) : subTab === 'drag' ? (
        <React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{t("Loading Drag Test...")}</div>}>
          <DragTestView />
        </React.Suspense>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '4.5fr 5.5fr', gap: '2rem', flex: 1, minHeight: '600px' }}>
      
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>{t("Driver Inputs & Engine")}</h3>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <EngineRpmDisplay />
            <SteerBar />
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <PedalTraceCanvas />
            </div>
            <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', padding: '0 0.5rem' }}>
              <VerticalInputBar label={t("Clutch")} selector={selectClutch} max={255} color="#0088ff" />
              <VerticalInputBar label={t("Handbrake")} selector={selectHandbrake} max={255} color="#ffaa00" />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>{t("Vehicle Dynamics Overview")}</h3>
        <div style={{ display: 'flex', gap: '2rem', flex: 1, alignItems: 'center' }}>
          <VehicleDynamicsDisplay />
          <GForceRadar />
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>{t("Tire Grip & Status")}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1rem', flex: 1 }}>
          <TireRadar title={t("Front Left")} isLeft={true} tireIdx={0} />
          <TireRadar title={t("Front Right")} isLeft={false} tireIdx={1} />
          <TireRadar title={t("Rear Left")} isLeft={true} tireIdx={2} />
          <TireRadar title={t("Rear Right")} isLeft={false} tireIdx={3} />
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>{t("Suspension Travel")}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1.2rem', flex: 1 }}>
          <SuspensionBar title={t("Front Left")} isLeft={true} tireIdx={0} />
          <SuspensionBar title={t("Front Right")} isLeft={false} tireIdx={1} />
          <SuspensionBar title={t("Rear Left")} isLeft={true} tireIdx={2} />
          <SuspensionBar title={t("Rear Right")} isLeft={false} tireIdx={3} />
        </div>
      </div>

      </div>
      )}
    </div>
  );
};

export default TelemetryView;
