import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import '../App.css';

interface ModuleConfig {
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LayoutConfig {
  modules: {
    tireTemp: ModuleConfig;
    suspTravel: ModuleConfig;
    slipLimit: ModuleConfig;
    gForce: ModuleConfig;
    dashboard: ModuleConfig;
  };
}

const DEFAULT_LAYOUT: LayoutConfig = {
  modules: {
    tireTemp: { visible: true, x: 50, y: 50, w: 250, h: 180 },
    suspTravel: { visible: true, x: 320, y: 50, w: 200, h: 180 },
    slipLimit: { visible: true, x: 540, y: 50, w: 220, h: 220 },
    gForce: { visible: true, x: 50, y: 250, w: 220, h: 220 },
    dashboard: { visible: true, x: 290, y: 250, w: 470, h: 120 }
  }
};

type ModuleKey = keyof LayoutConfig['modules'];

export const OverlayView: React.FC = () => {
  const { t } = useSettings();
  const [layout, setLayout] = useState<LayoutConfig>(DEFAULT_LAYOUT);
  const [isOverlayRunning, setIsOverlayRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  // 拖放與縮放的互動狀態
  const [activeAction, setActiveAction] = useState<'drag' | 'resize' | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const startMousePos = useRef({ x: 0, y: 0 });
  const startModulePos = useRef({ x: 0, y: 0, w: 0, h: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // 1. 每秒輪詢一次後端 Overlay 的運行狀態
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

  // 2. 獲取後端的 Layout 設定
  const fetchLayout = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/overlay/layout');
      if (res.ok) {
        const data = await res.json();
        if (data && data.modules) {
          setLayout(data);
        }
      }
    } catch (e) {
      console.error('Failed to load overlay layout:', e);
    }
  };

  useEffect(() => {
    fetchLayout();
  }, []);

  // 3. 儲存 Layout 到後端
  const saveLayout = async (newLayout: LayoutConfig = layout) => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/overlay/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLayout)
      });
      if (res.ok) {
        setStatusMessage(t('Layout saved successfully') || '佈局儲存成功！');
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch (e) {
      console.error('Failed to save layout:', e);
      setStatusMessage('Error saving layout');
    }
  };

  // 4. 控制 Overlay 進程啟動與關閉
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

  // 重置佈局
  const resetLayout = () => {
    if (window.confirm(t('Are you sure you want to reset layout?') || '確定要重置佈局嗎？')) {
      setLayout(DEFAULT_LAYOUT);
      saveLayout(DEFAULT_LAYOUT);
    }
  };

  // 切換模組的 visible 狀態
  const handleToggleVisible = (key: ModuleKey) => {
    const updated = {
      ...layout,
      modules: {
        ...layout.modules,
        [key]: {
          ...layout.modules[key],
          visible: !layout.modules[key].visible
        }
      }
    };
    setLayout(updated);
    saveLayout(updated);
  };

  // 開始拖曳與縮放的滑鼠事件處理
  const handleMouseDown = (
    e: React.MouseEvent,
    key: ModuleKey,
    action: 'drag' | 'resize'
  ) => {
    e.preventDefault();
    setActiveAction(action);
    setActiveModule(key);
    startMousePos.current = { x: e.clientX, y: e.clientY };
    const m = layout.modules[key];
    startModulePos.current = { x: m.x, y: m.y, w: m.w, h: m.h };
  };

  // 全局滑鼠移動事件 (處理拖曳與縮放)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeAction || !activeModule || !canvasRef.current) return;

      const deltaX = e.clientX - startMousePos.current.x;
      const deltaY = e.clientY - startMousePos.current.y;

      const canvasWidth = canvasRef.current.clientWidth;
      const canvasHeight = canvasRef.current.clientHeight;

      const updated = { ...layout };
      const m = updated.modules[activeModule];

      if (activeAction === 'drag') {
        // 計算新位置並進行畫布邊界限制 (限制在畫布內)
        let newX = startModulePos.current.x + deltaX;
        let newY = startModulePos.current.y + deltaY;

        newX = Math.max(0, Math.min(canvasWidth - m.w, newX));
        newY = Math.max(0, Math.min(canvasHeight - m.h, newY));

        m.x = Math.round(newX);
        m.y = Math.round(newY);
      } else if (activeAction === 'resize') {
        // 計算新尺寸 (限制最小尺寸)
        let newW = startModulePos.current.w + deltaX;
        let newH = startModulePos.current.h + deltaY;

        newW = Math.max(100, Math.min(canvasWidth - m.x, newW));
        newH = Math.max(60, Math.min(canvasHeight - m.y, newH));

        m.w = Math.round(newW);
        m.h = Math.round(newH);
      }

      setLayout(updated);
    };

    const handleMouseUp = () => {
      if (activeAction && activeModule) {
        saveLayout(); // 拖曳/縮放完成後自動儲存佈局
      }
      setActiveAction(null);
      setActiveModule(null);
    };

    if (activeAction) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeAction, activeModule, layout]);

  const moduleNames: Record<ModuleKey, string> = {
    tireTemp: t('Tire Thermodynamics') || '輪胎熱力學',
    suspTravel: t('Suspension Travel') || '懸吊行程監控',
    slipLimit: t('Slip Diagram') || '輪胎抓地極限',
    gForce: t('G-Force') || 'G力感應',
    dashboard: t('Dashboard') || '動力與換檔主儀表板'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem', overflow: 'auto' }}>
      
      {/* 頂部控制面板 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div>
          <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>
            {t('Dashboard Overlay') || '即時遙測儀表板重疊'}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('Customize your telemetry HUD layout in-game. MPO mode runs zero latency overlay.') || 
             '自訂您的遊戲內遙測 HUD 佈局。MPO 模式下可無延遲且零效能損耗地覆蓋於遊戲畫面上。'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {statusMessage && (
            <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.9rem' }}>
              {statusMessage}
            </span>
          )}

          <button
            onClick={resetLayout}
            className="cyber-btn-glow"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text)',
              padding: '0.6rem 1.2rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {t('Reset Layout') || '重置佈局'}
          </button>

          <button
            onClick={toggleOverlay}
            disabled={loading}
            className="cyber-btn-glow"
            style={{
              background: isOverlayRunning ? 'rgba(255, 0, 0, 0.15)' : 'rgba(0, 240, 255, 0.15)',
              border: isOverlayRunning ? '1px solid rgba(255, 0, 0, 0.4)' : '1px solid rgba(0, 240, 255, 0.4)',
              color: isOverlayRunning ? '#ff5555' : 'var(--primary)',
              padding: '0.6rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
          >
            {loading ? '...' : isOverlayRunning ? (t('Stop Overlay') || '關閉 Overlay') : (t('Start Overlay') || '啟動 Overlay')}
          </button>
        </div>
      </div>

      {/* 主工作區 (分欄：左側畫布編輯器，右側模組開關控制) */}
      <div style={{ display: 'flex', gap: '2rem', height: '600px', flex: 1, minHeight: 0 }}>
        
        {/* 左側：仿真 16:9 遊戲畫面畫布編輯器 */}
        <div style={{ 
          flex: 3, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.5rem',
          height: '100%' 
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            ⚠️ {t('Drag module headers to move. Drag the right-bottom corner handle to resize.') || '拖曳模組標題以移動，拖曳右下角小方塊進行縮放。'}
          </span>
          <div
            ref={canvasRef}
            style={{
              flex: 1,
              background: 'radial-gradient(circle, rgba(16, 24, 30, 1) 0%, rgba(8, 12, 16, 1) 100%)',
              border: '2px dashed rgba(0, 240, 255, 0.2)',
              borderRadius: '8px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
            }}
          >
            {/* 格線背景線 */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              pointerEvents: 'none'
            }} />

            {/* 繪製各個模組 */}
            {(Object.keys(layout.modules) as ModuleKey[]).map((key) => {
              const m = layout.modules[key];
              if (!m.visible) return null;

              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    left: `${m.x}px`,
                    top: `${m.y}px`,
                    width: `${m.w}px`,
                    height: `${m.h}px`,
                    border: activeModule === key ? '2px solid var(--primary)' : '1px solid rgba(0, 240, 255, 0.3)',
                    background: 'rgba(0, 10, 15, 0.75)',
                    borderRadius: '4px',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    backdropFilter: 'blur(3px)',
                    zIndex: activeModule === key ? 10 : 2
                  }}
                >
                  {/* 拖曳標題列 */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, key, 'drag')}
                    style={{
                      background: 'rgba(0, 240, 255, 0.1)',
                      padding: '4px 8px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      color: 'var(--primary)',
                      cursor: 'move',
                      userSelect: 'none',
                      borderBottom: '1px solid rgba(0, 240, 255, 0.2)'
                    }}
                  >
                    {moduleNames[key]}
                  </div>

                  {/* 模組虛擬內容 */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    color: 'rgba(255,255,255,0.4)',
                    pointerEvents: 'none'
                  }}>
                    {moduleNames[key]} HUD ({m.w} x {m.h})
                  </div>

                  {/* 縮放右下小控制塊 */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, key, 'resize')}
                    style={{
                      position: 'absolute',
                      right: '0',
                      bottom: '0',
                      width: '10px',
                      height: '10px',
                      background: 'var(--primary)',
                      cursor: 'nwse-resize',
                      borderTopLeftRadius: '3px'
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 右側：各模組開關控制列 */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '1.5rem',
          height: '100%',
          overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
            {t('Modules Control') || '模組清單控制'}
          </h3>
          
          {(Object.keys(layout.modules) as ModuleKey[]).map((key) => {
            const m = layout.modules[key];
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.8rem',
                  background: 'rgba(255, 255, 255, 0.01)',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{moduleNames[key]}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Pos: ({m.x}, {m.y}) | Size: ({m.w}x{m.h})
                  </span>
                </div>

                <label className="cyber-switch" style={{ display: 'inline-block', position: 'relative', width: '40px', height: '20px' }}>
                  <input
                    type="checkbox"
                    checked={m.visible}
                    onChange={() => handleToggleVisible(key)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: m.visible ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                    borderRadius: '20px',
                    transition: 'all 0.3s',
                    boxShadow: m.visible ? '0 0 8px rgba(0, 240, 255, 0.4)' : 'none'
                  }}>
                    <span style={{
                      position: 'absolute',
                      height: '14px', width: '14px',
                      left: m.visible ? '23px' : '3px',
                      bottom: '3px',
                      backgroundColor: '#fff',
                      borderRadius: '50%',
                      transition: 'all 0.3s'
                    }} />
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OverlayView;
