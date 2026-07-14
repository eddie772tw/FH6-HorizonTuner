import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import '../App.css';

interface ColorRule {
  formula: string;
  color: string;
}

interface ComponentConfig {
  id: string;
  type: 'Text' | 'ProgressBar';
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  
  // 文字屬性
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  
  // 進度條屬性
  isVertical?: boolean;

  // 綁定
  bindings: {
    value: string;
    color: string | { colorRules: ColorRule[] };
  };
}

interface LayoutConfig {
  canvas: {
    w: number;
    h: number;
  };
  components: ComponentConfig[];
}

const DEFAULT_LAYOUT: LayoutConfig = {
  canvas: { w: 800, h: 480 },
  components: [
    {
      id: 'gear_text',
      type: 'Text',
      x: 350, y: 150, w: 100, h: 100,
      visible: true,
      fontSize: 72,
      align: 'center',
      bindings: {
        value: 'gear',
        color: '#ffaa00'
      }
    },
    {
      id: 'speed_text',
      type: 'Text',
      x: 250, y: 260, w: 300, h: 60,
      visible: true,
      fontSize: 32,
      align: 'center',
      bindings: {
        value: 'speed',
        color: '#ffffff'
      }
    },
    {
      id: 'rpm_bar',
      type: 'ProgressBar',
      x: 50, y: 50, w: 700, h: 30,
      visible: true,
      isVertical: false,
      bindings: {
        value: '(rpm - idleRpm) / (maxRpm - idleRpm)',
        color: {
          colorRules: [
            { formula: 'value > 0.9', color: '#ff0000' },
            { formula: 'value > 0.75', color: '#ffaa00' },
            { formula: 'default', color: '#00ff55' }
          ]
        }
      }
    }
  ]
};

export const OverlayView: React.FC = () => {
  const { t } = useSettings();
  const [layout, setLayout] = useState<LayoutConfig>(DEFAULT_LAYOUT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isOverlayRunning, setIsOverlayRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  // 編輯模式：'color' 為單色模式，'conditional' 為條件模式
  const [colorMode, setColorMode] = useState<'color' | 'conditional'>('color');

  // 拖放與縮放
  const [activeAction, setActiveAction] = useState<'drag' | 'resize' | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const startMousePos = useRef({ x: 0, y: 0 });
  const startModulePos = useRef({ x: 0, y: 0, w: 0, h: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // 載入狀態與 Layout
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

  const fetchLayout = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/overlay/layout');
      if (res.ok) {
        const data = await res.json();
        if (data && data.components) {
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

  // 儲存 Layout
  const saveLayout = async (newLayout: LayoutConfig = layout) => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/overlay/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLayout)
      });
      if (res.ok) {
        setStatusMessage(t('Layout saved') || '佈局已儲存');
        setTimeout(() => setStatusMessage(''), 2000);
      }
    } catch (e) {
      console.error('Failed to save layout:', e);
    }
  };

  // 啟動與終止 Overlay 進程
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

  const resetLayout = () => {
    if (window.confirm(t('Are you sure you want to reset layout?') || '確定要重置佈局嗎？')) {
      setLayout(DEFAULT_LAYOUT);
      saveLayout(DEFAULT_LAYOUT);
      setSelectedId(null);
    }
  };

  // 新增元件
  const addComponent = (type: 'Text' | 'ProgressBar') => {
    const id = `${type.toLowerCase()}_${Date.now().toString().slice(-4)}`;
    const newComp: ComponentConfig = type === 'Text' ? {
      id,
      type,
      x: 100, y: 100, w: 200, h: 50,
      visible: true,
      fontSize: 24,
      align: 'center',
      bindings: {
        value: 'speed',
        color: '#ffffff'
      }
    } : {
      id,
      type,
      x: 100, y: 150, w: 300, h: 25,
      visible: true,
      isVertical: false,
      bindings: {
        value: '(rpm - idleRpm) / (maxRpm - idleRpm)',
        color: '#00ff55'
      }
    };

    const updated = {
      ...layout,
      components: [...layout.components, newComp]
    };
    setLayout(updated);
    saveLayout(updated);
    setSelectedId(id);
  };

  // 刪除元件
  const deleteComponent = (id: string) => {
    if (window.confirm(t('Are you sure you want to delete this component?') || '確定要刪除此組件嗎？')) {
      const updated = {
        ...layout,
        components: layout.components.filter(c => c.id !== id)
      };
      setLayout(updated);
      saveLayout(updated);
      if (selectedId === id) setSelectedId(null);
    }
  };

  // 更新選定組件的特定屬性
  const updateSelectedComponent = (updatedFields: Partial<ComponentConfig>) => {
    if (!selectedId) return;
    const updatedComps = layout.components.map(c => {
      if (c.id === selectedId) {
        return { ...c, ...updatedFields } as ComponentConfig;
      }
      return c;
    });
    const updatedLayout = { ...layout, components: updatedComps };
    setLayout(updatedLayout);
    saveLayout(updatedLayout);
  };

  // 開始拖放與縮放
  const handleMouseDown = (
    e: React.MouseEvent,
    id: string,
    action: 'drag' | 'resize'
  ) => {
    e.preventDefault();
    setSelectedId(id);
    setActiveAction(action);
    setActiveModule(id);
    
    const comp = layout.components.find(c => c.id === id);
    if (!comp) return;
    
    startMousePos.current = { x: e.clientX, y: e.clientY };
    startModulePos.current = { x: comp.x, y: comp.y, w: comp.w, h: comp.h };
  };

  // 全局滑鼠拖曳與縮放移動
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeAction || !activeModule || !canvasRef.current) return;

      const deltaX = e.clientX - startMousePos.current.x;
      const deltaY = e.clientY - startMousePos.current.y;

      const canvasWidth = canvasRef.current.clientWidth;
      const canvasHeight = canvasRef.current.clientHeight;

      const updatedComps = layout.components.map(c => {
        if (c.id === activeModule) {
          const compCopy = { ...c };
          if (activeAction === 'drag') {
            let newX = startModulePos.current.x + deltaX;
            let newY = startModulePos.current.y + deltaY;

            newX = Math.max(0, Math.min(canvasWidth - compCopy.w, newX));
            newY = Math.max(0, Math.min(canvasHeight - compCopy.h, newY));

            compCopy.x = Math.round(newX);
            compCopy.y = Math.round(newY);
          } else if (activeAction === 'resize') {
            let newW = startModulePos.current.w + deltaX;
            let newH = startModulePos.current.h + deltaY;

            newW = Math.max(40, Math.min(canvasWidth - compCopy.x, newW));
            newH = Math.max(15, Math.min(canvasHeight - compCopy.y, newH));

            compCopy.w = Math.round(newW);
            compCopy.h = Math.round(newH);
          }
          return compCopy;
        }
        return c;
      });

      setLayout({ ...layout, components: updatedComps });
    };

    const handleMouseUp = () => {
      if (activeAction && activeModule) {
        saveLayout();
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

  const selectedComp = layout.components.find(c => c.id === selectedId);

  // 當選擇的組件變更時，動態同步色彩模式
  useEffect(() => {
    if (selectedComp) {
      if (typeof selectedComp.bindings.color === 'object') {
        setColorMode('conditional');
      } else {
        setColorMode('color');
      }
    }
  }, [selectedId]);

  // 修改顏色模式（單色 vs 條件）
  const handleColorModeChange = (mode: 'color' | 'conditional') => {
    if (!selectedComp) return;
    setColorMode(mode);
    
    if (mode === 'color') {
      updateSelectedComponent({
        bindings: {
          ...selectedComp.bindings,
          color: '#ffffff'
        }
      });
    } else {
      updateSelectedComponent({
        bindings: {
          ...selectedComp.bindings,
          color: {
            colorRules: [
              { formula: 'value > 0.9', color: '#ff0000' },
              { formula: 'default', color: '#00ff55' }
            ]
          }
        }
      });
    }
  };

  // 新增條件變色規則
  const addColorRule = () => {
    if (!selectedComp || typeof selectedComp.bindings.color !== 'object') return;
    const rules = [...selectedComp.bindings.color.colorRules];
    // 在 default 規則之前插入新規則
    const defaultIdx = rules.findIndex(r => r.formula === 'default');
    const newRule = { formula: 'value > 0.5', color: '#ffff00' };
    
    if (defaultIdx !== -1) {
      rules.splice(defaultIdx, 0, newRule);
    } else {
      rules.push(newRule);
    }

    updateSelectedComponent({
      bindings: {
        ...selectedComp.bindings,
        color: { colorRules: rules }
      }
    });
  };

  // 修改條件變色規則
  const updateColorRule = (index: number, fields: Partial<ColorRule>) => {
    if (!selectedComp || typeof selectedComp.bindings.color !== 'object') return;
    const rules = selectedComp.bindings.color.colorRules.map((r, idx) => {
      if (idx === index) {
        return { ...r, ...fields };
      }
      return r;
    });

    updateSelectedComponent({
      bindings: {
        ...selectedComp.bindings,
        color: { colorRules: rules }
      }
    });
  };

  // 刪除條件變色規則
  const deleteColorRule = (index: number) => {
    if (!selectedComp || typeof selectedComp.bindings.color !== 'object') return;
    const rules = selectedComp.bindings.color.colorRules.filter((_, idx) => idx !== index);

    updateSelectedComponent({
      bindings: {
        ...selectedComp.bindings,
        color: { colorRules: rules }
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem', overflow: 'auto' }}>
      
      {/* 頂部控制列 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.2rem 1.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div>
          <h2 style={{ margin: '0 0 0.4rem 0', color: 'var(--primary)' }}>
            {t('Dashboard Overlay') || '即時遙測儀表編輯器'}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t('Fully custom HUD layout. Set math expressions to drive components in-game.') || 
             '資料驅動式儀表。可為組件配置數學表達式（支援變數如 rpm, speed, gear 及其餘 20+ 遙測變數）。'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {statusMessage && (
            <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.9rem' }}>
              {statusMessage}
            </span>
          )}

          <button onClick={() => addComponent('Text')} className="cyber-btn-glow" style={buttonStyle('#00f0ff')}>
            + {t('Add Text') || '新增文字'}
          </button>
          
          <button onClick={() => addComponent('ProgressBar')} className="cyber-btn-glow" style={buttonStyle('#00ffaa')}>
            + {t('Add Bar') || '新增進度條'}
          </button>

          <button onClick={resetLayout} className="cyber-btn-glow" style={buttonStyle('#aaaaaa', 'rgba(255,255,255,0.05)')}>
            {t('Reset') || '重置'}
          </button>

          <button
            onClick={toggleOverlay}
            disabled={loading}
            className="cyber-btn-glow"
            style={{
              background: isOverlayRunning ? 'rgba(255, 0, 0, 0.15)' : 'rgba(0, 240, 255, 0.15)',
              border: isOverlayRunning ? '1px solid rgba(255, 0, 0, 0.4)' : '1px solid rgba(0, 240, 255, 0.4)',
              color: isOverlayRunning ? '#ff5555' : 'var(--primary)',
              padding: '0.5rem 1.2rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? '...' : isOverlayRunning ? (t('Stop Overlay') || '關閉 Overlay') : (t('Start Overlay') || '啟動 Overlay')}
          </button>
        </div>
      </div>

      {/* 主編輯視窗 */}
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0, height: '650px' }}>
        
        {/* 左側：16:9 仿真畫布 */}
        <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>🖱️ {t('Click to select. Drag headers to move, drag corners to resize.') || '點選組件以編輯。拖曳組件標題以移動，拖曳右下角以縮放。'}</span>
            <span>邏輯畫布解析度: 800 x 480</span>
          </div>
          
          <div
            ref={canvasRef}
            style={{
              flex: 1,
              background: 'radial-gradient(circle, rgba(16, 24, 30, 1) 0%, rgba(8, 12, 16, 1) 100%)',
              border: '2px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: 'inset 0 0 30px rgba(0,0,0,0.9)'
            }}
          >
            {/* 格線 */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
              backgroundSize: '25px 25px',
              pointerEvents: 'none'
            }} />

            {/* 渲染組件 */}
            {layout.components.map((comp) => {
              if (!comp.visible) return null;
              const isSelected = selectedId === comp.id;
              
              // 取得預覽顏色 (如果設定了條件顏色，預覽只顯示 default)
              let previewColor = '#ffffff';
              if (typeof comp.bindings.color === 'string') {
                previewColor = comp.bindings.color;
              } else {
                const defRule = comp.bindings.color.colorRules.find(r => r.formula === 'default');
                if (defRule) previewColor = defRule.color;
              }

              return (
                <div
                  key={comp.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(comp.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${comp.x}px`,
                    top: `${comp.y}px`,
                    width: `${comp.w}px`,
                    height: `${comp.h}px`,
                    border: isSelected ? '2px solid var(--primary)' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: isSelected ? 'rgba(0, 240, 255, 0.08)' : 'rgba(0, 0, 0, 0.6)',
                    borderRadius: '4px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    zIndex: isSelected ? 10 : 2
                  }}
                >
                  {/* 標題欄 (拖曳用) */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, comp.id, 'drag')}
                    style={{
                      background: isSelected ? 'rgba(0, 240, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'move',
                      userSelect: 'none',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden'
                    }}
                  >
                    [{comp.type}] {comp.id}
                  </div>

                  {/* 內容預覽 */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    pointerEvents: 'none'
                  }}>
                    {comp.type === 'Text' ? (
                      <span style={{ 
                        color: previewColor, 
                        fontSize: `${Math.min(comp.fontSize || 18, comp.h - 10)}px`,
                        fontWeight: 'bold',
                        textAlign: comp.align || 'left',
                        width: '100%'
                      }}>
                        {comp.bindings.value}
                      </span>
                    ) : (
                      <div style={{
                        width: '90%',
                        height: comp.isVertical ? '80%' : '12px',
                        border: `1px solid ${previewColor}55`,
                        borderRadius: '2px',
                        position: 'relative'
                      }}>
                        <div style={{
                          position: 'absolute',
                          left: 0, bottom: 0,
                          width: comp.isVertical ? '100%' : '70%',
                          height: comp.isVertical ? '70%' : '100%',
                          background: previewColor,
                          borderRadius: '1px'
                        }} />
                      </div>
                    )}
                  </div>

                  {/* 縮放點 */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, comp.id, 'resize')}
                    style={{
                      position: 'absolute',
                      right: '0',
                      bottom: '0',
                      width: '10px',
                      height: '10px',
                      background: 'var(--primary)',
                      cursor: 'nwse-resize'
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 右側：選定組件屬性編輯面板 */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '1.2rem',
          height: '100%',
          overflowY: 'auto'
        }}>
          {selectedComp ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)' }}>{t('Component Properties') || '屬性編輯'}</h3>
                <button
                  onClick={() => deleteComponent(selectedComp.id)}
                  style={{
                    background: 'rgba(255,0,0,0.1)',
                    border: '1px solid rgba(255,0,0,0.3)',
                    color: '#ff5555',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  {t('Delete') || '刪除'}
                </button>
              </div>

              {/* ID 編輯 */}
              <div className="property-item">
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>組件 ID</label>
                <input
                  type="text"
                  value={selectedComp.id}
                  onChange={(e) => updateSelectedComponent({ id: e.target.value })}
                  style={inputStyle}
                />
              </div>

              {/* 座標大小屬性 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>X 座標</label>
                  <input
                    type="number"
                    value={selectedComp.x}
                    onChange={(e) => updateSelectedComponent({ x: parseInt(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Y 座標</label>
                  <input
                    type="number"
                    value={selectedComp.y}
                    onChange={(e) => updateSelectedComponent({ y: parseInt(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>寬度 (W)</label>
                  <input
                    type="number"
                    value={selectedComp.w}
                    onChange={(e) => updateSelectedComponent({ w: parseInt(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>高度 (H)</label>
                  <input
                    type="number"
                    value={selectedComp.h}
                    onChange={(e) => updateSelectedComponent({ h: parseInt(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* 文字專用設定 */}
              {selectedComp.type === 'Text' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelStyle}>字型大小</label>
                    <input
                      type="number"
                      value={selectedComp.fontSize || 24}
                      onChange={(e) => updateSelectedComponent({ fontSize: parseInt(e.target.value) || 12 })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>水平對齊</label>
                    <select
                      value={selectedComp.align || 'left'}
                      onChange={(e) => updateSelectedComponent({ align: e.target.value as any })}
                      style={inputStyle}
                    >
                      <option value="left">靠左</option>
                      <option value="center">置中</option>
                      <option value="right">靠右</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 進度條專用設定 */}
              {selectedComp.type === 'ProgressBar' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="isVertical"
                    checked={selectedComp.isVertical || false}
                    onChange={(e) => updateSelectedComponent({ isVertical: e.target.checked })}
                  />
                  <label htmlFor="isVertical" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>垂直排列進度條</label>
                </div>
              )}

              {/* 數值公式綁定 */}
              <div className="property-item">
                <label style={labelStyle}>
                  數值公式 (Expression) 
                  <span style={{ color: 'var(--primary)', cursor: 'help', marginLeft: '6px' }} title="可用變數: speed, rpm, gear, maxRpm, boost, accelX, tireTempFL 等">ℹ️</span>
                </label>
                <input
                  type="text"
                  value={selectedComp.bindings.value}
                  onChange={(e) => updateSelectedComponent({
                    bindings: {
                      ...selectedComp.bindings,
                      value: e.target.value
                    }
                  })}
                  style={inputStyle}
                />
              </div>

              {/* 顏色編輯 */}
              <div className="property-item">
                <label style={labelStyle}>色彩模式</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button
                    onClick={() => handleColorModeChange('color')}
                    style={modeButtonStyle(colorMode === 'color')}
                  >
                    單色
                  </button>
                  <button
                    onClick={() => handleColorModeChange('conditional')}
                    style={modeButtonStyle(colorMode === 'conditional')}
                  >
                    條件變色
                  </button>
                </div>

                {colorMode === 'color' ? (
                  <div>
                    <label style={labelStyle}>單色 HEX 設定</label>
                    <input
                      type="color"
                      value={typeof selectedComp.bindings.color === 'string' ? selectedComp.bindings.color : '#ffffff'}
                      onChange={(e) => updateSelectedComponent({
                        bindings: {
                          ...selectedComp.bindings,
                          color: e.target.value
                        }
                      })}
                      style={{ width: '100%', height: '35px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={labelStyle}>條件變色規則表</label>
                    {typeof selectedComp.bindings.color === 'object' && selectedComp.bindings.color.colorRules.map((rule, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {rule.formula === 'default' ? (
                          <span style={{ fontSize: '0.8rem', width: '90px' }}>預設顏色</span>
                        ) : (
                          <input
                            type="text"
                            value={rule.formula}
                            placeholder="公式 (如 value>0.9)"
                            onChange={(e) => updateColorRule(idx, { formula: e.target.value })}
                            style={{ ...inputStyle, flex: 1, fontSize: '0.75rem', padding: '3px 6px' }}
                          />
                        )}
                        <input
                          type="color"
                          value={rule.color}
                          onChange={(e) => updateColorRule(idx, { color: e.target.value })}
                          style={{ width: '28px', height: '24px', border: 'none', padding: 0, cursor: 'pointer' }}
                        />
                        {rule.formula !== 'default' && (
                          <button
                            onClick={() => deleteColorRule(idx)}
                            style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addColorRule}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px dashed rgba(255,255,255,0.2)',
                        color: 'var(--text)',
                        padding: '4px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        marginTop: '4px'
                      }}
                    >
                      + 新增色彩條件
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              textAlign: 'center',
              padding: '2rem'
            }}>
              {t('Select a component in canvas or components list to edit properties.') || '請點選畫布上的組件開始編輯屬性，或者在頂部新增組件。'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 樣式輔助
const buttonStyle = (color: string, bg: string = 'rgba(0,0,0,0.3)') => ({
  background: bg,
  border: `1px solid ${color}55`,
  color: color,
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold' as const,
  fontSize: '0.85rem'
});

const modeButtonStyle = (isActive: boolean) => ({
  flex: 1,
  background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
  border: 'none',
  color: isActive ? '#000' : 'var(--text)',
  padding: '4px 0',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold' as const,
  fontSize: '0.8rem'
});

const inputStyle = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: '4px',
  fontSize: '0.85rem',
  boxSizing: 'border-box' as const
};

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginBottom: '2px'
};

export default OverlayView;
