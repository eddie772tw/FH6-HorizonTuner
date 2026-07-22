import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import '../App.css';

interface HudElements {
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
  hudStyle: 'simple' | 'advanced';
  selectedMonitorIndex: number;
  scale: number;
  unit: 'kmh' | 'mph';
  elements: HudElements;
  soundEnabled: boolean;
  demoMode: boolean;
}

const DEFAULT_HUD_CONFIG: HudConfig = {
  enabled: false,
  hudStyle: 'advanced',
  selectedMonitorIndex: 0,
  scale: 1.0,
  unit: 'kmh',
  demoMode: true,
  elements: {
    showRPM: true,
    showSpeed: true,
    showGear: true,
    showPowerTorque: true,
    showBoost: true,
    showWheelLockup: true,
    showMotionEffect: true,
    showTeleSuspension: false,
    showTeleTires: false,
    showTeleAttitude: false,
    showTeleEngine: false,
  },
  soundEnabled: false,
};

export const OverlayView: React.FC = () => {
  const { t } = useSettings();
  const [config, setConfig] = useState<HudConfig>(DEFAULT_HUD_CONFIG);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [carLearningData, setCarLearningData] = useState<Record<string, any>>({});

  const channelRef = React.useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('horizon_tuner_hud_channel');
    fetchMonitors();
    fetchConfig();
    fetchCarLearning();

    return () => {
      channelRef.current?.close();
    };
  }, []);

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
        data: {
          ...newConfig,
          actualScale: (newConfig.scale || 1.0) * 0.5,
        },
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
      }
    } catch (e) {
      console.warn('Failed to fetch HUD config:', e);
    }
  };

  const fetchCarLearning = async () => {
    try {
      const port = (window as any).BACKEND_PORT || 8001;
      const res = await fetch(`http://127.0.0.1:${port}/api/overlay/car_learning`);
      if (res.ok) {
        const data = await res.json();
        setCarLearningData(data);
      }
    } catch (e) {
      console.warn('Failed to fetch car learning data:', e);
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
      }
      if ((window as any).__TAURI__?.core?.invoke) {
        await (window as any).__TAURI__.core.invoke('toggle_hud_window', { visible: enable });
        if (enable) {
          await (window as any).__TAURI__.core.invoke('set_hud_click_through', { ignore: true });
        }
      }
    } catch (err) {
      console.warn('Tauri window manipulation notice:', err);
    }

    setStatusMsg(enable ? (t('HUD Overlay Launched') || 'Horizon Tuner HUD 已在指定螢幕啟動') : (t('HUD Overlay Closed') || 'Horizon Tuner HUD 已關閉'));
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

  const handleStyleChange = (style: 'simple' | 'advanced') => {
    const updated = { ...config, hudStyle: style };
    saveConfig(updated);
  };

  const handleResetCarLearning = async () => {
    if (!window.confirm(t('Are you sure you want to reset car limiter database?') || '確定要重置車輛極限轉速學習資料庫嗎？')) return;
    try {
      const port = (window as any).BACKEND_PORT || 8001;
      await fetch(`http://127.0.0.1:${port}/api/overlay/car_learning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setCarLearningData({});
      setStatusMsg(t('Car learning reset successfully') || '極限轉速學習資料庫已重置！');
    } catch (e) {
      console.error('Failed to reset car learning:', e);
    }
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div className="cyber-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.6rem', letterSpacing: '1px' }}>
            {t("Horizon Tuner HUD Control Panel") || "Horizon Tuner HUD 儀表板控制中心"}
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            {t("Full-screen borderless transparent HUD overlay for Forza Horizon 6") || "全螢幕全透明靠右下賽車抬頭顯示儀表 (多顯示器 / 縮放 / 4卡片支援)"}
            <br />
            Credits:Paburrito/forza-horizon-6-custom-hud
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
          {loading ? '...' : config.enabled ? (t("Close HUD Overlay") || "關閉 Horizon Tuner HUD") : (t("Launch HUD Overlay") || "開啟 Horizon Tuner HUD")}
        </button>
      </div>

      {statusMsg && (
        <div style={{ padding: '0.8rem 1rem', borderRadius: '4px', background: 'rgba(0, 240, 255, 0.1)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
          {statusMsg}
        </div>
      )}

      {/* Main Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* Multi-Monitor Selector & Display Settings */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            🖥️ {t("Target Display Monitor") || "目標顯示器選擇"}
          </h3>
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.4rem' }}>
              {t("Select Monitor for HUD Overlay") || "選擇 HUD 展示的螢幕"}
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
                    {m.name} ({m.width}x{m.height}) {m.is_primary ? `[${t("Primary") || "主要"}]` : ''}
                  </option>
                ))
              ) : (
                <option value={0}>{t("Default Primary Display") || "預設主要顯示器"}</option>
              )}
            </select>
          </div>
        </div>

        {/* HUD Scale Slider & Input */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            🔍 {t("HUD Scale Size") || "儀表大小縮放設定"}
          </h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', color: '#ccc' }}>{t("HUD Scale Ratio") || "儀表整體比例"}:</span>
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
        </div>

        {/* Style Selection */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            🏁 {t("HUD Style Mode") || "儀表板樣式模式"}
          </h3>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              onClick={() => handleStyleChange('advanced')}
              style={{
                flex: 1,
                padding: '1rem',
                borderRadius: '6px',
                border: config.hudStyle === 'advanced' ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.15)',
                background: config.hudStyle === 'advanced' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                color: config.hudStyle === 'advanced' ? 'var(--primary)' : '#aaa',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🏁 {t("Advanced (Race Arc HUD)") || "Advanced 競賽弧形儀表"}
            </button>
            <button
              onClick={() => handleStyleChange('simple')}
              style={{
                flex: 1,
                padding: '1rem',
                borderRadius: '6px',
                border: config.hudStyle === 'simple' ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.15)',
                background: config.hudStyle === 'simple' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                color: config.hudStyle === 'simple' ? 'var(--primary)' : '#aaa',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ⭕ {t("Simple (NFSU2 Style Circle)") || "Simple 圓形經典儀表"}
            </button>
          </div>
        </div>

        {/* HUD Elements Options (Renamed, Emoji Removed, Clean Checklist) */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            {t("HUD Elements") || "HUD Elements"}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleSuspension} onChange={() => handleElementToggle('showTeleSuspension')} />
              <span>{t("Suspension Travel Card") || "4 輪懸吊行程卡片 (直式)"}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleTires} onChange={() => handleElementToggle('showTeleTires')} />
              <span>{t("Tire Slip & Temp Card") || "4 輪滑移雷達與胎溫直方圖卡片"}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={config.elements.showTeleAttitude} onChange={() => handleElementToggle('showTeleAttitude')} />
              <span>{t("G-Force & Attitude Card") || "車身姿態與 G力向量卡片 (換行)"}</span>
            </label>
          </div>
        </div>

        {/* DEMO Mode Toggle */}
        <div className="cyber-card" style={{ padding: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
              {t("DEMO Mode") || "DEMO 示範模擬模式"}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#aaa' }}>
              {t("Allow simulated gauge sweep animation when no telemetry UDP data is received") || "開啟時在沒有遊戲遙測資料輸入時自動上演示範模擬作動"}
            </p>
          </div>
          <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
            <input
              type="checkbox"
              checked={config.demoMode !== false}
              onChange={(e) => {
                const newCfg = { ...config, demoMode: e.target.checked };
                setConfig(newCfg);
                saveConfig(newCfg);
              }}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', cursor: 'pointer', inset: 0,
              background: config.demoMode !== false ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
              borderRadius: '24px', transition: '0.2s'
            }}>
              <span style={{
                position: 'absolute', content: '""', height: '18px', width: '18px',
                left: config.demoMode !== false ? '28px' : '3px', bottom: '3px',
                background: '#000', borderRadius: '50%', transition: '0.2s'
              }} />
            </span>
          </label>
        </div>

        {/* Rev Limiter Auto-learning Database */}
        <div className="cyber-card" style={{ padding: '1.2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem', marginTop: 0, color: 'var(--primary)' }}>
            ⚙️ {t("Car Rev Limiter Auto-Learning") || "車輛轉速極限自動學習庫"}
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#aaa', margin: '0.5rem 0' }}>
            {t("Recorded Car Profiles") || "已學習紀錄的車輛數量"}: <strong style={{ color: 'var(--primary)' }}>{Object.keys(carLearningData).length}</strong>
          </p>
          <button
            onClick={handleResetCarLearning}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'rgba(255, 100, 100, 0.15)',
              border: '1px solid rgba(255, 100, 100, 0.4)',
              color: '#ff8888',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🗑 {t("Reset Car Learning Database") || "重置車輛學習資料庫"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default OverlayView;
