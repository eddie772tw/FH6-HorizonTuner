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
  // Telemetry 4 Cards
  showTeleSuspension: boolean;
  showTeleTires: boolean;
  showTeleAttitude: boolean;
  showTeleEngine: boolean;
  showTelePedals: boolean;
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
  telemetryScale?: number;
  telemetryCardElementScale?: number;
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
  telemetryScale: 1.0,
  telemetryCardElementScale: 1.0,
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
    showTeleAttitude: true,
    showTeleEngine: true,
    showTelePedals: true,
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
    fetchConfig();

    return () => {
      channelRef.current?.close();
    };
  }, []);

  const loadAuthorInfo = async (styleName: string) => {
    if (authorCache[styleName]) {
      setCurrentAuthorInfo(authorCache[styleName]);
      return;
    }
    try {
      const res = await fetch(`./hud/${styleName}/author.json`);
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

  const fetchConfig = async () => {
    try {
      const port = (window as any).BACKEND_PORT || 8001;
      const res = await fetch(`http://127.0.0.1:${port}/api/overlay/config`);
      if (res.ok) {
        const data = await res.json();
        // Always reset enabled to false on startup so user manually toggles it
        const merged = {
          ...DEFAULT_HUD_CONFIG,
          ...data,
          enabled: false,
          elements: { ...DEFAULT_HUD_CONFIG.elements, ...(data.elements || {}) }
        };
        setConfig(merged);
        broadcastConfig(merged);
        loadAuthorInfo(merged.hudStyle);
      } else {
        loadAuthorInfo(DEFAULT_HUD_CONFIG.hudStyle);
      }
    } catch (e) {
      console.warn('Failed to fetch HUD config:', e);
      loadAuthorInfo(DEFAULT_HUD_CONFIG.hudStyle);
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

  const handleTelemetryScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    const updated = { ...config, telemetryScale: clamped };
    saveConfig(updated);
  };

  const handleTelemetryCardElementScaleChange = (newScale: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newScale));
    const updated = { ...config, telemetryCardElementScale: clamped };
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
    channelRef.current?.postMessage({ type: 'hud:reload' });
    fetchConfig();
  };

  const handleElementToggle = (key: keyof HudElements) => {
    const updated = {
      ...config,
      elements: {
        ...config.elements,
        [key]: !config.elements[key],
      },
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

        {/* --- COLUMN 1 ROW 1: Target Display Monitor --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("Target Display Monitor")}
          </h3>
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.4rem' }}>
              {t("Select Monitor for HUD Overlay")}
            </label>
            <select
              value={config.selectedMonitorIndex}
              onChange={(e) => handleMonitorChange(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: '4px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid var(--primary)',
                color: 'white',
                fontSize: '0.95rem'
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
        </div>

        {/* --- COLUMN 2 ROW 1: HUD Scale Size --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("HUD Scale Size")}
          </h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* HUD Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#ccc' }}>{t("HUD Scale Ratio")}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="number"
                    min={50}
                    max={200}
                    value={Math.round(config.scale * 100)}
                    onChange={(e) => handleScaleChange(Number(e.target.value) / 100)}
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
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.scale}
                onChange={(e) => handleScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Telemetry Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#ccc' }}>{t("Telemetry Scale Ratio")}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="number"
                    min={50}
                    max={200}
                    value={Math.round((config.telemetryScale ?? 1.0) * 100)}
                    onChange={(e) => handleTelemetryScaleChange(Number(e.target.value) / 100)}
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
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryScale ?? 1.0}
                onChange={(e) => handleTelemetryScaleChange(Number(e.target.value))}
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
              <input type="checkbox" checked={config.elements.showGauge !== false} onChange={() => handleElementToggle('showGauge')} />
              <span>{t("Speedometer Gauge")}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleSuspension} onChange={() => handleElementToggle('showTeleSuspension')} />
              <span>{t("Suspension Travel")}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleTires} onChange={() => handleElementToggle('showTeleTires')} />
              <span>{t("Tire Slip & Temp")}</span>
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

        {/* --- COLUMN 1 ROW 2: HUD Style Mode --- */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("HUD Style Mode")}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
            <select
              value={config.hudStyle}
              onChange={(e) => handleStyleChange(e.target.value as any)}
              style={{
                width: '100%',
                padding: '0.8rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.5)',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontWeight: 'bold',
                outline: 'none'
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
                transition: 'background 0.2s ease'
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

            {/* Telemetry Card Element Scale slider */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#ccc' }}>{t("Telemetry Card Element Scale")}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="number"
                    min={50}
                    max={200}
                    value={Math.round((config.telemetryCardElementScale ?? 1.0) * 100)}
                    onChange={(e) => handleTelemetryCardElementScaleChange(Number(e.target.value) / 100)}
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
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryCardElementScale ?? 1.0}
                onChange={(e) => handleTelemetryCardElementScaleChange(Number(e.target.value))}
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
          </div>
        </div>

      </div>
    </div>
  );
};

export default OverlayView;
