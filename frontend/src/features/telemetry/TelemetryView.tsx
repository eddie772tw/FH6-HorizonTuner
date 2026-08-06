import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry } from '../../hooks/useTelemetry';
import { useSettings } from '../../context/SettingsContext';
import { useCarParams } from '../../context/CarParamsContext';
import { useTelemetryRecorder } from '../../context/TelemetryRecorderContext';
import GForceRadar from './components/GForceRadar';
import VerticalInputBar from './components/VerticalInputBar';
import PedalTraceCanvas from './components/PedalTraceCanvas';
import TireRadar from './components/TireRadar';
import SuspensionBar from './components/SuspensionBar';
import EngineRpmDisplay from './components/EngineRpmDisplay';
import VehicleDynamicsDisplay from './components/VehicleDynamicsDisplay';
import PowerTorqueCanvas from './components/PowerTorqueCanvas';
import ArcSteerGauge from './components/ArcSteerGauge';
import RenderSwitch from './components/RenderSwitch';

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
const selectAccel = (d: any) => d.AccelInput || 0;
const selectBrake = (d: any) => d.BrakeInput || 0;
const selectHandbrake = (d: any) => d.HandBrakeInput || 0;







// --- COMPONENT: TelemetryView MAIN ---
interface TelemetryViewProps {
  subTab?: 'live' | 'analysis' | 'drag';
  setSubTab?: (tab: 'live' | 'analysis' | 'drag') => void;
}

interface BlockRenderConfig {
  traces: boolean;
  dynamicsRadar: boolean;
  tireRadar: boolean;
  suspensionTrace: boolean;
}

const TelemetryView: React.FC<TelemetryViewProps> = ({ subTab: propSubTab, setSubTab: propSetSubTab }) => {
  const [internalSubTab, setInternalSubTab] = useState<'live' | 'analysis' | 'drag'>('live');
  const subTab = propSubTab !== undefined ? propSubTab : internalSubTab;
  const setSubTab = propSetSubTab !== undefined ? propSetSubTab : setInternalSubTab;

  const [isHudPaused, setIsHudPaused] = useState<boolean>(false);
  const { data: telemetryData } = useTelemetry();
  const { t } = useSettings();
  const { carName } = useCarParams();
  const { isRecording, loadSavedSession } = useTelemetryRecorder();

  const [renderConfig, setRenderConfig] = useState<BlockRenderConfig>(() => {
    try {
      const saved = localStorage.getItem('telemetry_block_render_config');
      if (saved) {
        return { traces: true, dynamicsRadar: true, tireRadar: true, suspensionTrace: true, ...JSON.parse(saved) };
      }
    } catch {}
    return { traces: true, dynamicsRadar: true, tireRadar: true, suspensionTrace: true };
  });

  const toggleBlockRender = (key: keyof BlockRenderConfig) => {
    setRenderConfig(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('telemetry_block_render_config', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

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
      .then(res => res.json())
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

  const [showPopover, setShowPopover] = useState<boolean>(isHudPaused);

  // Auto-pop popover whenever isHudPaused is active (e.g. switching tabs to telemetry or HUD paused state changes)
  useEffect(() => {
    if (isHudPaused) {
      setShowPopover(true);
    }
  }, [isHudPaused]);

  // Monitor IsRaceOn to auto-redirect and load the latest session on race completion
  useEffect(() => {
    if (!telemetryData) return;
    const isRacingNow = telemetryData.IsRaceOn === 1;

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
  }, [telemetryData?.IsRaceOn, isRecording, loadSavedSession, setSubTab]);

  const isRacing = telemetryData?.IsRaceOn === 1;
  const classDisplay = getCarClassString(telemetryData?.CarClass);
  const displayCarName = carName || t("Unknown Car");
  const isEV = telemetryData?.EngineIdleRpm === 0;

  return (
    <div className="d-flex flex-column h-100 w-100 overflow-hidden">
      
      {/* Header bar */}
      <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom flex-shrink-0">
        <div className="d-flex align-items-center gap-3">
          <div 
            className="position-relative d-inline-flex align-items-center gap-2"
            onClick={() => { if (isHudPaused) setShowPopover(prev => !prev); }}
            style={{ cursor: isHudPaused ? 'pointer' : 'default' }}
          >
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: isHudPaused ? 'var(--bs-warning)' : isRacing ? 'var(--bs-primary)' : 'var(--bs-secondary)',
              boxShadow: isHudPaused ? '0 0 10px var(--bs-warning)' : isRacing ? '0 0 10px var(--bs-primary)' : 'none'
            }} />
            <span className={isHudPaused ? "fw-bold text-warning fs-6 m-0" : isRacing ? "fw-bold text-primary fs-6 m-0" : "fw-bold text-secondary fs-6 m-0"}>
              {isHudPaused ? t("RENDER PAUSED (OVERLAY ACTIVE)") : isRacing ? t("RACE DATA LIVE") : t("GAME IDLE / MENU")}
            </span>

            {/* Downward Popover */}
            {isHudPaused && showPopover && (
              <div 
                className="popover bs-popover-bottom show glass-panel shadow-lg border"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  zIndex: 1050,
                  minWidth: '320px',
                  backdropFilter: 'blur(16px)',
                  background: 'var(--glass-bg)',
                  borderColor: 'var(--bs-warning)',
                  cursor: 'default'
                }}
                role="tooltip"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    left: '20px',
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid var(--bs-warning)'
                  }} 
                />
                <div className="popover-header bg-transparent border-bottom border-secondary border-opacity-25 px-3 py-2 text-warning fw-bold fs-7 d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <span>{t("HUD Overlay Active")}</span>
                    <span className="badge text-bg-warning">PAUSED</span>
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-sm"
                    aria-label="Close"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPopover(false);
                    }}
                  ></button>
                </div>
                <div className="popover-body px-3 py-2 text-start">
                  <div className="fs-7 text-body fw-medium">
                    {t("Telemetry rendering paused (HUD Overlay is active)")}
                  </div>
                  <div className="fs-8 text-secondary mt-1">
                    {t("Can be toggled in HUD Control Panel")}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="vr opacity-25" style={{ height: '20px' }} />

          <ul className="nav nav-pills gap-1" role="tablist">
            <li className="nav-item" role="presentation">
              <button className={`nav-link btn-sm ${subTab === 'live' ? 'active fw-bold' : ''}`} onClick={() => setSubTab('live')}>{t("Dashboard")}</button>
            </li>
            <li className="nav-item" role="presentation">
              <button className={`nav-link btn-sm ${subTab === 'analysis' ? 'active fw-bold' : ''}`} onClick={() => setSubTab('analysis')}>{t("Post-Race Analysis")}</button>
            </li>
            <li className="nav-item" role="presentation">
              <button className={`nav-link btn-sm ${subTab === 'drag' ? 'active fw-bold' : ''}`} onClick={() => setSubTab('drag')}>{t("Drag Test")}</button>
            </li>
          </ul>
        </div>

        <div className="d-flex align-items-center fw-bold text-secondary fs-6">
          {classDisplay && <span className="badge text-bg-info me-2">{classDisplay}</span>}
          {isEV && <span className="badge text-bg-success me-2">{t("EV")}</span>}
          <span className="text-truncate" style={{ maxWidth: '200px' }}>{displayCarName}</span>
        </div>
      </div>

      {subTab === 'analysis' ? (
        <React.Suspense fallback={<div className="p-5 text-center text-secondary">{t("Loading Analysis...")}</div>}>
          <AnalysisView />
        </React.Suspense>
      ) : subTab === 'drag' ? (
        <React.Suspense fallback={<div className="p-5 text-center text-secondary">{t("Loading Drag Test...")}</div>}>
          <DragTestView />
        </React.Suspense>
      ) : (
        <div className="d-grid gap-3 flex-grow-1" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: '4.2fr 5.8fr', minHeight: 0, height: '100%', overflow: 'hidden' }}>

          {/* BLOCK 1: Row 1 Left (Span 2 / 6 = 33.3%) - Driver Cockpit Cluster */}
          <div className="h-100 p-2 d-flex flex-column gap-2 overflow-hidden" style={{ gridColumn: 'span 2' }}>
            <h3 className="fs-6 text-primary fw-bold border-bottom pb-1 m-0">{t("Driver Inputs & Engine")}</h3>
            <div className="d-flex flex-column justify-content-between gap-2 flex-grow-1 overflow-hidden">
              <div className="w-100 flex-shrink-0">
                <EngineRpmDisplay />
              </div>
              <div className="d-flex gap-2 align-items-center justify-content-between flex-grow-1 border rounded-3 p-2 overflow-hidden" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
                <div className="d-flex align-items-center justify-content-center h-100 flex-grow-1 overflow-hidden" style={{ maxWidth: '44%', minWidth: '35%' }}>
                  <ArcSteerGauge />
                </div>
                <div className="vr opacity-25" style={{ height: '80%' }} />
                <div className="d-flex gap-1 align-items-center h-100 flex-grow-1 justify-content-around ps-1">
                  <VerticalInputBar label={t("CLT")} selector={selectClutch} max={255} color="#0088ff" />
                  <VerticalInputBar label={t("THR")} selector={selectAccel} max={255} color="#00ff66" />
                  <VerticalInputBar label={t("BRK")} selector={selectBrake} max={255} color="#ff0055" />
                  <VerticalInputBar label={t("HBK")} selector={selectHandbrake} max={255} color="#ffaa00" />
                </div>
              </div>
            </div>
          </div>

          {/* BLOCK 2: Row 1 Center (Span 2 / 6 = 33.3%) - Dual Trace Center */}
          <div className="h-100 p-2 d-flex flex-column gap-2 overflow-hidden" style={{ gridColumn: 'span 2' }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-1 mb-0">
              <h3 className="fs-6 text-primary fw-bold m-0">{t("Live Telemetry Traces")}</h3>
              <RenderSwitch checked={renderConfig.traces} onChange={() => toggleBlockRender('traces')} />
            </div>
            <div className="d-flex flex-column gap-2 flex-grow-1 overflow-hidden h-100">
              <div className="flex-grow-1 overflow-hidden" style={{ height: '50%' }}>
                <PedalTraceCanvas height="100%" enabled={renderConfig.traces} />
              </div>
              <div className="flex-grow-1 overflow-hidden" style={{ height: '50%' }}>
                <PowerTorqueCanvas height="100%" enabled={renderConfig.traces} />
              </div>
            </div>
          </div>

          {/* BLOCK 3: Row 1 Right (Span 2 / 6 = 33.3%) - Dynamics Summary & G-Radar */}
          <div className="h-100 p-2 d-flex flex-column gap-2 overflow-hidden" style={{ gridColumn: 'span 2' }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-1 mb-0">
              <h3 className="fs-6 text-primary fw-bold m-0">{t("Vehicle Dynamics Overview")}</h3>
              <RenderSwitch checked={renderConfig.dynamicsRadar} onChange={() => toggleBlockRender('dynamicsRadar')} />
            </div>
            <div className="d-flex gap-3 align-items-stretch flex-grow-1 overflow-hidden">
              <div className="flex-grow-1 overflow-hidden h-100">
                <VehicleDynamicsDisplay />
              </div>
              <div className="d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '42%', height: '100%', minHeight: 0, overflow: 'hidden' }}>
                <GForceRadar renderRadar={renderConfig.dynamicsRadar} />
              </div>
            </div>
          </div>

          {/* BLOCK 4: Row 2 Left (Span 3 / 6 = 50%) - Tire Grip & Status */}
          <div className="h-100 p-2 d-flex flex-column gap-2 overflow-hidden" style={{ gridColumn: 'span 3' }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-1 mb-0">
              <h3 className="fs-6 text-primary fw-bold m-0">{t("Tire Grip & Status")}</h3>
              <RenderSwitch checked={renderConfig.tireRadar} onChange={() => toggleBlockRender('tireRadar')} />
            </div>
            <div className="d-grid gap-2 flex-grow-1 h-100 overflow-hidden" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', minHeight: 0 }}>
              <TireRadar title={t("Front Left")} isLeft={true} tireIdx={0} renderCharts={renderConfig.tireRadar} />
              <TireRadar title={t("Front Right")} isLeft={false} tireIdx={1} renderCharts={renderConfig.tireRadar} />
              <TireRadar title={t("Rear Left")} isLeft={true} tireIdx={2} renderCharts={renderConfig.tireRadar} />
              <TireRadar title={t("Rear Right")} isLeft={false} tireIdx={3} renderCharts={renderConfig.tireRadar} />
            </div>
          </div>

          {/* BLOCK 5: Row 2 Right (Span 3 / 6 = 50%) - Suspension Travel */}
          <div className="h-100 p-2 d-flex flex-column gap-2 overflow-hidden" style={{ gridColumn: 'span 3' }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-1 mb-0">
              <h3 className="fs-6 text-primary fw-bold m-0">{t("Suspension Travel")}</h3>
              <RenderSwitch checked={renderConfig.suspensionTrace} onChange={() => toggleBlockRender('suspensionTrace')} />
            </div>
            <div className="d-grid gap-2 flex-grow-1 h-100 overflow-hidden" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', minHeight: 0 }}>
              <SuspensionBar title={t("Front Left")} isLeft={true} tireIdx={0} renderHistoryTrace={renderConfig.suspensionTrace} />
              <SuspensionBar title={t("Front Right")} isLeft={false} tireIdx={1} renderHistoryTrace={renderConfig.suspensionTrace} />
              <SuspensionBar title={t("Rear Left")} isLeft={true} tireIdx={2} renderHistoryTrace={renderConfig.suspensionTrace} />
              <SuspensionBar title={t("Rear Right")} isLeft={false} tireIdx={3} renderHistoryTrace={renderConfig.suspensionTrace} />
            </div>
          </div>

        </div>

      )}
    </div>
  );
};

export default TelemetryView;
