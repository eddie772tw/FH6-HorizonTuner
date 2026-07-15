import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import '../App.css';

export const OverlayView: React.FC = () => {
  const { t } = useSettings();
  const [config, setConfig] = useState<Record<string, any>>({});
  const [presets, setPresets] = useState<string[]>([]);
  const [isOverlayRunning, setIsOverlayRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);
  const [showRadioModal, setShowRadioModal] = useState(false);

  // 音訊裝置清單（模擬供選擇）
  const mockAudioDevices = [
    { id: 'Default', name: '系統預設輸入裝置 (Default)' },
    { id: 'StereoMix', name: '立體聲混音 (Stereo Mix)' },
    { id: 'Microphone', name: '麥克風 (Microphone)' }
  ];

  // 輪詢 Overlay 運行狀態
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8001/api/overlay/status');
        if (res.ok) {
          const data = await res.json();
          setIsOverlayRunning(data.running);
        }
      } catch (e) {
        console.warn('Failed to fetch overlay status:', e);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // 讀取目前的佈局設定與預設列表
  const fetchLayoutAndPresets = async () => {
    try {
      // 讀取佈局
      const layoutRes = await fetch('http://127.0.0.1:8001/api/overlay/layout');
      if (layoutRes.ok) {
        const layoutData = await layoutRes.json();
        setConfig(layoutData);
      }

      // 讀取預設
      const presetsRes = await fetch('http://127.0.0.1:8001/api/overlay/presets');
      if (presetsRes.ok) {
        const presetsData = await presetsRes.json();
        setPresets(presetsData);
      }
    } catch (e) {
      console.error('Failed to load layout or presets:', e);
    }
  };

  useEffect(() => {
    fetchLayoutAndPresets();
  }, []);

  // 儲存設定至後端 layout.ini
  const handleSaveConfig = async (updatedConfig = config) => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/overlay/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });
      if (res.ok) {
        setStatusMessage(t('Layout saved') || '設定已儲存');
        setTimeout(() => setStatusMessage(''), 2000);
      }
    } catch (e) {
      console.error('Failed to save layout:', e);
    }
  };

  // 套用預設套件
  const handleApplyPreset = async (presetName: string) => {
    if (window.confirm(`${t('Apply Preset') || '確定要載入預設'} "${presetName}" ${t('?') || '嗎？'}`)) {
      try {
        const res = await fetch('http://127.0.0.1:8001/api/overlay/presets/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: presetName })
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData.success) {
            setConfig(resData.data);
            setStatusMessage((t('Preset applied') || '已載入預設') + `: ${presetName}`);
            setTimeout(() => setStatusMessage(''), 2000);
          } else {
            alert(resData.error || '套用失敗');
          }
        }
      } catch (e) {
        console.error('Failed to apply preset:', e);
      }
    }
  };

  // 啟動/停止 C++ Overlay 處理程序
  const toggleOverlay = async () => {
    setLoading(true);
    const endpoint = isOverlayRunning ? 'stop' : 'start';
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/overlay/${endpoint}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsOverlayRunning(!isOverlayRunning);
          setStatusMessage(
            endpoint === 'start'
              ? (t('Overlay started successfully') || 'Overlay 啟動成功！')
              : (t('Overlay stopped successfully') || 'Overlay 已關閉')
          );
          setTimeout(() => setStatusMessage(''), 3000);
        } else {
          alert(data.error || '操作失敗');
        }
      }
    } catch (e) {
      console.error('Failed to toggle overlay:', e);
    } finally {
      setLoading(false);
    }
  };

  // 更新配置中特定的屬性
  const updateKey = (key: string, value: any) => {
    const updated = { ...config, [key]: value };
    setConfig(updated);
    // 即時傳送至後端以在桌面上進行預覽同步
    handleSaveConfig(updated);
  };

  const widgetKeys = [
    { id: 'dashboard', name: '儀表底盤 (Dashboard)' },
    { id: 'tacho', name: '轉速儀表 (Tacho)' },
    { id: 'radio', name: '收音機 (Radio)' },
    { id: 'controller', name: '手把控制輸入 (Controller)' },
    { id: 'boost', name: '增壓儀表 (Boost Gauge)' },
    { id: 'oil_pressure', name: '機油壓力儀表 (Oil Pressure)' },
    { id: 'oil_temp', name: '機油溫度儀表 (Oil Temp)' },
    { id: 'coolant_temp', name: '水溫儀表 (Coolant Temp)' },
    { id: 'tire_temp', name: '四輪胎溫卡片 (Tire Temp)' },
    { id: 'susp_travel', name: '懸吊行程卡片 (Susp Travel)' },
    { id: 'slip_limit', name: '輪胎極限打滑卡片 (Slip Limit)' },
    { id: 'g_force', name: '加速度雷達卡片 (G-Force)' },
    { id: 'map', name: '地圖軌跡卡片 (Map Card)' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem', color: '#fff', fontFamily: 'sans-serif' }}>
      
      {/* 頂部控制列 */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '12px', height: '12px', borderRadius: '50%',
              background: isOverlayRunning ? '#00ff55' : '#888',
              boxShadow: isOverlayRunning ? '0 0 10px #00ff55' : 'none',
              transition: 'all 0.3s'
            }} />
            <span style={{ fontWeight: 'bold' }}>
              {isOverlayRunning ? t("OVERLAY ACTIVE") || 'HUD 覆蓋層運作中' : t("OVERLAY INACTIVE") || 'HUD 覆蓋層未啟動'}
            </span>
          </div>
          <button 
            onClick={toggleOverlay} 
            disabled={loading} 
            className="action-button"
            style={{
              background: isOverlayRunning ? '#ff3b30' : 'var(--primary)',
              color: isOverlayRunning ? '#fff' : '#000',
              border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            {loading ? t('Processing...') || '處理中...' : (isOverlayRunning ? t('Stop HUD Overlay') || '停止覆蓋層' : t('Start HUD Overlay') || '開啟覆蓋層')}
          </button>
        </div>
        {statusMessage && <span style={{ color: '#00f0ff', fontWeight: 600 }}>{statusMessage}</span>}
        <div style={{ fontSize: '0.9rem', color: '#888' }}>
          Preset Name: <span style={{ color: '#fff', fontWeight: 600 }}>{config.name || 'Default'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1.5rem', flex: 1, minHeight: 0 }}>
        
        {/* 左側面板 - 預設載入與全域設定 */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* 全域模式設定 */}
          <div>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
              {t("Global Settings") || "全域設定"}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox"
                  checked={config.preview_mode === 1}
                  onChange={(e) => updateKey('preview_mode', e.target.checked ? 1 : 0)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{t("Desktop Preview Mode") || "開啟桌面定位預覽"}</span>
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>將在全局桌面上繪製各組件定位虛線框以利微調</span>
                </div>
              </label>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => {
                    handleSaveConfig(config);
                    setStatusMessage('設定已成功儲存');
                    setTimeout(() => setStatusMessage(''), 2000);
                  }}
                  className="action-button"
                  style={{
                    flex: 1, background: 'var(--primary)', color: '#000', border: 'none',
                    padding: '0.6rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  {t("Save Settings") || "儲存目前設定"}
                </button>
                <button 
                  onClick={() => {
                    updateKey('preview_mode', 0);
                    setStatusMessage('預覽已關閉，設定已套用至遊戲重疊層');
                    setTimeout(() => setStatusMessage(''), 2000);
                  }}
                  className="action-button"
                  style={{
                    flex: 1, background: '#00ff88', color: '#000', border: 'none',
                    padding: '0.6rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  {t("Apply Settings") || "關閉預覽並套用"}
                </button>
              </div>
            </div>
          </div>

          {/* 相機震動與視覺回饋 */}
          <div>
            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
              {t("Camera Effects") || "相機與動態視覺特效"}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox"
                  checked={config.camera_shake_enabled === 1 || config.camera_shake_enabled === true}
                  onChange={(e) => updateKey('camera_shake_enabled', e.target.checked ? 1 : 0)}
                />
                <span>{t("Camera Shake Enabled") || "啟用轉速與衝擊相機震動"}</span>
              </label>
              
              {config.camera_shake_enabled === 1 && (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#aaa' }}>
                      <span>震動強度 (Intensity)</span>
                      <span>{config.camera_shake_intensity?.toFixed(1) || '1.0'}</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="3.0" step="0.1"
                      value={config.camera_shake_intensity || 1.0}
                      onChange={(e) => updateKey('camera_shake_intensity', parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#aaa' }}>
                      <span>震動頻率 (Speed)</span>
                      <span>{config.camera_shake_speed?.toFixed(1) || '1.0'}</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="3.0" step="0.1"
                      value={config.camera_shake_speed || 1.0}
                      onChange={(e) => updateKey('camera_shake_speed', parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                  </div>
                </>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox"
                  checked={config.camera_distortion_enabled === 1 || config.camera_distortion_enabled === true}
                  onChange={(e) => updateKey('camera_distortion_enabled', e.target.checked ? 1 : 0)}
                />
                <span>{t("Distortion Scaling Enabled") || "啟用加速度尺寸拉伸變形"}</span>
              </label>

              {config.camera_distortion_enabled === 1 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#aaa' }}>
                    <span>變形靈敏度 (Sensitivity)</span>
                    <span>{config.camera_distortion_intensity?.toFixed(1) || '1.0'}</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="3.0" step="0.1"
                    value={config.camera_distortion_intensity || 1.0}
                    onChange={(e) => updateKey('camera_distortion_intensity', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 內建預設組件庫 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
              {t("Presets Library") || "內建預設套件庫"}
            </h3>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {presets.map((name) => (
                <div 
                  key={name}
                  onClick={() => handleApplyPreset(name)}
                  style={{
                    padding: '0.75rem 1rem', background: config.name === name ? 'rgba(0,240,255,0.15)' : 'rgba(255,255,255,0.05)',
                    borderRadius: '4px', border: config.name === name ? '1px solid #00f0ff' : '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>{name}</span>
                  <span style={{ fontSize: '0.8rem', color: '#00f0ff' }}>{t("Load") || "載入"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右側面板 - 個別組件折疊配置欄 */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
            {t("HUD Widgets Settings") || "HUD 組件獨立配置"}
          </h3>
          
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem' }}>
            {widgetKeys.map((w) => {
              const enabledKey = `${w.id}_widget_enabled`;
              const styleKey = `${w.id}_widget`;
              const alignKey = `${w.id}_alignment`;
              const scaleKey = `${w.id}_scale`;
              const opacityKey = `${w.id}_opacity`;
              const padxKey = `${w.id}_padding_x`;
              const padyKey = `${w.id}_padding_y`;

              const isEnabled = config[enabledKey] === 1 || config[enabledKey] === true;
              const isExpanded = expandedWidget === w.id;

              return (
                <div 
                  key={w.id} 
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '6px',
                    overflow: 'hidden'
                  }}
                >
                  {/* 折疊列頭 */}
                  <div 
                    style={{
                      padding: '1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(255,255,255,0.05)' : 'transparent'
                    }}
                    onClick={() => setExpandedWidget(isExpanded ? null : w.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input 
                        type="checkbox"
                        checked={isEnabled}
                        onClick={(e) => e.stopPropagation()} // 防止觸發展開
                        onChange={(e) => updateKey(enabledKey, e.target.checked ? 1 : 0)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 600, color: isEnabled ? '#fff' : '#888' }}>{w.name}</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>{isExpanded ? '▲ 收起' : '▼ 展開配置'}</span>
                  </div>

                  {/* 折疊內文 */}
                  {isExpanded && (
                    <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      
                      {/* 對齊方式 */}
                      <div>
                        <label style={{ fontSize: '0.85rem', color: '#aaa', display: 'block', marginBottom: '4px' }}>對齊錨點 (Alignment)</label>
                        <select 
                          value={config[alignKey] !== undefined ? config[alignKey] : 2}
                          onChange={(e) => updateKey(alignKey, parseInt(e.target.value))}
                          style={{ width: '100%', padding: '0.4rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                        >
                          <option value={0}>左上角 (Top-Left)</option>
                          <option value={1}>中下部 (Bottom-Center)</option>
                          <option value={2}>右下角 (Bottom-Right)</option>
                          <option value={3}>左下角 (Bottom-Left)</option>
                        </select>
                      </div>

                      {/* 樣式編號 (僅 Dashboard, Tacho, Radio 可選樣式) */}
                      {['dashboard', 'tacho', 'radio'].includes(w.id) && (
                        <div>
                          <label style={{ fontSize: '0.85rem', color: '#aaa', display: 'block', marginBottom: '4px' }}>皮膚外觀樣式 (Style Index)</label>
                          {w.id === 'dashboard' && (
                            <select 
                              value={config[styleKey] !== undefined ? config[styleKey] : 0}
                              onChange={(e) => updateKey(styleKey, parseInt(e.target.value))}
                              style={{ width: '100%', padding: '0.4rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                            >
                              <option value={0}>AEM Dashboard</option>
                              <option value={1}>NFS 2015</option>
                              <option value={2}>Soarer Dashboard</option>
                              <option value={3}>JZX100</option>
                              <option value={4}>Altezza TRD</option>
                              <option value={5}>Ford GT</option>
                            </select>
                          )}
                          {w.id === 'tacho' && (
                            <select 
                              value={config[styleKey] !== undefined ? config[styleKey] : 0}
                              onChange={(e) => updateKey(styleKey, parseInt(e.target.value))}
                              style={{ width: '100%', padding: '0.4rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                            >
                              <option value={0}>GT7 RPM</option>
                              <option value={1}>Defi Advance</option>
                              <option value={2}>Speedhut</option>
                              <option value={3}>Altezza TRD</option>
                              <option value={4}>NFS 2015</option>
                              <option value={5}>Ford GT Speed</option>
                            </select>
                          )}
                          {w.id === 'radio' && (
                            <select 
                              value={config[styleKey] !== undefined ? config[styleKey] : 0}
                              onChange={(e) => updateKey(styleKey, parseInt(e.target.value))}
                              style={{ width: '100%', padding: '0.4rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                            >
                              <option value={0}>Ford GT Radio</option>
                              <option value={1}>NFS 2015 Radio</option>
                              <option value={2}>Altezza TRD Radio</option>
                              <option value={5}>Defi Radio</option>
                            </select>
                          )}
                        </div>
                      )}

                      {/* 縮放係數 */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>
                          <span>縮放 (Scale)</span>
                          <span>{config[scaleKey]?.toFixed(2) || '1.00'}</span>
                        </div>
                        <input 
                          type="range" min="0.3" max="2.5" step="0.05"
                          value={config[scaleKey] !== undefined ? config[scaleKey] : 1.0}
                          onChange={(e) => updateKey(scaleKey, parseFloat(e.target.value))}
                          style={{ width: '100%', accentColor: 'var(--primary)' }}
                        />
                      </div>

                      {/* 透明度 */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>
                          <span>透明度 (Opacity)</span>
                          <span>{config[opacityKey]?.toFixed(2) || '1.00'}</span>
                        </div>
                        <input 
                          type="range" min="0.1" max="1.0" step="0.05"
                          value={config[opacityKey] !== undefined ? config[opacityKey] : 0.9}
                          onChange={(e) => updateKey(opacityKey, parseFloat(e.target.value))}
                          style={{ width: '100%', accentColor: 'var(--primary)' }}
                        />
                      </div>

                      {/* Padding X */}
                      <div>
                        <label style={{ fontSize: '0.85rem', color: '#aaa', display: 'block', marginBottom: '4px' }}>錨點偏移 X (Padding X)</label>
                        <input 
                          type="number" 
                          value={config[padxKey] !== undefined ? config[padxKey] : 0}
                          onChange={(e) => updateKey(padxKey, parseInt(e.target.value) || 0)}
                          style={{ width: '100%', padding: '0.4rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                        />
                      </div>

                      {/* Padding Y */}
                      <div>
                        <label style={{ fontSize: '0.85rem', color: '#aaa', display: 'block', marginBottom: '4px' }}>錨點偏移 Y (Padding Y)</label>
                        <input 
                          type="number" 
                          value={config[padyKey] !== undefined ? config[padyKey] : 0}
                          onChange={(e) => updateKey(padyKey, parseInt(e.target.value) || 0)}
                          style={{ width: '100%', padding: '0.4rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                        />
                      </div>

                      {/* Radio 進階設定按鈕 */}
                      {w.id === 'radio' && (
                        <div style={{ gridColumn: 'span 2' }}>
                          <button
                            onClick={() => setShowRadioModal(true)}
                            style={{
                              width: '100%', background: 'rgba(0, 240, 255, 0.2)', color: '#00f0ff',
                              border: '1px solid #00f0ff', padding: '0.5rem', borderRadius: '4px',
                              fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem'
                            }}
                          >
                            🎵 收音機與頻譜視覺化設定
                          </button>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Radio settings Modal popup */}
      {showRadioModal && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)'
          }}
        >
          <div 
            className="glass-panel"
            style={{
              width: '450px', padding: '2rem', borderRadius: '8px',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              display: 'flex', flexDirection: 'column', gap: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.8rem' }}>
              <h2 style={{ margin: 0, color: '#00f0ff', fontSize: '1.4rem' }}>🎵 收音機與音訊設定</h2>
              <button 
                onClick={() => setShowRadioModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {/* 媒體播放來源 */}
            <div>
              <label style={{ fontSize: '0.9rem', color: '#ccc', display: 'block', marginBottom: '6px' }}>媒體歌曲來源 (Media Source)</label>
              <select
                value={config.radio_media_source || 'SMTC'}
                onChange={(e) => updateKey('radio_media_source', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
              >
                <option value="SMTC">Windows 系統音樂控制器 (SMTC 整合)</option>
                <option value="Mock">模擬電台隨機播放 (Mock Player)</option>
                <option value="Off">關閉歌曲顯示 (Off)</option>
              </select>
            </div>

            {/* 音訊視覺化模式 */}
            <div>
              <label style={{ fontSize: '0.9rem', color: '#ccc', display: 'block', marginBottom: '6px' }}>頻譜視覺化效果 (Visualizer Mode)</label>
              <select
                value={config.radio_visualizer_mode || 'Spectrum'}
                onChange={(e) => updateKey('radio_visualizer_mode', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
              >
                <option value="Spectrum">頻譜長條圖 (Spectrum Bars)</option>
                <option value="Waveform">音訊波形圖 (Waveform)</option>
                <option value="Off">關閉視覺效果 (Off)</option>
              </select>
            </div>

            {/* 頻譜條數 */}
            {config.radio_visualizer_mode === 'Spectrum' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#ccc', marginBottom: '4px' }}>
                  <span>視覺化頻譜條數 (Bars)</span>
                  <span>{config.radio_visualizer_bars || 16} 條</span>
                </div>
                <input 
                  type="range" min="8" max="64" step="4"
                  value={config.radio_visualizer_bars || 16}
                  onChange={(e) => updateKey('radio_visualizer_bars', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#00f0ff' }}
                />
              </div>
            )}

            {/* 頻譜高度 */}
            {config.radio_visualizer_mode !== 'Off' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#ccc', marginBottom: '4px' }}>
                  <span>頻譜最大高度 (Max Height)</span>
                  <span>{config.radio_visualizer_height || 40} px</span>
                </div>
                <input 
                  type="range" min="10" max="120" step="5"
                  value={config.radio_visualizer_height || 40}
                  onChange={(e) => updateKey('radio_visualizer_height', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#00f0ff' }}
                />
              </div>
            )}

            {/* 音訊輸入來源 */}
            <div>
              <label style={{ fontSize: '0.9rem', color: '#ccc', display: 'block', marginBottom: '6px' }}>頻譜擷取輸入裝置 (Audio Input Device)</label>
              <select
                value={config.radio_audio_device || 'Default'}
                onChange={(e) => updateKey('radio_audio_device', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
              >
                {mockAudioDevices.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowRadioModal(false)}
              style={{
                background: 'var(--primary)', color: '#000', border: 'none',
                padding: '0.75rem', borderRadius: '4px', fontWeight: 'bold',
                cursor: 'pointer', marginTop: '0.5rem', width: '100%'
              }}
            >
              確定並關閉設定
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default OverlayView;
