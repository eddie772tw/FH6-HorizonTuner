import React, { useState, useEffect, useCallback } from "react";
import { backendFetch } from "../../src/services/backend";
import {
  fetchHudStylesList,
  formatHudDropdownOptions,
  HudStyleEntry,
} from "../../src/features/overlay_control/hudStyleScanner";
import {
  S650_HMI_STYLE_ID,
  S650_CENTER_WIDGETS,
  S650_HMI_THEMES,
  normalizeS650HmiConfig,
  type S650CenterWidget,
  type S650HmiTheme,
} from "../../src/features/overlay_control/s650/config";

interface HudElements {
  showTeleMaster?: boolean;
  showGauge: boolean;
  showCenterInfo: boolean;
  showRPM: boolean;
  showSpeed: boolean;
  showGear: boolean;
  showPowerTorque: boolean;
  showBoost: boolean;
  showWheelLockup: boolean;
  showMotionEffect: boolean;
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
  s650Theme?: S650HmiTheme;
  s650CenterWidget?: S650CenterWidget;
  selectedMonitorIndex: number;
  scale: number;
  unit: "kmh" | "mph";
  elements: HudElements;
  soundEnabled: boolean;
  telemetryOpacity?: number;
}

const DEFAULT_HUD_CONFIG: HudConfig = {
  enabled: true,
  hudStyle: "vfd",
  s650Theme: "heritage67",
  s650CenterWidget: "boost_vacuum",
  selectedMonitorIndex: 0,
  scale: 1.0,
  unit: "kmh",
  soundEnabled: false,
  telemetryOpacity: 0.9,
  elements: {
    showGauge: true,
    showCenterInfo: true,
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
    showTeleGridLines: true,
    showLiveMap: false,
    showLiveMapPOIs: false,
    showLiveMapPRStunts: false,
    showLiveMapCollectibles: false,
    showLiveMapHeading: false,
  },
};

// Safe Tauri invocation helper
async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<T> } } }).__TAURI__;
    if (tauri?.core?.invoke) {
      return await tauri.core.invoke(cmd, args);
    }
  } catch (err) {
    console.warn(`[Tauri] Command "${cmd}" failed:`, err);
  }
  return null;
}

export const HudApp: React.FC = () => {
  const [config, setConfig] = useState<HudConfig>(DEFAULT_HUD_CONFIG);
  const [styles, setStyles] = useState<HudStyleEntry[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [clickThrough, setClickThrough] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>("Ready");
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Load HUD Config and Available Styles
  const loadConfigAndStyles = useCallback(async () => {
    try {
      const [cfgRes, styleList, monitorList] = await Promise.all([
        backendFetch("/api/hud/config").then((r) => (r.ok ? r.json() : null)),
        fetchHudStylesList(),
        invokeTauri<MonitorOption[]>("get_available_monitors"),
      ]);

      if (cfgRes) {
        setConfig((prev) => ({
          ...prev,
          ...cfgRes,
          elements: { ...prev.elements, ...(cfgRes.elements || {}) },
        }));
      }

      if (styleList && styleList.length > 0) {
        setStyles(styleList);
      }

      if (monitorList && Array.isArray(monitorList)) {
        setMonitors(monitorList);
      }

      setIsLoaded(true);
      setStatusMsg("Connected to backend");
    } catch (err) {
      console.error("[HudApp] Failed to load config:", err);
      setStatusMsg("Connecting...");
    }
  }, []);

  useEffect(() => {
    loadConfigAndStyles();
  }, [loadConfigAndStyles]);

  // Save config changes to backend
  const saveConfig = async (newConfig: HudConfig) => {
    setSaving(true);
    try {
      const normalized = newConfig.hudStyle === S650_HMI_STYLE_ID
        ? normalizeS650HmiConfig(newConfig as unknown as Record<string, unknown>)
        : newConfig;

      const res = await backendFetch("/api/hud/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });

      if (res.ok) {
        setStatusMsg("Configuration saved");
      }
    } catch (err) {
      console.error("[HudApp] Failed to save config:", err);
      setStatusMsg("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleStyleChange = (hudStyle: string) => {
    const next = { ...config, hudStyle };
    setConfig(next);
    saveConfig(next);
  };

  const handleS650ThemeChange = (s650Theme: S650HmiTheme) => {
    const next = { ...config, s650Theme };
    setConfig(next);
    saveConfig(next);
  };

  const handleS650WidgetChange = (s650CenterWidget: S650CenterWidget) => {
    const next = { ...config, s650CenterWidget };
    setConfig(next);
    saveConfig(next);
  };

  const handleToggleClickThrough = async (val: boolean) => {
    setClickThrough(val);
    await invokeTauri("set_hud_click_through", { ignore: val });
  };

  const handleToggleHudVisible = async (visible: boolean) => {
    const next = { ...config, enabled: visible };
    setConfig(next);
    await invokeTauri("toggle_hud_window", { visible });
    saveConfig(next);
  };

  const handleReloadHud = async () => {
    setStatusMsg("Reloading overlay...");
    await invokeTauri("reload_hud_window");
    setTimeout(() => setStatusMsg("Overlay reloaded"), 500);
  };

  const handleMonitorChange = async (index: number) => {
    const next = { ...config, selectedMonitorIndex: index };
    setConfig(next);
    const targetMon = monitors[index];
    if (targetMon) {
      await invokeTauri("move_hud_to_monitor", {
        monitorX: targetMon.x,
        monitorY: targetMon.y,
        width: targetMon.width,
        height: targetMon.height,
      });
    }
    saveConfig(next);
  };

  const handleScaleChange = (scale: number) => {
    const next = { ...config, scale };
    setConfig(next);
    saveConfig(next);
  };

  const handleOpacityChange = (telemetryOpacity: number) => {
    const next = { ...config, telemetryOpacity };
    setConfig(next);
    saveConfig(next);
  };

  const handleElementToggle = (key: keyof HudElements) => {
    const next = {
      ...config,
      elements: {
        ...config.elements,
        [key]: !config.elements[key],
      },
    };
    setConfig(next);
    saveConfig(next);
  };

  const isS650 = config.hudStyle === S650_HMI_STYLE_ID;

  return (
    <div className="container-fluid p-3 text-light min-vh-100" style={{ maxWidth: "480px", userSelect: "none" }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3 border-bottom border-secondary pb-2">
        <div>
          <h6 className="m-0 font-weight-bold text-primary">FH6 HorizonHUD Controller</h6>
          <small className="text-secondary" style={{ fontSize: "0.75rem" }}>
            {statusMsg} {saving ? "(syncing...)" : ""}
          </small>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className={`badge ${isLoaded ? "bg-success" : "bg-warning"}`} style={{ fontSize: "0.7rem" }}>
            {isLoaded ? "ACTIVE" : "CONNECTING"}
          </span>
        </div>
      </div>

      {/* Main Controls Card */}
      <div className="card glass-panel mb-3 shadow-sm border-secondary">
        <div className="card-body p-3">
          {/* Visibility & Click-through */}
          <div className="d-flex gap-2 mb-3">
            <button
              type="button"
              className={`btn btn-sm flex-fill ${config.enabled ? "btn-primary" : "btn-secondary"}`}
              onClick={() => handleToggleHudVisible(!config.enabled)}
            >
              {config.enabled ? "HUD Visible: ON" : "HUD Visible: OFF"}
            </button>
            <button
              type="button"
              className={`btn btn-sm flex-fill ${clickThrough ? "btn-outline-info" : "btn-info"}`}
              onClick={() => handleToggleClickThrough(!clickThrough)}
            >
              {clickThrough ? "Click-Through: ON" : "Interactive: ON"}
            </button>
          </div>

          {/* HUD Style Selector */}
          <div className="mb-3">
            <label className="form-label font-weight-bold small mb-1">HUD Style</label>
            <select
              className="form-select form-select-sm"
              value={config.hudStyle}
              onChange={(e) => handleStyleChange(e.target.value)}
            >
              {formatHudDropdownOptions(styles).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* S650 Theme & Center Widget */}
          {isS650 && (
            <div className="p-2 mb-3 rounded bg-dark border border-secondary">
              <div className="mb-2">
                <label className="form-label font-weight-bold small mb-1">S650 Theme</label>
                <select
                  className="form-select form-select-sm"
                  value={config.s650Theme || "heritage67"}
                  onChange={(e) => handleS650ThemeChange(e.target.value as S650HmiTheme)}
                >
                  {S650_HMI_THEMES.map((theme) => (
                    <option key={theme.value} value={theme.value}>
                      {theme.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label font-weight-bold small mb-1">Center Gauge</label>
                <select
                  className="form-select form-select-sm"
                  value={config.s650CenterWidget || "drive"}
                  onChange={(e) => handleS650WidgetChange(e.target.value as S650CenterWidget)}
                >
                  {S650_CENTER_WIDGETS.map((widget) => (
                    <option key={widget.value} value={widget.value}>
                      {widget.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Monitor Selector */}
          {monitors.length > 1 && (
            <div className="mb-3">
              <label className="form-label font-weight-bold small mb-1">Display Monitor</label>
              <select
                className="form-select form-select-sm"
                value={config.selectedMonitorIndex}
                onChange={(e) => handleMonitorChange(Number(e.target.value))}
              >
                {monitors.map((m, idx) => (
                  <option key={idx} value={idx}>
                    {m.name} ({m.width}x{m.height}) {m.is_primary ? "[Primary]" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sliders: Scale & Opacity */}
          <div className="mb-3">
            <div className="d-flex justify-content-between small mb-1">
              <span>HUD Scale</span>
              <span>{Math.round(config.scale * 100)}%</span>
            </div>
            <input
              type="range"
              className="form-range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={config.scale}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            />
          </div>

          <div className="mb-2">
            <div className="d-flex justify-content-between small mb-1">
              <span>Telemetry Opacity</span>
              <span>{Math.round((config.telemetryOpacity ?? 0.9) * 100)}%</span>
            </div>
            <input
              type="range"
              className="form-range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={config.telemetryOpacity ?? 0.9}
              onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Telemetry Radar & Components Card */}
      <div className="card glass-panel mb-3 shadow-sm border-secondary">
        <div className="card-header py-2 px-3 bg-transparent border-secondary">
          <span className="font-weight-bold small">Telemetry Radar Modules</span>
        </div>
        <div className="card-body p-3">
          <div className="row g-2 small">
            <div className="col-6">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="teleTires"
                  checked={config.elements.showTeleTires}
                  onChange={() => handleElementToggle("showTeleTires")}
                />
                <label className="form-check-label" htmlFor="teleTires">Tire Radar</label>
              </div>
            </div>
            <div className="col-6">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="teleSusp"
                  checked={config.elements.showTeleSuspension}
                  onChange={() => handleElementToggle("showTeleSuspension")}
                />
                <label className="form-check-label" htmlFor="teleSusp">Suspension</label>
              </div>
            </div>
            <div className="col-6">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="teleAttitude"
                  checked={config.elements.showTeleAttitude}
                  onChange={() => handleElementToggle("showTeleAttitude")}
                />
                <label className="form-check-label" htmlFor="teleAttitude">G-Radar / Attitude</label>
              </div>
            </div>
            <div className="col-6">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="telePedals"
                  checked={config.elements.showTelePedals}
                  onChange={() => handleElementToggle("showTelePedals")}
                />
                <label className="form-check-label" htmlFor="telePedals">Pedal Waveform</label>
              </div>
            </div>
            <div className="col-6">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="teleEngine"
                  checked={config.elements.showTeleEngine}
                  onChange={() => handleElementToggle("showTeleEngine")}
                />
                <label className="form-check-label" htmlFor="teleEngine">Power & Torque</label>
              </div>
            </div>
            <div className="col-6">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="teleGrid"
                  checked={config.elements.showTeleGridLines}
                  onChange={() => handleElementToggle("showTeleGridLines")}
                />
                <label className="form-check-label" htmlFor="teleGrid">Grid Guides</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="d-flex justify-content-between align-items-center">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={handleReloadHud}
        >
          Reload HUD
        </button>
        <span className="text-secondary small">FH6-HorizonTuner v2</span>
      </div>
    </div>
  );
};

export default HudApp;
