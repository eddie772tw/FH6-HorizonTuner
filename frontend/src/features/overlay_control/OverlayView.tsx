import React, { useState, useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
import {
  fetchHudStylesList,
  formatHudDropdownOptions,
  getHudUrlPrefix,
  HudStyleEntry,
} from './hudStyleScanner';
import '../../App.css';

interface HudElements {
  showGauge: boolean;
  showRPM: boolean;
  showSpeed: boolean;
  showGear: boolean;
  showPowerTorque: boolean;
  showBoost: boolean;
  showWheelLockup: boolean;
  showMotionEffect: boolean;
  // Telemetry 4 Cards & Sub-elements
  showTeleSuspension: boolean;
  showTeleTires: boolean;
  showTeleTiresSlip: boolean;
  showTeleTiresTemp: boolean;
  showTeleAttitude: boolean;
  showTeleEngine: boolean;
  showTelePedals: boolean;
  showTeleCenterAnchor: boolean;
  showTeleGridLines: boolean;
  showLiveMap?: boolean;
  showLiveMapPOIs?: boolean;
  showLiveMapPRStunts?: boolean;
  showLiveMapCollectibles?: boolean;
  showLiveMapHeading?: boolean;
}

interface MonitorOption {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  is_primary: boolean;
}

interface HudConfig {
  enabled: boolean;
  hudStyle: string;
  selectedMonitorIndex: number;
  scale: number;
  unit: 'kmh' | 'mph';
  elements: HudElements;
  soundEnabled: boolean;
  telemetryOpacity?: number;
  /** 4 Independent Component Scales */
  telemetryGRadarScale?: number;
  telemetryCornersScale?: number;
  telemetryPedalScale?: number;
  telemetryPowerTorqueScale?: number;
  telemetryMergedChartsScale?: number;
  telemetryLiveMapScale?: number;
  telemetryLiveMapOpacity?: number;
  /** Independent font scale for card text (0.5–2.0) */
  telemetryCardFontScale?: number;
  /** Option to merge power/torque & pedal charts side-by-side */
  telemetrySideBySideCharts?: boolean;
  /** Chart position: 'top' | 'bottom' */
  telemetryPedalPosition?: 'top' | 'bottom';
  telemetryPowerTorquePosition?: 'top' | 'bottom';
  telemetryMergedChartsPosition?: 'top' | 'bottom';
  /** Offsets for element positioning */
  telemetryCornerOffsetY?: number;
  telemetryCornerOffsetX?: number;
  telemetryPedalOffsetX?: number;
  telemetryPowerTorqueOffsetX?: number;
  telemetryMergedChartsOffsetX?: number;
  telemetryLiveMapOffsetX?: number;
  telemetryLiveMapOffsetY?: number;
  /** VFD Instrument Sensitivity Offsets */
  vfdVuOffset?: number;
  vfdAudioOffset?: number;
  /** Drift HUD Profile Preset */
  driftProfile?: '1440P STREAM' | '1080P FULL' | '1440P CLEAN';
  glowIntensity?: number;
  customColor?: string;
  useDefaultColors?: boolean;
  pauseTelemetryViewWhenActive?: boolean;
}

const DEFAULT_HUD_CONFIG: HudConfig = {
  enabled: false,
  hudStyle: 'vfd',
  selectedMonitorIndex: 0,
  scale: 1.0,
  unit: 'kmh',
  telemetryOpacity: 0.65,
  telemetryGRadarScale: 1.0,
  telemetryCornersScale: 1.0,
  telemetryPedalScale: 1.0,
  telemetryPowerTorqueScale: 1.0,
  telemetryMergedChartsScale: 1.0,
  telemetryLiveMapScale: 1.0,
  telemetryLiveMapOpacity: 1.0,
  telemetryCardFontScale: 1.0,
  telemetrySideBySideCharts: true,
  telemetryPedalPosition: 'bottom',
  telemetryPowerTorquePosition: 'top',
  telemetryMergedChartsPosition: 'bottom',
  telemetryCornerOffsetY: 0,
  telemetryCornerOffsetX: 0,
  telemetryPedalOffsetX: 0,
  telemetryPowerTorqueOffsetX: 0,
  telemetryMergedChartsOffsetX: 0,
  telemetryLiveMapOffsetX: 0,
  telemetryLiveMapOffsetY: 0,
  vfdVuOffset: 0,
  vfdAudioOffset: 0,
  driftProfile: '1440P STREAM',
  glowIntensity: 1.0,
  customColor: '#00f0ff',
  useDefaultColors: true,
  pauseTelemetryViewWhenActive: true,

  elements: {
    showGauge: true,
    showRPM: true,
    showSpeed: true,
    showGear: true,
    showPowerTorque: true,
    showBoost: true,
    showWheelLockup: true,
    showMotionEffect: true,
    showTeleSuspension: true,
    showTeleTires: true,
    showTeleTiresSlip: true,
    showTeleTiresTemp: true,
    showTeleAttitude: true,
    showTeleEngine: true,
    showTelePedals: true,
    showTeleCenterAnchor: false,
    showTeleGridLines: false,
    showLiveMap: true,
    showLiveMapPOIs: true,
    showLiveMapPRStunts: true,
    showLiveMapCollectibles: true,
    showLiveMapHeading: true,
  },
  soundEnabled: false,
};

interface AuthorInfo {
  author: string;
  description: string;
}

interface OverlayViewProps {
  category?: 'general' | 'displays' | 'gauges' | 'performance';
  setCategory?: (cat: 'general' | 'displays' | 'gauges' | 'performance') => void;
}

export const OverlayView: React.FC<OverlayViewProps> = () => {
  const { t } = useSettings();
  const [config, setConfig] = useState<HudConfig>(DEFAULT_HUD_CONFIG);
  const [loading, setLoading] = useState(false);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [hudStyles, setHudStyles] = useState<HudStyleEntry[]>([]);

  // Cache author metadata loaded dynamically per HUD style
  const [authorCache, setAuthorCache] = useState<Record<string, AuthorInfo>>({});
  const [currentAuthorInfo, setCurrentAuthorInfo] = useState<AuthorInfo>({
    author: 'Author',
    description: 'Loading author metadata...'
  });

  const channelRef = React.useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('horizon_tuner_hud_channel');
    fetchMonitors();
    loadStyles();
    fetchConfig(false, false);

    return () => {
      channelRef.current?.close();
    };
  }, []);

  const loadStyles = async () => {
    const port = (window as any).BACKEND_PORT || 8001;
    const styles = await fetchHudStylesList(`http://127.0.0.1:${port}`);
    if (styles.length > 0) {
      setHudStyles(styles);
    }
  };

  const loadAuthorInfo = async (styleName: string, force: boolean = false, overridePrefix?: string) => {
    if (!force && authorCache[styleName]) {
      setCurrentAuthorInfo(authorCache[styleName]);
      return;
    }
    try {
      const cacheBuster = force ? `?t=${Date.now()}` : '';
      const prefix = overridePrefix || getHudUrlPrefix(hudStyles, styleName);
      const res = await fetch(`.${prefix}/${styleName}/author.json${cacheBuster}`);
      if (res.ok) {
        const data = await res.json();
        const info: AuthorInfo = {
          author: data.author || t('Author'),
          description: data.description || t('No description provided.')
        };
        setAuthorCache(prev => ({ ...prev, [styleName]: info }));
        setCurrentAuthorInfo(info);
        return;
      }
    } catch (e) {
      console.warn(`Failed to dynamically load author.json for HUD style '${styleName}':`, e);
    }
    const fallback: AuthorInfo = { author: 'Author', description: t('Author metadata unavailable.') };
    setCurrentAuthorInfo(fallback);
  };

  const fetchMonitors = async () => {
    try {
      if ((window as any).__TAURI__?.core?.invoke) {
        const list = await (window as any).__TAURI__.core.invoke('get_available_monitors');
        if (list && Array.isArray(list) && list.length > 0) {
          setMonitors(list);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch available monitors:', e);
    }
  };

  const broadcastConfig = (newConfig: HudConfig) => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'config',
        data: newConfig,
      });
    }
  };

  const fetchConfig = async (preserveEnabled: boolean = false, forceAuthorUpdate: boolean = false) => {
    try {
      const port = (window as any).BACKEND_PORT || 8001;
      const res = await fetch(`http://127.0.0.1:${port}/api/overlay/config`);
      if (res.ok) {
        const data = await res.json();
        const merged = {
          ...DEFAULT_HUD_CONFIG,
          ...data,
          enabled: preserveEnabled,
          elements: { ...DEFAULT_HUD_CONFIG.elements, ...(data.elements || {}) }
        };
        setConfig(merged);
        broadcastConfig(merged);
        loadAuthorInfo(merged.hudStyle, forceAuthorUpdate);
      } else {
        loadAuthorInfo(DEFAULT_HUD_CONFIG.hudStyle, forceAuthorUpdate);
      }
    } catch (e) {
      console.warn('Failed to fetch HUD config:', e);
      loadAuthorInfo(DEFAULT_HUD_CONFIG.hudStyle, forceAuthorUpdate);
    }
  };

  const saveConfig = async (newConfig: HudConfig) => {
    setConfig(newConfig);
    broadcastConfig(newConfig);
    try {
      const port = (window as any).BACKEND_PORT || 8001;
      await fetch(`http://127.0.0.1:${port}/api/overlay/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
    } catch (e) {
      console.error('Failed to save HUD config:', e);
    }
  };

  const applyMonitorSelection = async (monIdx: number) => {
    if (monitors.length > 0 && monitors[monIdx]) {
      const m = monitors[monIdx];
      try {
        if ((window as any).__TAURI__?.core?.invoke) {
          await (window as any).__TAURI__.core.invoke('move_hud_to_monitor', {
            monitorX: m.x,
            monitorY: m.y,
            width: m.width,
            height: m.height
          });
        }
      } catch (err) {
        console.warn('Failed to move HUD to selected monitor:', err);
      }
    }
  };

  const toggleHudWindow = async (enable: boolean) => {
    setLoading(true);
    const updated = { ...config, enabled: enable };
    await saveConfig(updated);

    try {
      if (enable) {
        await applyMonitorSelection(updated.selectedMonitorIndex);
        channelRef.current?.postMessage({ type: 'hud:animate' });
      } else {
        channelRef.current?.postMessage({ type: 'hud:destroy' });
      }

      if ((window as any).__TAURI__?.core?.invoke) {
        await (window as any).__TAURI__.core.invoke('toggle_hud_window', { visible: enable, destroy: !enable });
        if (enable) {
          await (window as any).__TAURI__.core.invoke('set_hud_click_through', { ignore: true });
        }
      }
    } catch (err) {
      console.warn('Tauri window manipulation notice:', err);
    }

    setLoading(false);
  };

  const handleMonitorChange = (monIdx: number) => {
    const updated = { ...config, selectedMonitorIndex: monIdx };
    saveConfig(updated);
    if (config.enabled) {
      applyMonitorSelection(monIdx);
    }
  };

  const handleScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    const updated = { ...config, scale: clamped };
    saveConfig(updated);
  };

  const handleTelemetryOpacityChange = (newOpacity: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, newOpacity));
    const updated = { ...config, telemetryOpacity: clamped };
    saveConfig(updated);
  };

  const handleGRadarScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    saveConfig({ ...config, telemetryGRadarScale: clamped });
  };

  const handleCornersScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    saveConfig({ ...config, telemetryCornersScale: clamped });
  };

  const handlePedalScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    saveConfig({ ...config, telemetryPedalScale: clamped });
  };

  const handlePowerTorqueScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    saveConfig({ ...config, telemetryPowerTorqueScale: clamped });
  };

  const handleMergedChartsScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    saveConfig({ ...config, telemetryMergedChartsScale: clamped });
  };

  const handleLiveMapScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    saveConfig({ ...config, telemetryLiveMapScale: clamped });
  };

  const handleLiveMapOpacityChange = (newOpacity: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, newOpacity));
    saveConfig({ ...config, telemetryLiveMapOpacity: clamped });
  };

  const handleCornerOffsetXChange = (val: number) => {
    const updated = { ...config, telemetryCornerOffsetX: val };
    saveConfig(updated);
  };

  const handleCornerOffsetYChange = (val: number) => {
    const updated = { ...config, telemetryCornerOffsetY: val };
    saveConfig(updated);
  };

  const handleLiveMapOffsetXChange = (val: number) => {
    const updated = { ...config, telemetryLiveMapOffsetX: val };
    saveConfig(updated);
  };

  const handleLiveMapOffsetYChange = (val: number) => {
    const updated = { ...config, telemetryLiveMapOffsetY: val };
    saveConfig(updated);
  };

  const handlePedalOffsetXChange = (val: number) => {
    const updated = {
      ...config,
      telemetryPedalOffsetX: val,
      ...(config.telemetrySideBySideCharts ? { telemetryPowerTorqueOffsetX: val } : {})
    };
    saveConfig(updated);
  };

  const handlePowerTorqueOffsetXChange = (val: number) => {
    const updated = {
      ...config,
      telemetryPowerTorqueOffsetX: val,
    };
    saveConfig(updated);
  };

  const handleMergedChartsOffsetXChange = (val: number) => {
    const updated = {
      ...config,
      telemetryMergedChartsOffsetX: val,
    };
    saveConfig(updated);
  };

  const handleTelemetryCardFontScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    const updated = { ...config, telemetryCardFontScale: clamped };
    saveConfig(updated);
  };

  const handlePedalPositionChange = (pos: 'top' | 'bottom') => {
    const updated = {
      ...config,
      telemetryPedalPosition: pos,
    };
    saveConfig(updated);
  };

  const handlePowerTorquePositionChange = (pos: 'top' | 'bottom') => {
    const updated = {
      ...config,
      telemetryPowerTorquePosition: pos,
    };
    saveConfig(updated);
  };

  const handleMergedChartsPositionChange = (pos: 'top' | 'bottom') => {
    const updated = {
      ...config,
      telemetryMergedChartsPosition: pos,
    };
    saveConfig(updated);
  };

  const handleSideBySideChartsToggle = () => {
    const nextVal = !config.telemetrySideBySideCharts;
    const updated = {
      ...config,
      telemetrySideBySideCharts: nextVal,
    };
    saveConfig(updated);
  };

  const handleVfdVuOffsetChange = (val: number) => {
    const clamped = Math.max(-5, Math.min(5, val));
    const updated = { ...config, vfdVuOffset: clamped };
    saveConfig(updated);
  };

  const handleVfdAudioOffsetChange = (val: number) => {
    const clamped = Math.max(-5, Math.min(5, val));
    const updated = { ...config, vfdAudioOffset: clamped };
    saveConfig(updated);
  };

  const handleDriftProfileChange = (profile: '1440P STREAM' | '1080P FULL' | '1440P CLEAN') => {
    const updated = { ...config, driftProfile: profile };
    saveConfig(updated);
  };

  const handleGlowIntensityChange = (val: number) => {
    const clamped = Math.max(0.0, Math.min(2.0, val));
    const updated = { ...config, glowIntensity: clamped };
    saveConfig(updated);
  };

  const handleCustomColorChange = (color: string) => {
    const updated = { ...config, customColor: color };
    saveConfig(updated);
  };

  const handleUseDefaultColorsToggle = () => {
    const updated = { ...config, useDefaultColors: !(config.useDefaultColors !== false) };
    saveConfig(updated);
  };

  const handleReloadHud = async () => {
    broadcastConfig(config);
    channelRef.current?.postMessage({ type: 'hud:reload', hudStyle: config.hudStyle });

    if ((window as any).__TAURI__?.core?.invoke) {
      try {
        await (window as any).__TAURI__.core.invoke('reload_hud_window');
      } catch (err) {
        console.warn('Failed to invoke reload_hud_window:', err);
      }
    }

    fetchConfig(config.enabled, true);
    if (config.hudStyle) {
      loadAuthorInfo(config.hudStyle, true);
    }
  };

  const handleResetHudConfig = () => {
    const resetConfig: HudConfig = {
      ...DEFAULT_HUD_CONFIG,
      enabled: config.enabled,
    };
    saveConfig(resetConfig);
    channelRef.current?.postMessage({ type: 'hud:reload' });
    fetchConfig(config.enabled, true);
  };

  const handleElementToggle = (key: keyof HudElements) => {
    const nextVal = !config.elements[key];
    const newElements = {
      ...config.elements,
      [key]: nextVal,
    };

    if ((key === 'showTeleTiresSlip' || key === 'showTeleTiresTemp') && nextVal) {
      newElements.showTeleTires = true;
    }

    const updated = {
      ...config,
      elements: newElements,
    };
    saveConfig(updated);
  };

  const handleStyleChange = (style: string) => {
    const updated = { ...config, hudStyle: style };
    saveConfig(updated);
    loadAuthorInfo(style);
  };

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto">

      {/* Unframed Header Banner */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 border-bottom pb-3 mb-2 flex-shrink-0">
        <div>
          <h2 className="text-primary fs-4 fw-bold mb-1" style={{ letterSpacing: '0.5px' }}>
            {t("HUD Control Panel")}
          </h2>
          <p className="text-body-secondary fs-7 mb-0" style={{ lineHeight: '1.4' }}>
            {t("Full-screen borderless transparent HUD overlay for Forza Horizon 6")}
            <br />
            {t('Simple & Advanced HUD Style:')} Paburrito
            <br />
            {t('VFD HUD Style:')} eddie772tw feat. crosXover
            <br />
            {t('Other SIMHUB HUD Style:')} StoRMiX43, Inori, GhostInTheLeague, FSH Motorsport Studio
          </p>
        </div>

        <span title={loading ? t("Please wait, HUD is currently launching or closing...") : undefined} style={loading ? { cursor: 'wait', display: 'inline-block' } : {}}>
          <button
            onClick={() => toggleHudWindow(!config.enabled)}
            disabled={loading}
            className={`btn fw-bold px-4 py-2 ${config.enabled ? 'btn-outline-danger' : 'btn-primary'}`}
            style={{
              fontSize: '1rem',
              borderRadius: '6px',
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: config.enabled ? '0 0 15px rgba(255, 50, 50, 0.3)' : '0 0 15px var(--primary-glow)',
              pointerEvents: loading ? 'none' : 'auto'
            }}
          >
            {loading ? '...' : config.enabled ? (t("Close HUD Overlay")) : (t("Launch HUD Overlay"))}
          </button>
        </span>
      </div>

      {/* Main Settings Grid: 3 columns x 2 rows fixed grid layout */}
      <div className="row g-4 m-0 w-100 flex-grow-1">

        {/* --- COLUMN 1 ROW 1: Offset & Position Settings --- */}
        <div className="col-12 col-lg-4">
          <div className="h-100 p-2 d-flex flex-column gap-3">
            <h3 className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">
              {t("Offset & Position Settings")}
            </h3>
            <div className="d-flex flex-column gap-3">
              {/* Corner Cards Horizontal (X) Offset Slider */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Corner Cards X-Offset")}:</span>
                  <span className="text-primary fw-bold fs-7">{config.telemetryCornerOffsetX ?? 0} px</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={-500}
                  max={500}
                  step={5}
                  value={config.telemetryCornerOffsetX ?? 0}
                  onChange={(e) => handleCornerOffsetXChange(Number(e.target.value))}
                />
              </div>

              {/* Corner Cards Vertical (Y) Offset Slider */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Corner Cards Y-Offset")}:</span>
                  <span className="text-primary fw-bold fs-7">{config.telemetryCornerOffsetY ?? 0} px</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={-300}
                  max={300}
                  step={5}
                  value={config.telemetryCornerOffsetY ?? 0}
                  onChange={(e) => handleCornerOffsetYChange(Number(e.target.value))}
                />
              </div>

              {/* Merge Power/Torque & Pedal Position Chart Switch */}
              <div className="form-check form-switch py-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="sw-side-by-side"
                  checked={config.telemetrySideBySideCharts === true}
                  onChange={handleSideBySideChartsToggle}
                />
                <label className="form-check-label fs-7 fw-bold text-primary" htmlFor="sw-side-by-side">
                  {t("Merge Power & Pedal Charts")}
                </label>
              </div>

              {/* Conditional Display: Merged vs Individual Offsets & Positions */}
              {config.telemetrySideBySideCharts ? (
                <>
                  {/* Merged Charts Horizontal (X) Offset Slider */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Merged Charts X-Offset")}:</span>
                      <span className="text-primary fw-bold fs-7">{config.telemetryMergedChartsOffsetX ?? 0} px</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={-500}
                      max={500}
                      step={10}
                      value={config.telemetryMergedChartsOffsetX ?? 0}
                      onChange={(e) => handleMergedChartsOffsetXChange(Number(e.target.value))}
                    />
                  </div>

                  {/* Merged Charts Top/Bottom Position */}
                  <div className="d-flex justify-content-between align-items-center pt-1">
                    <span className="fs-7 text-body-secondary">{t("Merged Charts Position")}:</span>
                    <select
                      value={config.telemetryMergedChartsPosition ?? 'bottom'}
                      onChange={(e) => handleMergedChartsPositionChange(e.target.value as 'top' | 'bottom')}
                      className="form-select form-select-sm"
                      style={{ width: 'auto', minWidth: '110px' }}
                    >
                      <option value="bottom">{t("Bottom")}</option>
                      <option value="top">{t("Top")}</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  {/* Pedal Wave Horizontal (X) Offset Slider */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Pedal Chart X-Offset")}:</span>
                      <span className="text-primary fw-bold fs-7">{config.telemetryPedalOffsetX ?? 0} px</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={-500}
                      max={500}
                      step={10}
                      value={config.telemetryPedalOffsetX ?? 0}
                      onChange={(e) => handlePedalOffsetXChange(Number(e.target.value))}
                    />
                  </div>

                  {/* Power / Torque Horizontal (X) Offset Slider */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Power / Torque X-Offset")}:</span>
                      <span className="text-primary fw-bold fs-7">{config.telemetryPowerTorqueOffsetX ?? 0} px</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={-500}
                      max={500}
                      step={10}
                      value={config.telemetryPowerTorqueOffsetX ?? 0}
                      onChange={(e) => handlePowerTorqueOffsetXChange(Number(e.target.value))}
                    />
                  </div>

                  {/* Live Map Horizontal (X) Offset Slider */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Live Map X-Offset")}:</span>
                      <span className="text-primary fw-bold fs-7">{config.telemetryLiveMapOffsetX ?? 0} px</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={-500}
                      max={500}
                      step={10}
                      value={config.telemetryLiveMapOffsetX ?? 0}
                      onChange={(e) => handleLiveMapOffsetXChange(Number(e.target.value))}
                    />
                  </div>

                  {/* Live Map Vertical (Y) Offset Slider */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Live Map Y-Offset")}:</span>
                      <span className="text-primary fw-bold fs-7">{config.telemetryLiveMapOffsetY ?? 0} px</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={-500}
                      max={500}
                      step={10}
                      value={config.telemetryLiveMapOffsetY ?? 0}
                      onChange={(e) => handleLiveMapOffsetYChange(Number(e.target.value))}
                    />
                  </div>

                  {/* Chart Top/Bottom Positions */}
                  <div className="d-flex justify-content-between align-items-center pt-1">
                    <span className="fs-7 text-body-secondary">{t("Pedal Position")}:</span>
                    <select
                      value={config.telemetryPedalPosition ?? 'bottom'}
                      onChange={(e) => handlePedalPositionChange(e.target.value as 'top' | 'bottom')}
                      className="form-select form-select-sm"
                      style={{ width: 'auto', minWidth: '110px' }}
                    >
                      <option value="bottom">{t("Bottom")}</option>
                      <option value="top">{t("Top")}</option>
                    </select>
                  </div>

                  <div className="d-flex justify-content-between align-items-center pt-1">
                    <span className="fs-7 text-body-secondary">{t("Power/Torque Position")}:</span>
                    <select
                      value={config.telemetryPowerTorquePosition ?? 'top'}
                      onChange={(e) => handlePowerTorquePositionChange(e.target.value as 'top' | 'bottom')}
                      className="form-select form-select-sm"
                      style={{ width: 'auto', minWidth: '110px' }}
                    >
                      <option value="bottom">{t("Bottom")}</option>
                      <option value="top">{t("Top")}</option>
                    </select>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>

        {/* --- COLUMN 2 ROW 1: HUD Scale Size --- */}
        <div className="col-12 col-lg-4">
          <div className="h-100 p-2 d-flex flex-column gap-3">
            <h3 className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">
              {t("HUD Scale Size")}
            </h3>
            <div className="d-flex flex-column gap-3">

              {/* G-Force Radar Scale */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("G-Force Radar Scale")}:</span>
                  <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryGRadarScale ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={config.telemetryGRadarScale ?? 1.0}
                  onChange={(e) => handleGRadarScaleChange(Number(e.target.value))}
                />
              </div>

              {/* 4-Corner Cards Scale */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("4-Corner Wheel Cards Scale")}:</span>
                  <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryCornersScale ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={config.telemetryCornersScale ?? 1.0}
                  onChange={(e) => handleCornersScaleChange(Number(e.target.value))}
                />
              </div>

              {config.telemetrySideBySideCharts ? (
                /* Merged Charts Scale */
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="fs-7 text-body-secondary">{t("Merged Charts Scale")}:</span>
                    <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryMergedChartsScale ?? 1.0) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    className="form-range"
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={config.telemetryMergedChartsScale ?? 1.0}
                    onChange={(e) => handleMergedChartsScaleChange(Number(e.target.value))}
                  />
                </div>
              ) : (
                <>
                  {/* Pedal Chart Scale */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Pedal Chart Scale")}:</span>
                      <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryPedalScale ?? 1.0) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={config.telemetryPedalScale ?? 1.0}
                      onChange={(e) => handlePedalScaleChange(Number(e.target.value))}
                    />
                  </div>

                  {/* Power / Torque Chart Scale */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Power / Torque Scale")}:</span>
                      <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryPowerTorqueScale ?? 1.0) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={config.telemetryPowerTorqueScale ?? 1.0}
                      onChange={(e) => handlePowerTorqueScaleChange(Number(e.target.value))}
                    />
                  </div>
                </>
              )}

              {/* Card Font Scale */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Card Font Scale")}:</span>
                  <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryCardFontScale ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={config.telemetryCardFontScale ?? 1.0}
                  onChange={(e) => handleTelemetryCardFontScaleChange(Number(e.target.value))}
                />
              </div>

              {/* Live Map Scale */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Live Map Scale")}:</span>
                  <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryLiveMapScale ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={config.telemetryLiveMapScale ?? 1.0}
                  onChange={(e) => handleLiveMapScaleChange(Number(e.target.value))}
                />
              </div>

              {/* Live Map Opacity */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Live Map Opacity")}:</span>
                  <span className="text-primary fw-bold fs-7">{Math.round((config.telemetryLiveMapOpacity ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={config.telemetryLiveMapOpacity ?? 1.0}
                  onChange={(e) => handleLiveMapOpacityChange(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>

        {/* --- COLUMN 3 ROW 1: HUD Elements --- */}
        <div className="col-12 col-lg-4">
          <div className="h-100 p-2 d-flex flex-column gap-3">
            <h3 className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">
              {t("HUD Elements")}
            </h3>

            <div className="row g-3 pt-1">
              <div className="col-6">
                <div className="form-check form-switch py-1">
                  <input type="checkbox" className="form-check-input" id="sw-tele-susp" checked={config.elements.showTeleSuspension} onChange={() => handleElementToggle('showTeleSuspension')} />
                  <label className="form-check-label fs-7" htmlFor="sw-tele-susp">{t("Suspension Travel")}</label>
                </div>
              </div>

              <div className="col-6">
                <div className="form-check form-switch py-1">
                  <input type="checkbox" className="form-check-input" id="sw-tele-slip" checked={config.elements.showTeleTiresSlip !== false} onChange={() => handleElementToggle('showTeleTiresSlip')} />
                  <label className="form-check-label fs-7" htmlFor="sw-tele-slip">{t("Tire Slip Radar")}</label>
                </div>
              </div>

              <div className="col-6">
                <div className="form-check form-switch py-1">
                  <input type="checkbox" className="form-check-input" id="sw-tele-temp" checked={config.elements.showTeleTiresTemp !== false} onChange={() => handleElementToggle('showTeleTiresTemp')} />
                  <label className="form-check-label fs-7" htmlFor="sw-tele-temp">{t("Tire Temp Histogram")}</label>
                </div>
              </div>

              <div className="col-6">
                <div className="form-check form-switch py-1">
                  <input type="checkbox" className="form-check-input" id="sw-tele-att" checked={config.elements.showTeleAttitude} onChange={() => handleElementToggle('showTeleAttitude')} />
                  <label className="form-check-label fs-7" htmlFor="sw-tele-att">{t("G-Force & Attitude")}</label>
                </div>
              </div>

              <div className="col-6">
                <div className="form-check form-switch py-1">
                  <input type="checkbox" className="form-check-input" id="sw-tele-pedal" checked={config.elements.showTelePedals} onChange={() => handleElementToggle('showTelePedals')} />
                  <label className="form-check-label fs-7" htmlFor="sw-tele-pedal">{t("Throttle & Brake Trace")}</label>
                </div>
              </div>

              <div className="col-6">
                <div className="form-check form-switch py-1">
                  <input type="checkbox" className="form-check-input" id="sw-tele-power" checked={config.elements.showPowerTorque !== false} onChange={() => handleElementToggle('showPowerTorque')} />
                  <label className="form-check-label fs-7" htmlFor="sw-tele-power">{t("Power & Torque Trace")}</label>
                </div>
              </div>

              <div className="col-6">
                <div className="form-check form-switch py-1">
                  <input type="checkbox" className="form-check-input" id="sw-tele-live-map" checked={config.elements.showLiveMap !== false} onChange={() => handleElementToggle('showLiveMap')} />
                  <label className="form-check-label fs-7" htmlFor="sw-tele-live-map">{t("Live Map (Track & Cursor)")}</label>
                </div>
              </div>

              {config.elements.showLiveMap !== false && (
                <>
                  <div className="col-6">
                    <div className="form-check form-switch py-1">
                      <input type="checkbox" className="form-check-input" id="sw-tele-live-pois" checked={config.elements.showLiveMapPOIs !== false} onChange={() => handleElementToggle('showLiveMapPOIs')} />
                      <label className="form-check-label fs-7" htmlFor="sw-tele-live-pois">{t("Live Map Landmarks & POIs")}</label>
                    </div>
                  </div>

                  <div className="col-6">
                    <div className="form-check form-switch py-1">
                      <input type="checkbox" className="form-check-input" id="sw-tele-live-pr" checked={config.elements.showLiveMapPRStunts !== false} onChange={() => handleElementToggle('showLiveMapPRStunts')} />
                      <label className="form-check-label fs-7" htmlFor="sw-tele-live-pr">{t("PR Stunts (Speed/Drift/Danger)")}</label>
                    </div>
                  </div>

                  <div className="col-6">
                    <div className="form-check form-switch py-1">
                      <input type="checkbox" className="form-check-input" id="sw-tele-live-collectibles" checked={config.elements.showLiveMapCollectibles !== false} onChange={() => handleElementToggle('showLiveMapCollectibles')} />
                      <label className="form-check-label fs-7" htmlFor="sw-tele-live-collectibles">{t("Collectibles & Mascots")}</label>
                    </div>
                  </div>

                  <div className="col-6">
                    <div className="form-check form-switch py-1">
                      <input type="checkbox" className="form-check-input" id="sw-tele-live-heading" checked={config.elements.showLiveMapHeading !== false} onChange={() => handleElementToggle('showLiveMapHeading')} />
                      <label className="form-check-label fs-7" htmlFor="sw-tele-live-heading">{t("Heading Arrow & Compass")}</label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* --- COLUMN 1 ROW 2: Speedometer Settings --- */}
        <div className="col-12 col-lg-4">
          <div className="h-100 p-2 d-flex flex-column gap-3">
            <h3 className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">
              {t("Speedometer Settings")}
            </h3>
            <div className="d-flex flex-column gap-3">
              <div className="form-check form-switch py-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="sw-main-gauge"
                  checked={config.elements.showGauge !== false}
                  onChange={() => handleElementToggle('showGauge')}
                />
                <label className="form-check-label fs-7 fw-bold text-primary" htmlFor="sw-main-gauge">
                  {t("Enabled")}
                </label>
              </div>

              <select
                value={config.hudStyle}
                onChange={(e) => handleStyleChange(e.target.value)}
                disabled={config.elements.showGauge === false}
                className="form-select form-select-sm fw-bold"
              >
                {formatHudDropdownOptions(hudStyles).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Overall HUD Scale */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Overall HUD Scale")}:</span>
                  <span className="text-primary fw-bold fs-7">{Math.round(config.scale * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={config.scale}
                  onChange={(e) => handleScaleChange(Number(e.target.value))}
                />
              </div>

              {/* VFD Instrument Waveform Sensitivity Offsets (Visible only when Retro VFD is selected) */}
              {config.hudStyle === 'vfd' && (
                <>
                  <div className="border-top pt-2">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("VU Offset:")}</span>
                      <span className="text-primary fw-bold fs-7">{config.vfdVuOffset ?? 0}</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={-5}
                      max={5}
                      step={1}
                      value={config.vfdVuOffset ?? 0}
                      onChange={(e) => handleVfdVuOffsetChange(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fs-7 text-body-secondary">{t("Audio Visualizer Offset:")}</span>
                      <span className="text-primary fw-bold fs-7">{config.vfdAudioOffset ?? 0}</span>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      min={-5}
                      max={5}
                      step={1}
                      value={config.vfdAudioOffset ?? 0}
                      onChange={(e) => handleVfdAudioOffsetChange(Number(e.target.value))}
                    />
                  </div>
                </>
              )}

              {/* Drift HUD Custom Profile Controls (Visible only when Drift HUD is selected) */}
              {config.hudStyle === 'drift' && (
                <div className="border-top pt-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="fs-7 text-body-secondary">{t("Drift HUD Profile:")}</span>
                    <span className="text-primary fw-bold fs-7">{
                      config.driftProfile === "1080P FULL" ? t("1080P FULL (Full HD Overlay)") :
                      config.driftProfile === "1440P CLEAN" ? t("1440P CLEAN (Minimalist Arc & Map)") :
                      t("1440P STREAM (Full Stream Setup)")
                    }</span>
                  </div>
                  <select
                    className="form-select form-select-sm"
                    value={config.driftProfile ?? '1440P STREAM'}
                    onChange={(e) => handleDriftProfileChange(e.target.value as any)}
                  >
                    <option value="1440P STREAM">{t("1440P STREAM (Full Stream Setup)")}</option>
                    <option value="1080P FULL">{t("1080P FULL (Full HD Overlay)")}</option>
                    <option value="1440P CLEAN">{t("1440P CLEAN (Minimalist Arc & Map)")}</option>
                  </select>
                </div>
              )}

              <button
                onClick={handleReloadHud}
                className="btn btn-outline-primary btn-sm w-100 fw-bold py-2 mt-1"
              >
                {t("Refresh HUD List & Reload HTML")}
              </button>

              {/* HUD Author & Simple Description Info Box */}
              <div className="p-3 border rounded glass-panel">
                <div className="fs-7 text-body-secondary mb-1">
                  {t("Author")}: <strong className="text-primary">{currentAuthorInfo.author === 'Author' ? t('Author') : currentAuthorInfo.author}</strong>
                </div>
                <div className="fs-7 text-body-secondary" style={{ lineHeight: '1.4' }}>
                  {currentAuthorInfo.description === 'Loading author metadata...' ? t('Loading author metadata...') : currentAuthorInfo.description === 'Author metadata unavailable.' ? t('Author metadata unavailable.') : currentAuthorInfo.description === 'No description provided.' ? t('No description provided.') : currentAuthorInfo.description}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- COLUMN 2 ROW 2: HUD Style Settings --- */}
        <div className="col-12 col-lg-4">
          <div className="h-100 p-2 d-flex flex-column gap-3">
            <h3 className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">
              {t("HUD Style Settings")}
            </h3>
            <div className="d-flex flex-column gap-3">
              {/* Telemetry Opacity slider */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Telemetry Opacity")}:</span>
                  <div className="d-flex align-items-center gap-1">
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={Math.round((config.telemetryOpacity ?? 0.65) * 100)}
                      onChange={(e) => handleTelemetryOpacityChange(Number(e.target.value) / 100)}
                      className="form-control form-control-sm text-center fw-bold text-primary"
                      style={{ width: '65px' }}
                    />
                    <span className="text-primary fw-bold fs-7">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={config.telemetryOpacity ?? 0.65}
                  onChange={(e) => handleTelemetryOpacityChange(Number(e.target.value))}
                />
              </div>

              {/* Glow Intensity slider */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fs-7 text-body-secondary">{t("Glow Intensity")}:</span>
                  <div className="d-flex align-items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={Math.round((config.glowIntensity ?? 1.0) * 100)}
                      onChange={(e) => handleGlowIntensityChange(Number(e.target.value) / 100)}
                      className="form-control form-control-sm text-center fw-bold text-primary"
                      style={{ width: '65px' }}
                    />
                    <span className="text-primary fw-bold fs-7">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  className="form-range"
                  min={0.0}
                  max={2.0}
                  step={0.05}
                  value={config.glowIntensity ?? 1.0}
                  onChange={(e) => handleGlowIntensityChange(Number(e.target.value))}
                />
              </div>

              {/* Gauge Color Palette Customization */}
              <div className="d-flex flex-column gap-2">
                <div className="form-check form-switch py-1">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="sw-default-colors"
                    checked={config.useDefaultColors !== false}
                    onChange={handleUseDefaultColorsToggle}
                  />
                  <label className="form-check-label fs-7" htmlFor="sw-default-colors">
                    {t("Use Default Gauge Colors")}
                  </label>
                </div>

                {config.useDefaultColors === false && (
                  <div className="d-flex justify-content-between align-items-center ps-4">
                    <span className="fs-7 text-body-secondary">{t("Custom Gauge Color")}:</span>
                    <input
                      type="color"
                      value={config.customColor || '#00f0ff'}
                      onChange={(e) => handleCustomColorChange(e.target.value)}
                      className="form-control form-control-color"
                      style={{ width: '45px', height: '28px', cursor: 'pointer' }}
                    />
                  </div>
                )}
              </div>

              {/* Motion Effect Toggle */}
              <div className="form-check form-switch py-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="sw-motion-effect"
                  checked={config.elements.showMotionEffect !== false}
                  onChange={() => handleElementToggle('showMotionEffect')}
                />
                <label className="form-check-label fs-7" htmlFor="sw-motion-effect">
                  {t("Motion Effect")}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* --- COLUMN 3 ROW 2: Performance & System Options --- */}
        <div className="col-12 col-lg-4">
          <div className="h-100 p-2 d-flex flex-column gap-3">
            <h3 className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">
              {t("Performance & System Options")}
            </h3>
            <div className="d-flex flex-column gap-3">

              {/* Target Display Monitor Selector */}
              <div className="border-bottom pb-3">
                <label className="form-label fs-7 text-body-secondary mb-1">
                  {t("Select Monitor for HUD Overlay")}:
                </label>
                <select
                  value={config.selectedMonitorIndex}
                  onChange={(e) => handleMonitorChange(Number(e.target.value))}
                  className="form-select form-select-sm"
                >
                  {monitors.length > 0 ? (
                    monitors.map((m, idx) => (
                      <option key={idx} value={idx}>
                        {m.name} ({m.width}x{m.height}) {m.is_primary ? `[${t("Primary")}]` : ''}
                      </option>
                    ))
                  ) : (
                    <option value={0}>{t("Default Primary Display")}</option>
                  )}
                </select>
              </div>

              <div className="form-check form-switch py-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="sw-pause-telemetry"
                  checked={!!config.pauseTelemetryViewWhenActive}
                  onChange={(e) => {
                    const updated = { ...config, pauseTelemetryViewWhenActive: e.target.checked };
                    saveConfig(updated);
                  }}
                />
                <label className="form-check-label fs-7" htmlFor="sw-pause-telemetry">
                  {t("Pause Telemetry View when HUD is active")}
                </label>
              </div>

              <div className="form-check form-switch py-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="sw-center-anchor"
                  checked={config.elements.showTeleCenterAnchor !== false}
                  onChange={() => handleElementToggle('showTeleCenterAnchor')}
                />
                <label className="form-check-label fs-7" htmlFor="sw-center-anchor">
                  {t("Center Alignment Anchor Frame")}
                </label>
              </div>

              <div className="form-check form-switch py-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="sw-gridlines"
                  checked={!!config.elements.showTeleGridLines}
                  onChange={() => handleElementToggle('showTeleGridLines')}
                />
                <label className="form-check-label fs-7" htmlFor="sw-gridlines">
                  {t("Alignment Grid Lines")}
                </label>
              </div>

              {/* Reset HUD Settings Action */}
              <div className="pt-3 border-top mt-auto">
                <button
                  onClick={handleResetHudConfig}
                  className="btn btn-outline-danger btn-sm w-100 fw-bold py-2"
                >
                  {t("Reset HUD Settings")}
                </button>
                <span className="d-block text-body-secondary fs-8 mt-1 text-center">
                  {t("Reset all HUD elements, scaling, colors, and positions to default values.")}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OverlayView;
