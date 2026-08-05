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






// Button classes will be applied directly instead of these objects

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
      .catch(() => { });

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

  const classDisplay = getCarClassString(displayData?.CarClass);
  const isEV = displayData?.EngineIdleRpm === 0;


  return (
    <div className="d-flex flex-column h-100">
      <div className="d-flex justify-content-between align-items-center mb-4 p-3 rounded border" style={{ background: 'var(--surface-1)', borderColor: 'var(--divider) !important' }}>
        <div className="d-flex gap-3 align-items-center">
          <div className="d-flex align-items-center gap-2">
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: isRacing ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: isRacing ? '0 0 10px var(--primary)' : 'none' }} />
            <span className={isRacing ? "fw-bold text-primary" : "fw-bold text-secondary"}>
              {isRacing ? t("LIVE TELEMETRY") : t("PAUSED")}
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'var(--divider)' }} />
          <div className="d-flex gap-2">
            <button className={`btn btn-sm ${subTab === 'live' ? 'btn-primary' : ''}`} style={subTab !== 'live' ? { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: 'none' } : { fontWeight: 'bold', color: '#000' }} onClick={() => setSubTab('live')} aria-current={subTab === 'live' ? 'page' : undefined}>{t("Dashboard")}</button>
            <button className={`btn btn-sm ${subTab === 'analysis' ? 'btn-primary' : ''}`} style={subTab !== 'analysis' ? { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: 'none' } : { fontWeight: 'bold', color: '#000' }} onClick={() => setSubTab('analysis')} aria-current={subTab === 'analysis' ? 'page' : undefined}>{t("Post-Race Analysis")}</button>
            <button className={`btn btn-sm ${subTab === 'drag' ? 'btn-primary' : ''}`} style={subTab !== 'drag' ? { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: 'none' } : { fontWeight: 'bold', color: '#000' }} onClick={() => setSubTab('drag')} aria-current={subTab === 'drag' ? 'page' : undefined}>{t("Drag Test")}</button>
          </div>
        </div>
        <div className="d-flex align-items-center fw-bold text-secondary fs-6">
          {classDisplay && <span className="me-2" style={{ color: '#00f0ff' }}>{classDisplay}</span>}
          {isEV && <span className="badge me-2 fw-bold text-dark" style={{ background: '#00ff88' }}>{t("EV")}</span>}
          {carName}
        </div>
      </div>

      {isHudPaused && (
        <div className="alert d-flex align-items-center justify-content-between mb-4 shadow-sm" style={{ background: 'rgba(255, 170, 0, 0.12)', border: '1px solid rgba(255, 170, 0, 0.4)', color: '#ffaa00' }}>
          <div className="d-flex align-items-center gap-2">
            <span className="fs-5">⏸️</span>
            <strong>{t("Telemetry rendering paused (HUD Overlay is active)")}</strong>
          </div>
          <span className="small opacity-75">
            {t("Can be toggled in HUD Control Panel")}
          </span>
        </div>
      )}

      {subTab === 'analysis' ? (
        <React.Suspense fallback={<div className="p-5 text-center text-secondary">{t("Loading Analysis...")}</div>}>
          <AnalysisView />
        </React.Suspense>
      ) : subTab === 'drag' ? (
        <React.Suspense fallback={<div className="p-5 text-center text-secondary">{t("Loading Drag Test...")}</div>}>
          <DragTestView />
        </React.Suspense>
      ) : (
        <div className="d-grid gap-4 flex-grow-1" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '4.5fr 5.5fr', minHeight: '600px' }}>

          <div className="glass-panel d-flex flex-column gap-3">
            <h3 className="m-0">{t("Driver Inputs & Engine")}</h3>
            <div className="d-flex flex-column justify-content-center gap-3 flex-grow-1">
              <div className="d-flex gap-4 align-items-center">
                <EngineRpmDisplay />
                <SteerBar />
              </div>
              <div className="d-flex gap-3 align-items-center mt-2">
                <div className="d-flex flex-column justify-content-center flex-grow-1">
                  <PedalTraceCanvas />
                </div>
                <div className="d-flex gap-3 align-items-center px-2">
                  <VerticalInputBar label={t("Clutch")} selector={selectClutch} max={255} color="#0088ff" />
                  <VerticalInputBar label={t("Handbrake")} selector={selectHandbrake} max={255} color="#ffaa00" />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel d-flex flex-column gap-3">
            <h3 className="m-0">{t("Vehicle Dynamics Overview")}</h3>
            <div className="d-flex gap-4 align-items-center flex-grow-1">
              <VehicleDynamicsDisplay />
              <GForceRadar />
            </div>
          </div>

          <div className="glass-panel d-flex flex-column">
            <h3 className="mb-3 m-0">{t("Tire Grip & Status")}</h3>
            <div className="d-grid gap-3 flex-grow-1" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
              <TireRadar title={t("Front Left")} isLeft={true} tireIdx={0} />
              <TireRadar title={t("Front Right")} isLeft={false} tireIdx={1} />
              <TireRadar title={t("Rear Left")} isLeft={true} tireIdx={2} />
              <TireRadar title={t("Rear Right")} isLeft={false} tireIdx={3} />
            </div>
          </div>

          <div className="glass-panel d-flex flex-column">
            <h3 className="mb-3 m-0">{t("Suspension Travel")}</h3>
            <div className="d-grid gap-3 flex-grow-1" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
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
