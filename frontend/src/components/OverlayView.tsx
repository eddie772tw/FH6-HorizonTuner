import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import '../App.css';

interface ColorRule {
  formula: string;
  color: string;
}

interface ComponentConfig {
  id: string;
  type: 'Text' | 'ProgressBar' | 'LEDGroup' | 'Needle';
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

  // LED 組件屬性
  ledCount?: number;
  ledShape?: 'circle' | 'rect';
  fillDirection?: 'left_to_right' | 'right_to_left' | 'center_out';

  // 旋轉指針屬性
  pivotX?: number;
  pivotY?: number;
  startAngle?: number;
  endAngle?: number;
  needleLength?: number;

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
      id: 'rpm_leds',
      type: 'LEDGroup',
      x: 200, y: 30, w: 400, h: 20,
      visible: true,
      ledCount: 10,
      ledShape: 'circle',
      fillDirection: 'left_to_right',
      bindings: {
        value: '(rpm - idleRpm) / (maxRpm - idleRpm)',
        color: '#ffffff'
      }
    },
    {
      id: 'rpm_needle',
      type: 'Needle',
      x: 50, y: 120, w: 200, h: 200,
      visible: true,
      pivotX: 100,
      pivotY: 100,
      startAngle: -135,
      endAngle: 135,
      needleLength: 80,
      bindings: {
        value: '(rpm - idleRpm) / (maxRpm - idleRpm)',
        color: '#ff2200'
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
  
  const [colorMode, setColorMode] = useState<'color' | 'conditional'>('color');

  // 拖放與縮放
  const [activeAction, setActiveAction] = useState<'drag' | 'resize' | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const startMousePos = useRef({ x: 0, y: 0 });
  const startModulePos = useRef({ x: 0, y: 0, w: 0, h: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // 輪詢狀態
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

  // 匯出 JSON 設定
  const exportLayout = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(layout, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "horizontuner_layout.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 匯入 JSON 設定
  const handleImportLayout = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && parsed.components && Array.isArray(parsed.components)) {
            setLayout(parsed);
            saveLayout(parsed);
            setSelectedId(null);
            alert(t('Imported successfully!') || '設定檔匯入成功！');
          } else {
            alert('Invalid configuration format.');
          }
        } catch (err) {
          alert('Failed to parse JSON file.');
        }
      };
    }
  };

  // 新增組件
  const addComponent = (type: ComponentConfig['type']) => {
    const id = `${type.toLowerCase()}_${Date.now().toString().slice(-4)}`;
    let newComp: ComponentConfig;
    
    if (type === 'Text') {
      newComp = {
        id, type, x: 100, y: 100, w: 200, h: 50, visible: true,
        fontSize: 24, align: 'center',
        bindings: { value: 'speed', color: '#ffffff' }
      };
    } else if (type === 'ProgressBar') {
      newComp = {
        id, type, x: 100, y: 150, w: 300, h: 25, visible: true,
        isVertical: false,
        bindings: { value: '(rpm - idleRpm) / (maxRpm - idleRpm)', color: '#00ff55' }
      };
    } else if (type === 'LEDGroup') {
      newComp = {
        id, type, x: 100, y: 200, w: 400, h: 20, visible: true,
        ledCount: 10, ledShape: 'circle', fillDirection: 'left_to_right',
        bindings: { value: '(rpm - idleRpm) / (maxRpm - idleRpm)', color: '#ffffff' }
      };
    } else {
      newComp = {
        id, type, x: 100, y: 240, w: 200, h: 200, visible: true,
        pivotX: 100, pivotY: 100, startAngle: -135, endAngle: 135, needleLength: 80,
        bindings: { value: '(rpm - idleRpm) / (maxRpm - idleRpm)', color: '#ff2200' }
      };
    }

    const updated = {
      ...layout,
      components: [...layout.components, newComp]
    };
    setLayout(updated);
    saveLayout(updated);
    setSelectedId(id);
  };

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

            newW = Math.max(20, Math.min(canvasWidth - compCopy.x, newW));
            newH = Math.max(15, Math.min(canvasHeight - compCopy.y, newH));

            compCopy.w = Math.round(newW);
            compCopy.h = Math.round(newH);
            
            // 如果是 Needle 針，自動將中心點跟指針長度對齊寬高的 50%
            if (compCopy.type === 'Needle') {
              compCopy.pivotX = Math.round(newW * 0.5);
              compCopy.pivotY = Math.round(newH * 0.5);
              compCopy.needleLength = Math.round(Math.min(newW, newH) * 0.45);
            }
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

  useEffect(() => {
    if (selectedComp) {
      if (typeof selectedComp.bindings.color === 'object') {
        setColorMode('conditional');
      } else {
        setColorMode('color');
      }
    }
  }, [selectedId]);

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

  const addColorRule = () => {
    if (!selectedComp || typeof selectedComp.bindings.color !== 'object') return;
    const rules = [...selectedComp.bindings.color.colorRules];
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.2rem', overflow: 'auto' }}>
      
      {/* 頂部控制列 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div>
          <h2 style={{ margin: '0 0 0.3rem 0', color: 'var(--primary)' }}>
            {t('Dashboard Overlay') || '賽車儀表編輯器 (Racing Dashboard Editor)'}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t('Fully custom HUD layout. Set math expressions to drive components in-game.') || 
             '資料驅動式儀表。可為組件配置數學表達式與超轉變色邏輯。支援方案 A (MPO) 獨佔全螢幕覆蓋。'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          {statusMessage && (
            <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>
              {statusMessage}
            </span>
          )}

          <button onClick={() => addComponent('Text')} className="cyber-btn-glow" style={buttonStyle('#00f0ff')}>
            + {t('Text') || '文字'}
          </button>
          
          <button onClick={() => addComponent('ProgressBar')} className="cyber-btn-glow" style={buttonStyle('#00ffaa')}>
            + {t('Bar') || '進度條'}
          </button>

          <button onClick={() => addComponent('LEDGroup')} className="cyber-btn-glow" style={buttonStyle('#ff00aa')}>
            + {t('LEDs') || '超轉燈'}
          </button>

          <button onClick={() => addComponent('Needle')} className="cyber-btn-glow" style={buttonStyle('#ffaa00')}>
            + {t('Needle') || '旋轉針'}
          </button>

          <button onClick={exportLayout} className="cyber-btn-glow" style={buttonStyle('#00ff00', 'rgba(0,255,0,0.05)')}>
            {t('Export') || '匯出佈局'}
          </button>

          <label className="cyber-btn-glow" style={{ ...buttonStyle('#ffbb00', 'rgba(255,180,0,0.05)'), display: 'inline-block', margin: 0 }}>
            {t('Import') || '匯入佈局'}
            <input type="file" accept=".json" onChange={handleImportLayout} style={{ display: 'none' }} />
          </label>

          <button onClick={resetLayout} className="cyber-btn-glow" style={buttonStyle('#aaaaaa', 'rgba(255,255,255,0.03)')}>
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
              padding: '0.4rem 1.2rem',
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
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0, height: '620px' }}>
        
        {/* 左側：畫布 */}
        <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '0.4rem', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>🖱️ {t('Click to select. Drag headers to move, drag corners to resize.') || '拖曳組件標題以移動，拖曳右下角以縮放。'}</span>
            <span>畫布比例: 16:9 (邏輯寬高: 800 x 480)</span>
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
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
              backgroundSize: '25px 25px',
              pointerEvents: 'none'
            }} />

            {layout.components.map((comp) => {
              if (!comp.visible) return null;
              const isSelected = selectedId === comp.id;
              
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
                    background: isSelected ? 'rgba(0, 240, 255, 0.08)' : 'rgba(0, 0, 0, 0.65)',
                    borderRadius: '4px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    zIndex: isSelected ? 10 : 2
                  }}
                >
                  <div
                    onMouseDown={(e) => handleMouseDown(e, comp.id, 'drag')}
                    style={{
                      background: isSelected ? 'rgba(0, 240, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 8px',
                      fontSize: '0.72rem',
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

                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px',
                    pointerEvents: 'none',
                    position: 'relative'
                  }}>
                    {comp.type === 'Text' && (
                      <span style={{ 
                        color: previewColor, 
                        fontSize: `${Math.min(comp.fontSize || 18, comp.h - 12)}px`,
                        fontWeight: 'bold',
                        textAlign: comp.align || 'left',
                        width: '100%'
                      }}>
                        {comp.bindings.value}
                      </span>
                    )}

                    {comp.type === 'ProgressBar' && (
                      <div style={{
                        width: '90%',
                        height: comp.isVertical ? '80%' : '10px',
                        border: `1px solid ${previewColor}44`,
                        borderRadius: '2px',
                        position: 'relative'
                      }}>
                        <div style={{
                          position: 'absolute',
                          left: 0, bottom: 0,
                          width: comp.isVertical ? '100%' : '65%',
                          height: comp.isVertical ? '65%' : '100%',
                          background: previewColor,
                          borderRadius: '1px'
                        }} />
                      </div>
                    )}

                    {comp.type === 'LEDGroup' && (
                      <div style={{ display: 'flex', gap: '3px', width: '90%', justifyContent: 'center' }}>
                        {Array.from({ length: comp.ledCount || 10 }).map((_, ledIdx) => {
                          const ledRatio = ledIdx / (comp.ledCount || 10);
                          let dotColor = '#333333';
                          if (ledIdx < (comp.ledCount || 10) * 0.7) {
                            dotColor = ledRatio < 0.6 ? '#00ff55' : ledRatio < 0.8 ? '#ffaa00' : '#ff0000';
                          }
                          return (
                            <div
                              key={ledIdx}
                              style={{
                                width: comp.ledShape === 'circle' ? '10px' : '8px',
                                height: comp.ledShape === 'circle' ? '10px' : '12px',
                                borderRadius: comp.ledShape === 'circle' ? '50%' : '1px',
                                background: dotColor,
                                border: '1px solid rgba(0,0,0,0.5)'
                              }}
                            />
                          );
                        })}
                      </div>
                    )}

                    {comp.type === 'Needle' && (
                      <svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
                        {/* 繪製量圈背景線 */}
                        <path
                          d={`M ${comp.w * 0.15} ${comp.h * 0.8} A ${comp.w * 0.4} ${comp.h * 0.4} 0 0 1 ${comp.w * 0.85} ${comp.h * 0.8}`}
                          fill="none"
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                        {/* 繪製指針線 (模擬在 15% 比率的轉向角度) */}
                        <line
                          x1={comp.pivotX}
                          y1={comp.pivotY}
                          x2={(comp.pivotX || 100) + (comp.needleLength || 80) * Math.cos((-110 * Math.PI) / 180)}
                          y2={(comp.pivotY || 100) + (comp.needleLength || 80) * Math.sin((-110 * Math.PI) / 180)}
                          stroke={previewColor}
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        {/* 繪製針蓋 */}
                        <circle
                          cx={comp.pivotX}
                          cy={comp.pivotY}
                          r={Math.min(comp.w, comp.h) * 0.08}
                          fill="#222"
                          stroke="#666"
                          strokeWidth="1"
                        />
                      </svg>
                    )}
                  </div>

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

        {/* 右側：屬性編輯 */}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)' }}>{t('Properties') || '屬性編輯'}</h3>
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
              <div>
                <label style={labelStyle}>組件 ID</label>
                <input
                  type="text"
                  value={selectedComp.id}
                  onChange={(e) => updateSelectedComponent({ id: e.target.value })}
                  style={inputStyle}
                />
              </div>

              {/* 座標大小 */}
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

              {/* Text 屬性 */}
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

              {/* ProgressBar 屬性 */}
              {selectedComp.type === 'ProgressBar' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="isVertical"
                    checked={selectedComp.isVertical || false}
                    onChange={(e) => updateSelectedComponent({ isVertical: e.target.checked })}
                  />
                  <label htmlFor="isVertical" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>垂直方向進度條</label>
                </div>
              )}

              {/* LEDGroup 屬性 */}
              {selectedComp.type === 'LEDGroup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={labelStyle}>LED 燈數</label>
                      <input
                        type="number"
                        value={selectedComp.ledCount || 10}
                        onChange={(e) => updateSelectedComponent({ ledCount: parseInt(e.target.value) || 5 })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>燈形狀</label>
                      <select
                        value={selectedComp.ledShape || 'circle'}
                        onChange={(e) => updateSelectedComponent({ ledShape: e.target.value as any })}
                        style={inputStyle}
                      >
                        <option value="circle">圓形</option>
                        <option value="rect">矩形</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>亮燈方向</label>
                    <select
                      value={selectedComp.fillDirection || 'left_to_right'}
                      onChange={(e) => updateSelectedComponent({ fillDirection: e.target.value as any })}
                      style={inputStyle}
                    >
                      <option value="left_to_right">由左至右</option>
                      <option value="right_to_left">由右至左</option>
                      <option value="center_out">中間向兩側擴散</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Needle 屬性 */}
              {selectedComp.type === 'Needle' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={labelStyle}>中心點 X (Pivot X)</label>
                      <input
                        type="number"
                        value={selectedComp.pivotX || 100}
                        onChange={(e) => updateSelectedComponent({ pivotX: parseInt(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>中心點 Y (Pivot Y)</label>
                      <input
                        type="number"
                        value={selectedComp.pivotY || 100}
                        onChange={(e) => updateSelectedComponent({ pivotY: parseInt(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <div>
                      <label style={labelStyle}>起角 (度)</label>
                      <input
                        type="number"
                        value={selectedComp.startAngle || -135}
                        onChange={(e) => updateSelectedComponent({ startAngle: parseInt(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>迄角 (度)</label>
                      <input
                        type="number"
                        value={selectedComp.endAngle || 135}
                        onChange={(e) => updateSelectedComponent({ endAngle: parseInt(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>針長度</label>
                      <input
                        type="number"
                        value={selectedComp.needleLength || 80}
                        onChange={(e) => updateSelectedComponent({ needleLength: parseInt(e.target.value) || 10 })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 數值綁定 */}
              <div>
                <label style={labelStyle}>
                  數值綁定公式
                  <span style={{ color: 'var(--primary)', cursor: 'help', marginLeft: '4px' }} title="支援變數: speed, rpm, gear, maxRpm, boost, accelX/Y/Z, tireTempFL/FR/RL/RR 等">ℹ️</span>
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

              {/* 顏色 */}
              <div>
                <label style={labelStyle}>色彩設定模式</label>
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
                    <label style={labelStyle}>選擇顏色</label>
                    <input
                      type="color"
                      value={typeof selectedComp.bindings.color === 'string' ? selectedComp.bindings.color : '#ffffff'}
                      onChange={(e) => updateSelectedComponent({
                        bindings: {
                          ...selectedComp.bindings,
                          color: e.target.value
                        }
                      })}
                      style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={labelStyle}>條件色彩規則 (Top-down 優先權)</label>
                    {typeof selectedComp.bindings.color === 'object' && selectedComp.bindings.color.colorRules.map((rule, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {rule.formula === 'default' ? (
                          <span style={{ fontSize: '0.75rem', width: '80px' }}>預設背景色</span>
                        ) : (
                          <input
                            type="text"
                            value={rule.formula}
                            placeholder="公式, 例: value>0.9"
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
                            style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '1rem' }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addColorRule}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px dashed rgba(255,255,255,0.15)',
                        color: 'var(--text)',
                        padding: '4px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        marginTop: '2px'
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
              fontSize: '0.85rem',
              textAlign: 'center',
              padding: '1.5rem'
            }}>
              {t('Select a component in canvas or components list to edit properties.') || '請點選畫布上的組件開始編輯屬性，或者在頂部新增組件。'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const buttonStyle = (color: string, bg: string = 'rgba(0,0,0,0.3)') => ({
  background: bg,
  border: `1px solid ${color}55`,
  color: color,
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold' as const,
  fontSize: '0.8rem'
});

const modeButtonStyle = (isActive: boolean) => ({
  flex: 1,
  background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
  border: 'none',
  color: isActive ? '#000' : 'var(--text)',
  padding: '3px 0',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold' as const,
  fontSize: '0.75rem'
});

const inputStyle = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  padding: '5px 8px',
  borderRadius: '4px',
  fontSize: '0.8rem',
  boxSizing: 'border-box' as const
};

const labelStyle = {
  display: 'block',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  marginBottom: '2px'
};

export default OverlayView;
