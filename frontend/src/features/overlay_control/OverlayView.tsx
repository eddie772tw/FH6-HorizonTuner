import React, { useState, useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
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
  hudStyle: 'simple' | 'advanced' | 'fm4ui' | 'gt7' | 'mw2005' | 'nfs15' | 'shift_tacho' | 'vfd';
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
  /** VFD Instrument Sensitivity Offsets */
  vfdVuOffset?: number;
  vfdAudioOffset?: number;
  glowIntensity?: number;
  customColor?: string;
  useDefaultColors?: boolean;
  pauseTelemetryViewWhenActive?: boolean;
}

const DEFAULT_HUD_CONFIG: HudConfig = {
  enabled: false,
  hudStyle: 'advanced',
  selectedMonitorIndex: 0,
  scale: 1.0,
  unit: 'kmh',
  telemetryOpacity: 0.65,
  telemetryGRadarScale: 1.0,
  telemetryCornersScale: 1.0,
  telemetryPedalScale: 1.0,
  telemetryPowerTorqueScale: 1.0,
  telemetryCardFontScale: 1.0,
  telemetrySideBySideCharts: false,
  telemetryPedalPosition: 'bottom',
  telemetryPowerTorquePosition: 'top',
  telemetryMergedChartsPosition: 'bottom',
  telemetryCornerOffsetY: 0,
  telemetryCornerOffsetX: 0,
  telemetryPedalOffsetX: 0,
  telemetryPowerTorqueOffsetX: 0,
  telemetryMergedChartsOffsetX: 0,
  vfdVuOffset: 0,
  vfdAudioOffset: 0,
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
  },
  soundEnabled: false,
};

interface AuthorInfo {
  author: string;
  description: string;
}

export const OverlayView: React.FC = () => {
  const { t } = useSettings();
  const [config, setConfig] = useState<HudConfig>(DEFAULT_HUD_CONFIG);
  const [loading, setLoading] = useState(false);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);

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
    fetchConfig(false, false);

    return () => {
      channelRef.current?.close();
    };
  }, []);

  const loadAuthorInfo = async (styleName: string, force: boolean = false) => {
    if (!force && authorCache[styleName]) {
      setCurrentAuthorInfo(authorCache[styleName]);
      return;
    }
    try {
      const cacheBuster = force ? `?t=${Date.now()}` : '';
      const res = await fetch(`./hud/${styleName}/author.json${cacheBuster}`);
      if (res.ok) {
        const data = await res.json();
        const info: AuthorInfo = {
          author: data.author || 'Author',
          description: data.description || 'No description provided.'
        };
        setAuthorCache(prev => ({ ...prev, [styleName]: info }));
        setCurrentAuthorInfo(info);
        return;
      }
    } catch (e) {
      console.warn(`Failed to dynamically load author.json for HUD style '${styleName}':`, e);
    }
    const fallback: AuthorInfo = { author: 'Author', description: 'Author metadata unavailable.' };
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
        // Always reset enabled to false on startup so user manually toggles it unless preserveEnabled is true
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

  /*
    const fetchCarLearning = async () => {
      try {
        const port = (window as any).BACKEND_PORT || 8001;
        const res = await fetch(`http://127.0.0.1:${port}/api/overlay/car_learning`);
        if (res.ok) {
          const data = await res.json();
          // setCarLearningData(data);
        }
      } catch (e) {
        console.warn('Failed to fetch car learning data:', e);
      }
    };
  */

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

  const handleCornerOffsetXChange = (val: number) => {
    const updated = { ...config, telemetryCornerOffsetX: val };
    saveConfig(updated);
  };

  const handleCornerOffsetYChange = (val: number) => {
    const updated = { ...config, telemetryCornerOffsetY: val };
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

  const handleReloadHud = () => {
    broadcastConfig(config);
    channelRef.current?.postMessage({ type: 'hud:reload', hudStyle: config.hudStyle });
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

  const handleStyleChange = (style: HudConfig['hudStyle']) => {
    const updated = { ...config, hudStyle: style };
    saveConfig(updated);
    loadAuthorInfo(style);
  };

  /*
    const handleResetCarLearning = async () => {
      if (!window.confirm(t('Are you sure you want to reset car limiter database?'))) return;
      try {
        const port = (window as any).BACKEND_PORT || 8001;
        await fetch(`http://127.0.0.1:${port}/api/overlay/car_learning`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        // setCarLearningData({});
        setStatusMsg(t('Car learning reset successfully'));
      } catch (e) {
        console.error('Failed to reset car learning:', e);
      }
    };
  */

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div className="cyber-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.6rem', letterSpacing: '1px' }}>
            {t("HUD Control Panel")}
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0', fontSize: '0.9rem', lineHeight: '1.4' }}>
            {t("Full-screen borderless transparent HUD overlay for Forza Horizon 6")}
            <br />
            Simple & Advanced HUD Style: Paburrito/forza-horizon-6-custom-hud
            <br />
            Other HUD Style: StoRMiX43, Inori, GhostInTheLeague, FSH Motorsport Studio
          </p>
        </div>

        <button
          onClick={() => toggleHudWindow(!config.enabled)}
          disabled={loading}
          className="cyber-btn-glow"
          style={{
            padding: '0.8rem 2rem',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            borderRadius: '6px',
            cursor: loading ? 'wait' : 'pointer',
            background: config.enabled ? 'rgba(255, 50, 50, 0.2)' : 'rgba(0, 240, 255, 0.2)',
            border: config.enabled ? '1px solid rgba(255, 50, 50, 0.6)' : '1px solid rgba(0, 240, 255, 0.6)',
            color: config.enabled ? '#ff5555' : 'var(--primary)',
            boxShadow: config.enabled ? '0 0 15px rgba(255, 50, 50, 0.3)' : '0 0 15px rgba(0, 240, 255, 0.3)',
          }}
        >
          {loading ? '...' : config.enabled ? (t("Close HUD Overlay")) : (t("Launch HUD Overlay"))}
        </button>
      </div>

      {/*
      statusMsg && (
        <div style={{ padding: '0.8rem 1rem', borderRadius: '4px', background: 'rgba(0, 240, 255, 0.1)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
          {statusMsg}
        </div>
      )
      */}

      {/* Main Settings Grid: 3 columns x 2 rows fixed grid layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>

        {/* --- COLUMN 1 ROW 1: Offset & Position Settings --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("Offset & Position Settings")}
          </h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {/* Corner Cards Horizontal (X) Offset Slider */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Corner Cards X-Offset")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{config.telemetryCornerOffsetX ?? 0} px</span>
              </div>
              <input
                type="range"
                min={-500}
                max={500}
                step={5}
                value={config.telemetryCornerOffsetX ?? 0}
                onChange={(e) => handleCornerOffsetXChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Corner Cards Vertical (Y) Offset Slider */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Corner Cards Y-Offset")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{config.telemetryCornerOffsetY ?? 0} px</span>
              </div>
              <input
                type="range"
                min={-300}
                max={300}
                step={5}
                value={config.telemetryCornerOffsetY ?? 0}
                onChange={(e) => handleCornerOffsetYChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Merge Power/Torque & Pedal Position Chart Switch */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: '0.2rem 0' }}>
              <input
                type="checkbox"
                checked={config.telemetrySideBySideCharts === true}
                onChange={handleSideBySideChartsToggle}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 'bold' }}>{t("Merge Power & Pedal Charts")}</span>
            </label>

            {/* Conditional Display: Merged vs Individual Offsets & Positions */}
            {config.telemetrySideBySideCharts ? (
              <>
                {/* Merged Charts Horizontal (X) Offset Slider */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Merged Charts X-Offset")}:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{config.telemetryMergedChartsOffsetX ?? 0} px</span>
                  </div>
                  <input
                    type="range"
                    min={-500}
                    max={500}
                    step={10}
                    value={config.telemetryMergedChartsOffsetX ?? 0}
                    onChange={(e) => handleMergedChartsOffsetXChange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>

                {/* Merged Charts Top/Bottom Position */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{t("Merged Charts Position")}:</span>
                  <select
                    value={config.telemetryMergedChartsPosition ?? 'bottom'}
                    onChange={(e) => handleMergedChartsPositionChange(e.target.value as 'top' | 'bottom')}
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid var(--primary)',
                      color: 'var(--primary)',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Pedal Chart X-Offset")}:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{config.telemetryPedalOffsetX ?? 0} px</span>
                  </div>
                  <input
                    type="range"
                    min={-500}
                    max={500}
                    step={10}
                    value={config.telemetryPedalOffsetX ?? 0}
                    onChange={(e) => handlePedalOffsetXChange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>

                {/* Power / Torque Horizontal (X) Offset Slider */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Power / Torque X-Offset")}:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{config.telemetryPowerTorqueOffsetX ?? 0} px</span>
                  </div>
                  <input
                    type="range"
                    min={-500}
                    max={500}
                    step={10}
                    value={config.telemetryPowerTorqueOffsetX ?? 0}
                    onChange={(e) => handlePowerTorqueOffsetXChange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>

                {/* Chart Top/Bottom Positions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{t("Pedal Position")}:</span>
                  <select
                    value={config.telemetryPedalPosition ?? 'bottom'}
                    onChange={(e) => handlePedalPositionChange(e.target.value as 'top' | 'bottom')}
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid var(--primary)',
                      color: 'var(--primary)',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="bottom">{t("Bottom")}</option>
                    <option value="top">{t("Top")}</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{t("Power/Torque Position")}:</span>
                  <select
                    value={config.telemetryPowerTorquePosition ?? 'top'}
                    onChange={(e) => handlePowerTorquePositionChange(e.target.value as 'top' | 'bottom')}
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid var(--primary)',
                      color: 'var(--primary)',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="bottom">{t("Bottom")}</option>
                    <option value="top">{t("Top")}</option>
                  </select>
                </div>
              </>
            )}

          </div>
        </div>

        {/* --- COLUMN 2 ROW 1: HUD Scale Size --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>

          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("HUD Scale Size")}
          </h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>


            {/* G-Force Radar Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("G-Force Radar Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryGRadarScale ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryGRadarScale ?? 1.0}
                onChange={(e) => handleGRadarScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* 4-Corner Cards Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("4-Corner Wheel Cards Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryCornersScale ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryCornersScale ?? 1.0}
                onChange={(e) => handleCornersScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Pedal Chart Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Pedal Chart Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryPedalScale ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryPedalScale ?? 1.0}
                onChange={(e) => handlePedalScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Power / Torque Chart Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Power / Torque Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryPowerTorqueScale ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryPowerTorqueScale ?? 1.0}
                onChange={(e) => handlePowerTorqueScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Card Font Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Card Font Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryCardFontScale ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryCardFontScale ?? 1.0}
                onChange={(e) => handleTelemetryCardFontScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>
          </div>
        </div>

        {/* --- COLUMN 3 ROW 1: HUD Elements --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("HUD Elements")}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleSuspension} onChange={() => handleElementToggle('showTeleSuspension')} />
              <span>{t("Suspension Travel")}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleTiresSlip !== false} onChange={() => handleElementToggle('showTeleTiresSlip')} />
              <span>{t("Tire Slip Radar")}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleTiresTemp !== false} onChange={() => handleElementToggle('showTeleTiresTemp')} />
              <span>{t("Tire Temp Histogram")}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleAttitude} onChange={() => handleElementToggle('showTeleAttitude')} />
              <span>{t("G-Force & Attitude")}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTelePedals} onChange={() => handleElementToggle('showTelePedals')} />
              <span>{t("Throttle & Brake Trace")}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showPowerTorque !== false} onChange={() => handleElementToggle('showPowerTorque')} />
              <span>{t("Power & Torque Trace")}</span>
            </label>
          </div>
        </div>

        {/* --- COLUMN 1 ROW 2: Speedometer Settings --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("Speedometer Settings")}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.2rem' }}>
              <input
                type="checkbox"
                checked={config.elements.showGauge !== false}
                onChange={() => handleElementToggle('showGauge')}
              />
              <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{t("Enabled")}</span>
            </label>

            <select
              value={config.hudStyle}
              onChange={(e) => handleStyleChange(e.target.value as any)}
              disabled={config.elements.showGauge === false}
              style={{
                width: '100%',
                padding: '0.8rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.5)',
                color: 'var(--primary)',
                cursor: config.elements.showGauge === false ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                outline: 'none',
                opacity: config.elements.showGauge === false ? 0.5 : 1
              }}
            >
              <option value="advanced" style={{ background: '#222', color: '#fff' }}>{t("Advanced (Race Arc HUD)")}</option>
              <option value="simple" style={{ background: '#222', color: '#fff' }}>{t("Simple (NFSU2 Style Circle)")}</option>
              <option value="fm4ui" style={{ background: '#222', color: '#fff' }}>{t("FM4 Style HUD")}</option>
              <option value="gt7" style={{ background: '#222', color: '#fff' }}>{t("GT7 Style HUD")}</option>
              <option value="mw2005" style={{ background: '#222', color: '#fff' }}>{t("NFS Most Wanted 2005 HUD")}</option>
              <option value="nfs15" style={{ background: '#222', color: '#fff' }}>{t("NFS 2015 Style HUD")}</option>
              <option value="shift_tacho" style={{ background: '#222', color: '#fff' }}>{t("NFS Shift Tachometer")}</option>
              <option value="vfd" style={{ background: '#222', color: '#fff' }}>Retro VFD</option>
            </select>

            {/* Overall HUD Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Overall HUD Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round(config.scale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.scale}
                onChange={(e) => handleScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* VFD Instrument Waveform Sensitivity Offsets (Visible only when Retro VFD is selected) */}
            {config.hudStyle === 'vfd' && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#ccc' }}>VU Offset:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{config.vfdVuOffset ?? 0}</span>
                  </div>
                  <input
                    type="range"
                    min={-5}
                    max={5}
                    step={1}
                    value={config.vfdVuOffset ?? 0}
                    onChange={(e) => handleVfdVuOffsetChange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#ccc' }}>Audio Visualizer Offset:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{config.vfdAudioOffset ?? 0}</span>
                  </div>
                  <input
                    type="range"
                    min={-5}
                    max={5}
                    step={1}
                    value={config.vfdAudioOffset ?? 0}
                    onChange={(e) => handleVfdAudioOffsetChange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>
              </>
            )}

            <button
              onClick={handleReloadHud}
              style={{
                width: '100%',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid var(--primary)',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                transition: 'background 0.2s ease',
              }}
            >
              {t("Refresh HUD List & Reload HTML")}
            </button>

            {/* HUD Author & Simple Description Info Box */}
            <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.3rem' }}>
                {t("Author")}: <strong style={{ color: 'var(--primary)' }}>{currentAuthorInfo.author}</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ccc', lineHeight: '1.4' }}>
                {currentAuthorInfo.description}
              </div>
            </div>
          </div>
        </div>

        {/* --- COLUMN 2 ROW 2: HUD Style Settings (改名自中央遙測叢集設定) --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("HUD Style Settings")}
          </h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {/* Telemetry Opacity slider */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#ccc' }}>{t("Telemetry Opacity")}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={Math.round((config.telemetryOpacity ?? 0.65) * 100)}
                    onChange={(e) => handleTelemetryOpacityChange(Number(e.target.value) / 100)}
                    style={{
                      width: '65px',
                      padding: '0.3rem',
                      borderRadius: '4px',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid var(--primary)',
                      color: 'var(--primary)',
                      textAlign: 'center',
                      fontWeight: 'bold'
                    }}
                  />
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>%</span>
                </div>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={config.telemetryOpacity ?? 0.65}
                onChange={(e) => handleTelemetryOpacityChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>



            {/* Glow Intensity slider (發光強度拉桿) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#ccc' }}>{t("Glow Intensity")}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={Math.round((config.glowIntensity ?? 1.0) * 100)}
                    onChange={(e) => handleGlowIntensityChange(Number(e.target.value) / 100)}
                    style={{
                      width: '65px',
                      padding: '0.3rem',
                      borderRadius: '4px',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid var(--primary)',
                      color: 'var(--primary)',
                      textAlign: 'center',
                      fontWeight: 'bold'
                    }}
                  />
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>%</span>
                </div>
              </div>
              <input
                type="range"
                min={0.0}
                max={2.0}
                step={0.05}
                value={config.glowIntensity ?? 1.0}
                onChange={(e) => handleGlowIntensityChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Gauge Color Palette Customization */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.useDefaultColors !== false}
                  onChange={handleUseDefaultColorsToggle}
                />
                <span style={{ fontSize: '0.9rem', color: '#eee' }}>{t("Use Default Gauge Colors")}</span>
              </label>

              {config.useDefaultColors === false && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '1.4rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{t("Custom Gauge Color")}:</span>
                  <input
                    type="color"
                    value={config.customColor || '#00f0ff'}
                    onChange={(e) => handleCustomColorChange(e.target.value)}
                    style={{ width: '45px', height: '28px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', background: 'transparent', cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>

            {/* Motion Effect Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.2rem' }}>
              <input
                type="checkbox"
                checked={config.elements.showMotionEffect !== false}
                onChange={() => handleElementToggle('showMotionEffect')}
              />
              <span style={{ fontSize: '0.9rem', color: '#eee' }}>{t("Motion Effect")}</span>
            </label>
          </div>
        </div>

        {/* --- COLUMN 3 ROW 2: Performance & System Options --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("Performance & System Options")}
          </h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>

            {/* Target Display Monitor Selector */}
            <div style={{ marginBottom: '0.4rem', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '0.8rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.4rem' }}>
                {t("Select Monitor for HUD Overlay")}:
              </label>
              <select
                value={config.selectedMonitorIndex}
                onChange={(e) => handleMonitorChange(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--primary)',
                  color: 'white',
                  fontSize: '0.85rem'
                }}
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

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!config.pauseTelemetryViewWhenActive}
                onChange={(e) => {
                  const updated = { ...config, pauseTelemetryViewWhenActive: e.target.checked };
                  saveConfig(updated);
                }}
              />
              <span style={{ fontSize: '0.9rem', color: '#eee' }}>
                {t("Pause Telemetry View when HUD is active")}
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.elements.showTeleCenterAnchor !== false}
                onChange={() => handleElementToggle('showTeleCenterAnchor')}
              />
              <span style={{ fontSize: '0.9rem', color: '#eee' }}>
                {t("Center Alignment Anchor Frame")}
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!config.elements.showTeleGridLines}
                onChange={() => handleElementToggle('showTeleGridLines')}
              />
              <span style={{ fontSize: '0.9rem', color: '#eee' }}>
                {t("Alignment Grid Lines")}
              </span>
            </label>

            {/* Reset HUD Settings Action */}
            <div style={{ marginTop: '0.6rem', paddingTop: '0.8rem', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
              <button
                onClick={handleResetHudConfig}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '4px',
                  background: 'rgba(255, 60, 60, 0.15)',
                  border: '1px solid rgba(255, 60, 60, 0.4)',
                  color: '#ff6b6b',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 60, 60, 0.3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 60, 60, 0.15)')}
              >
                {t("Reset HUD Settings")}
              </button>
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#888', marginTop: '0.4rem', textAlign: 'center' }}>
                {t("Reset all HUD elements, scaling, colors, and positions to default values.")}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OverlayView;
