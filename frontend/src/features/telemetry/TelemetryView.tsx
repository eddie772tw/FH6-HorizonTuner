import React, { useState, useEffect, useCallback } from 'react';
import { useTelemetry } from '../../hooks/useTelemetry';
import { ScopedUnitSettingsProvider, useSettings } from '../../context/SettingsContext';
import { useCarParams } from '../../context/CarParamsContext';
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
import TelemetryCardShell, { type TelemetryCardId } from './components/TelemetryCardShell';
import TelemetryCardLayout from './components/TelemetryCardLayout';
import TelemetryDetailView from './components/TelemetryDetailView';
import { backendFetch } from '../../services/backend';
import { getRuntimeCapabilities } from '../../services/runtimeCapabilities';
import type { SuspensionTravelMode } from '../../utils/suspensionTravel';
import { UnitSettingsSidebar } from '../../components/UnitSettingsSidebar';
import {
  createGranularUnitPreference,
  loadGranularUnitPreference,
  resolveGranularUnitPreference,
  type GranularUnitPreference
} from '../../utils/gameUnitSettings';

import { getCarClassBadgeText } from '../../utils/carClass';

// Button classes will be applied directly instead of these objects

// --- Extracted selectors for memoized components ---
const selectClutch = (d: any) => d.ClutchInput || 0;
const selectAccel = (d: any) => d.AccelInput || 0;
const selectBrake = (d: any) => d.BrakeInput || 0;
const selectHandbrake = (d: any) => d.HandBrakeInput || 0;







// --- COMPONENT: TelemetryView MAIN ---
interface TelemetryViewProps {
  /** Temporary typing bridge while AppShell takes ownership of route selection. */
  subTab?: 'live' | 'analysis' | 'drag';
  setSubTab?: (tab: 'live' | 'analysis' | 'drag') => void;
  dashboardOnly?: boolean;
  /** The tablet mounts one full-size card, without rendering the four hidden canvases. */
  focusedCard?: TelemetryCardId;
  pauseForDesktopOverlay?: boolean;
}

interface BlockRenderConfig {
  traces: boolean;
  dynamicsRadar: boolean;
  tireRadar: boolean;
  suspensionTrace: boolean;
}

interface TelemetryViewContentProps extends TelemetryViewProps {
  unitPreference: GranularUnitPreference;
  onUnitPreferenceChange: (preference: GranularUnitPreference) => void;
}

const TelemetryViewContent: React.FC<TelemetryViewContentProps> = ({
  unitPreference,
  onUnitPreferenceChange,
  focusedCard,
  pauseForDesktopOverlay = true,
}) => {
  const [isHudPaused, setIsHudPaused] = useState<boolean>(false);
  const [showUnitSettings, setShowUnitSettings] = useState(false);
  const [suspensionTravelMode, setSuspensionTravelMode] = useState<SuspensionTravelMode>(() =>
    localStorage.getItem('telemetry_suspension_travel_mode') === 'absolute' ? 'absolute' : 'relative'
  );
  const { data: telemetryData, isConnected } = useTelemetry();
  const { t } = useSettings();
  const { carName } = useCarParams();
  const [expandedCard, setExpandedCard] = useState<TelemetryCardId | null>(null);

  const closeExpandedCard = useCallback(() => setExpandedCard(null), []);
  const expandCard = useCallback((cardId: TelemetryCardId) => setExpandedCard(cardId), []);

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

  const selectSuspensionTravelMode = (mode: SuspensionTravelMode) => {
    setSuspensionTravelMode(mode);
    localStorage.setItem('telemetry_suspension_travel_mode', mode);
  };

  useEffect(() => {
    if (!getRuntimeCapabilities().hudOverlay) return;
    const channel = new BroadcastChannel('horizon_tuner_hud_channel');
    const checkConfig = (cfg: any) => {
      if (pauseForDesktopOverlay && cfg && cfg.enabled && cfg.pauseTelemetryViewWhenActive) {
        setIsHudPaused(true);
        (window as any).__IS_HUD_PAUSED__ = true;
      } else {
        setIsHudPaused(false);
        (window as any).__IS_HUD_PAUSED__ = false;
      }
    };

    backendFetch('/api/overlay/config')
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
  }, [pauseForDesktopOverlay]);

  const [showPopover, setShowPopover] = useState<boolean>(isHudPaused);

  // Auto-pop popover whenever isHudPaused is active (e.g. switching tabs to telemetry or HUD paused state changes)
  useEffect(() => {
    if (isHudPaused) {
      setShowPopover(true);
    }
  }, [isHudPaused]);

  const isRacing = telemetryData?.IsRaceOn === 1;
  const classDisplay = getCarClassBadgeText(telemetryData?.CarClass, telemetryData?.CarPerformanceIndex);
  const displayCarName = carName || t("Unknown Car");
  const isEV = telemetryData?.EngineIdleRpm === 0;

  return (
    <div className={`telemetry-view d-flex flex-column h-100 w-100${focusedCard ? ' telemetry-view--focused' : ''}`}>
      
      {/* Header bar */}
      <div className="workspace-toolbar mb-2 flex-shrink-0">
        <div className="d-flex align-items-center flex-wrap gap-3">
          {!focusedCard && <span className="live-status-item" role="status" aria-atomic="true">
            <span className={`live-status-dot ${isConnected ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
            <span>{t(isConnected ? 'Backend connected' : 'Backend disconnected')}</span>
          </span>}
          <div 
            className="position-relative d-inline-flex align-items-center gap-2"
            onClick={() => { if (isHudPaused) setShowPopover(prev => !prev); }}
            style={{ cursor: isHudPaused ? 'pointer' : 'default' }}
          >
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: !isConnected ? 'var(--bs-secondary)' : isHudPaused ? 'var(--bs-warning)' : isRacing ? 'var(--bs-primary)' : 'var(--bs-secondary)',
            }} />
            <span className={!isConnected ? 'fw-bold text-body-secondary fs-6 m-0' : isHudPaused ? "fw-bold text-warning fs-6 m-0" : isRacing ? "fw-bold text-primary fs-6 m-0" : "fw-bold text-secondary fs-6 m-0"}>
              {!isConnected ? t('Game status unavailable') : isHudPaused ? t("RENDER PAUSED (OVERLAY ACTIVE)") : isRacing ? t("RACE DATA LIVE") : t("GAME IDLE / MENU")}
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
                    <span className="badge text-bg-warning">{t("PAUSED")}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-sm"
                    aria-label={t("Close")}
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

        </div>

        <div className="telemetry-vehicle-status d-flex align-items-center flex-wrap gap-2 fw-bold text-secondary fs-6">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowUnitSettings(true)}>
            {t("Telemetry Units")}
          </button>
          {classDisplay && <span className="badge text-bg-info me-2">{classDisplay}</span>}
          {isEV && <span className="badge text-bg-success me-2">{t("EV")}</span>}
          <span className="text-truncate" style={{ maxWidth: '200px' }}>{displayCarName}</span>
        </div>
      </div>

      <div className={`d-grid gap-3 flex-grow-1 telemetry-live-grid${focusedCard ? ' telemetry-live-grid--focused' : ''}`}>

          {/* BLOCK 1: Row 1 Left (Span 2 / 6 = 33.3%) - Driver Cockpit Cluster */}
          {(!focusedCard || focusedCard === 'driver') && <TelemetryCardShell
            id="driver"
            title={t("Driver Inputs & Engine")}
            gridColumn={focusedCard ? '1' : 'span 2'}
            expanded={expandedCard === 'driver'}
            expandable={false}
            onClose={closeExpandedCard}
            closeLabel={t("Close")}
          >
            <TelemetryCardLayout variant="stack" className="telemetry-card-layout--driver">
              <div className="telemetry-card-layout__fixed">
                <EngineRpmDisplay />
              </div>
              <div className="telemetry-driver-inputs telemetry-card-layout__fill border rounded-3 p-2" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
                <div className="telemetry-steer-column d-flex align-items-center justify-content-center h-100 overflow-hidden">
                  <ArcSteerGauge />
                </div>
                <div className="vr opacity-25" style={{ height: '80%' }} />
                <div className="telemetry-pedal-inputs d-flex gap-1 align-items-center h-100 justify-content-around ps-1">
                  <VerticalInputBar label={t("CLT")} selector={selectClutch} max={255} color="#0088ff" />
                  <VerticalInputBar label={t("THR")} selector={selectAccel} max={255} color="#00ff66" />
                  <VerticalInputBar label={t("BRK")} selector={selectBrake} max={255} color="#ff0055" />
                  <VerticalInputBar label={t("HBK")} selector={selectHandbrake} max={255} color="#ffaa00" />
                </div>
              </div>
            </TelemetryCardLayout>
          </TelemetryCardShell>}

          {/* BLOCK 2: Row 1 Center (Span 2 / 6 = 33.3%) - Dual Trace Center */}
          {(!focusedCard || focusedCard === 'traces') && <TelemetryCardShell
            id="traces"
            title={t("Live Telemetry Traces")}
            gridColumn={focusedCard ? '1' : 'span 2'}
            expanded={expandedCard === 'traces'}
            onExpand={() => expandCard('traces')}
            onClose={closeExpandedCard}
            expandLabel={t("Expand card")}
            closeLabel={t("Close")}
            renderSwitch={<RenderSwitch checked={renderConfig.traces} onChange={() => toggleBlockRender('traces')} />}
            detail={<TelemetryDetailView cardId="traces" current={telemetryData} />}
          >
            <TelemetryCardLayout variant="stack" className="telemetry-card-layout--equal">
              <div className="telemetry-card-layout__fill">
                <PedalTraceCanvas height="100%" enabled={renderConfig.traces} />
              </div>
              <div className="telemetry-card-layout__fill">
                <PowerTorqueCanvas height="100%" enabled={renderConfig.traces} />
              </div>
            </TelemetryCardLayout>
          </TelemetryCardShell>}

          {/* BLOCK 3: Row 1 Right (Span 2 / 6 = 33.3%) - Dynamics Summary & G-Radar */}
          {(!focusedCard || focusedCard === 'dynamics') && <TelemetryCardShell
            id="dynamics"
            title={t("Vehicle Dynamics Overview")}
            gridColumn={focusedCard ? '1' : 'span 2'}
            expanded={expandedCard === 'dynamics'}
            onExpand={() => expandCard('dynamics')}
            onClose={closeExpandedCard}
            expandLabel={t("Expand card")}
            closeLabel={t("Close")}
            renderSwitch={<RenderSwitch checked={renderConfig.dynamicsRadar} onChange={() => toggleBlockRender('dynamicsRadar')} />}
            detail={<TelemetryDetailView cardId="dynamics" current={telemetryData} />}
          >
            <TelemetryCardLayout variant="split">
              <div className="telemetry-card-layout__fill telemetry-dynamics-summary" tabIndex={0} role="region" aria-label={t('Vehicle Dynamics Overview')}>
                <VehicleDynamicsDisplay />
              </div>
              <div className="telemetry-card-layout__radar">
                <GForceRadar renderRadar={renderConfig.dynamicsRadar} />
              </div>
            </TelemetryCardLayout>
          </TelemetryCardShell>}

          {/* BLOCK 4: Row 2 Left (Span 3 / 6 = 50%) - Tire Grip & Status */}
          {(!focusedCard || focusedCard === 'tires') && <TelemetryCardShell
            id="tires"
            title={t("Tire Grip & Status")}
            gridColumn={focusedCard ? '1' : 'span 3'}
            expanded={expandedCard === 'tires'}
            onExpand={() => expandCard('tires')}
            onClose={closeExpandedCard}
            expandLabel={t("Expand card")}
            closeLabel={t("Close")}
            renderSwitch={<RenderSwitch checked={renderConfig.tireRadar} onChange={() => toggleBlockRender('tireRadar')} />}
            detail={<TelemetryDetailView cardId="tires" current={telemetryData} />}
          >
            <TelemetryCardLayout variant="grid">
              <TireRadar title={t("Front Left")} isLeft={true} tireIdx={0} renderCharts={renderConfig.tireRadar} />
              <TireRadar title={t("Front Right")} isLeft={false} tireIdx={1} renderCharts={renderConfig.tireRadar} />
              <TireRadar title={t("Rear Left")} isLeft={true} tireIdx={2} renderCharts={renderConfig.tireRadar} />
              <TireRadar title={t("Rear Right")} isLeft={false} tireIdx={3} renderCharts={renderConfig.tireRadar} />
            </TelemetryCardLayout>
          </TelemetryCardShell>}

          {/* BLOCK 5: Row 2 Right (Span 3 / 6 = 50%) - Suspension Travel */}
          {(!focusedCard || focusedCard === 'suspension') && <TelemetryCardShell
            id="suspension"
            title={t("Suspension Travel")}
            gridColumn={focusedCard ? '1' : 'span 3'}
            expanded={expandedCard === 'suspension'}
            onExpand={() => expandCard('suspension')}
            onClose={closeExpandedCard}
            expandLabel={t("Expand card")}
            closeLabel={t("Close")}
            renderSwitch={
              <div className="d-flex align-items-center gap-2">
                <div className="btn-group btn-group-sm" role="group" aria-label={t("Suspension Travel Display Mode")}>
                  <button type="button" className={`btn btn-outline-secondary ${suspensionTravelMode === 'relative' ? 'active' : ''}`} onClick={() => selectSuspensionTravelMode('relative')}>{t("Relative")}</button>
                  <button type="button" className={`btn btn-outline-secondary ${suspensionTravelMode === 'absolute' ? 'active' : ''}`} onClick={() => selectSuspensionTravelMode('absolute')}>{t("Absolute")}</button>
                </div>
                <RenderSwitch checked={renderConfig.suspensionTrace} onChange={() => toggleBlockRender('suspensionTrace')} />
              </div>
            }
            detail={<TelemetryDetailView cardId="suspension" current={telemetryData} />}
          >
            <TelemetryCardLayout variant="grid">
              <SuspensionBar title={t("Front Left")} isLeft={true} tireIdx={0} renderHistoryTrace={renderConfig.suspensionTrace} displayMode={suspensionTravelMode} />
              <SuspensionBar title={t("Front Right")} isLeft={false} tireIdx={1} renderHistoryTrace={renderConfig.suspensionTrace} displayMode={suspensionTravelMode} />
              <SuspensionBar title={t("Rear Left")} isLeft={true} tireIdx={2} renderHistoryTrace={renderConfig.suspensionTrace} displayMode={suspensionTravelMode} />
              <SuspensionBar title={t("Rear Right")} isLeft={false} tireIdx={3} renderHistoryTrace={renderConfig.suspensionTrace} displayMode={suspensionTravelMode} />
            </TelemetryCardLayout>
          </TelemetryCardShell>}

      </div>
      <UnitSettingsSidebar
        idPrefix="telemetry-units"
        show={showUnitSettings}
        title={t("Telemetry Unit Settings")}
        mode="granular"
        preference={unitPreference}
        onChange={onUnitPreferenceChange}
        onClose={() => setShowUnitSettings(false)}
      />
    </div>
  );
};

const TELEMETRY_UNIT_STORAGE_KEY = 'telemetry_unit_preference';

const TelemetryView: React.FC<TelemetryViewProps> = props => {
  const { settings } = useSettings();
  const [unitPreference, setUnitPreference] = useState<GranularUnitPreference>(() =>
    loadGranularUnitPreference(TELEMETRY_UNIT_STORAGE_KEY, settings.units)
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
    localStorage.setItem(TELEMETRY_UNIT_STORAGE_KEY, JSON.stringify(normalized));
  };

  return (
    <ScopedUnitSettingsProvider units={scopedUnits}>
      <TelemetryViewContent
        {...props}
        unitPreference={unitPreference}
        onUnitPreferenceChange={updateUnitPreference}
      />
    </ScopedUnitSettingsProvider>
  );
};

export default TelemetryView;
