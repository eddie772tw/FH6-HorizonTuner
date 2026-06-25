import React from 'react';
import { useSettings, UnitSettings } from '../context/SettingsContext';

const SettingsView: React.FC = () => {
  const { settings, updateSettings, isLoading } = useSettings();

  const handleUnitChange = (key: keyof UnitSettings, value: string) => {
    updateSettings({
      units: {
        [key]: value
      }
    });
  };

  const applyPreset = (preset: 'metric' | 'imperial') => {
    if (preset === 'metric') {
      updateSettings({
        units: {
          speed: 'kmh',
          weight: 'kg',
          temperature: 'C',
          tirePressure: 'bar',
          boostPressure: 'bar',
          springRate: 'kgfmm',
          rideHeight: 'cm',
          suspensionForce: 'kgf',
          power: 'kw',
          torque: 'nm'
        }
      });
    } else {
      updateSettings({
        units: {
          speed: 'mph',
          weight: 'lbs',
          temperature: 'F',
          tirePressure: 'psi',
          boostPressure: 'psi',
          springRate: 'lbsin',
          rideHeight: 'in',
          suspensionForce: 'lbf',
          power: 'hp',
          torque: 'lbft'
        }
      });
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--primary)' }}>
        <h3>Loading Settings...</h3>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    background: 'rgba(0, 0, 0, 0.4)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '6px',
    padding: '0.6rem 1rem',
    fontSize: '0.95rem',
    width: '180px',
    outline: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.2rem',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
  };

  const settingRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '0.8rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  };

  return (
    <div style={{ 
      maxWidth: '900px', 
      margin: '0 auto', 
      width: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '2rem',
      overflowY: 'auto',
      maxHeight: 'calc(100vh - 120px)',
      paddingRight: '0.5rem'
    }}>
      {/* Header Panel */}
      <div className="glass-panel" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '2rem',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.8rem', textShadow: '0 0 10px rgba(0, 240, 255, 0.3)' }}>
            系統設定與單位換算
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            在此調整工具箱中各項數據的換算單位。所有變更均會自動儲存至專案目錄的 settings.json 中。
          </p>
        </div>
        
        {/* Preset Buttons */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => applyPreset('metric')}
            className="preset-btn"
            style={{
              background: 'none',
              border: '1px solid var(--primary)',
              color: 'var(--primary)',
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.3s',
            }}
          >
            一鍵公制 (All Metric)
          </button>
          <button 
            onClick={() => applyPreset('imperial')}
            className="preset-btn"
            style={{
              background: 'none',
              border: '1px solid var(--secondary)',
              color: 'var(--secondary)',
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.3s',
            }}
          >
            一鍵英制 (All Imperial)
          </button>
        </div>
      </div>

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Left Column: General & Basic Units */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* General Settings */}
          <div style={cardStyle}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              一般錄製設定
            </h3>
            
            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>馬力機曲線錄製 (Dyno Recording)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>在全油門加速時自動收集並更新引擎輸出曲線。</span>
              </div>
              <input 
                type="checkbox" 
                checked={settings.dyno_recording}
                onChange={(e) => updateSettings({ dyno_recording: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>遙測賽道錄製 (Race Recording)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>在比賽或駕駛中錄製懸吊與抓地力數據，供賽後分析。</span>
              </div>
              <input 
                type="checkbox" 
                checked={settings.race_recording}
                onChange={(e) => updateSettings({ race_recording: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>
          </div>

          {/* Basic Units */}
          <div style={cardStyle}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem' }}>
              一般車輛單位
            </h3>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>車速單位 (Speed)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於當前車速、最高車速及齒比圖。</span>
              </div>
              <select 
                value={settings.units.speed} 
                onChange={(e) => handleUnitChange('speed', e.target.value)}
                style={selectStyle}
              >
                <option value="kmh">公制 (km/h)</option>
                <option value="mph">英制 (mph)</option>
              </select>
            </div>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>車重單位 (Weight)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於車輛參數與調校計算器。</span>
              </div>
              <select 
                value={settings.units.weight} 
                onChange={(e) => handleUnitChange('weight', e.target.value)}
                style={selectStyle}
              >
                <option value="kg">公制 (kg)</option>
                <option value="lbs">英制 (lbs)</option>
              </select>
            </div>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>溫度單位 (Temperature)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>統一套用於胎溫及所有引擎相關溫度設定。</span>
              </div>
              <select 
                value={settings.units.temperature} 
                onChange={(e) => handleUnitChange('temperature', e.target.value)}
                style={selectStyle}
              >
                <option value="C">公制 (攝氏 °C)</option>
                <option value="F">英制 (華氏 °F)</option>
              </select>
            </div>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>車身高度 (Ride Height)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於懸吊調校的高度滑桿。</span>
              </div>
              <select 
                value={settings.units.rideHeight} 
                onChange={(e) => handleUnitChange('rideHeight', e.target.value)}
                style={selectStyle}
              >
                <option value="cm">公制 (cm)</option>
                <option value="in">英制 (in)</option>
              </select>
            </div>
          </div>

        </div>

        {/* Right Column: Pressures, Gearing & Engine Units */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Pressure Settings (Separable) */}
          <div style={cardStyle}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem' }}>
              氣壓單位設定 (可分開設置)
            </h3>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>胎壓單位 (Tire Pressure)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於四輪胎壓調校與即時遙測。</span>
              </div>
              <select 
                value={settings.units.tirePressure} 
                onChange={(e) => handleUnitChange('tirePressure', e.target.value)}
                style={selectStyle}
              >
                <option value="bar">公制 (bar)</option>
                <option value="psi">英制 (psi)</option>
                <option value="kpa">公制 (kPa)</option>
              </select>
            </div>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>渦輪增壓值 (Boost Pressure)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於儀表板上的渦輪增壓計。</span>
              </div>
              <select 
                value={settings.units.boostPressure} 
                onChange={(e) => handleUnitChange('boostPressure', e.target.value)}
                style={selectStyle}
              >
                <option value="psi">英制 (PSI)</option>
                <option value="bar">公制 (bar)</option>
                <option value="kpa">公制 (kPa)</option>
              </select>
            </div>
          </div>

          {/* Gearing & Suspension */}
          <div style={cardStyle}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem' }}>
              底盤與力學單位
            </h3>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>彈簧剛度 (Spring Rate)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於彈簧滑桿與計算器。</span>
              </div>
              <select 
                value={settings.units.springRate} 
                onChange={(e) => handleUnitChange('springRate', e.target.value)}
                style={selectStyle}
              >
                <option value="kgfmm">公制 (kgf/mm)</option>
                <option value="lbsin">英制 (lbs/in)</option>
              </select>
            </div>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>懸吊受力 (Suspension Force)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於防傾桿或懸吊荷重分析。</span>
              </div>
              <select 
                value={settings.units.suspensionForce} 
                onChange={(e) => handleUnitChange('suspensionForce', e.target.value)}
                style={selectStyle}
              >
                <option value="kgf">公制 (kgf)</option>
                <option value="lbf">英制 (lbf)</option>
              </select>
            </div>
          </div>

          {/* Power & Torque */}
          <div style={cardStyle}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem' }}>
              引擎動力輸出
            </h3>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>動力單位 (Power)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於車輛參數與儀表板最大馬力。</span>
              </div>
              <select 
                value={settings.units.power} 
                onChange={(e) => handleUnitChange('power', e.target.value)}
                style={selectStyle}
              >
                <option value="kw">千瓦 (kW)</option>
                <option value="hp">美制馬力 (hp)</option>
                <option value="ps">公制馬力 (PS)</option>
              </select>
            </div>

            <div style={settingRowStyle}>
              <div>
                <strong style={{ display: 'block', color: 'white' }}>扭力單位 (Torque)</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>適用於馬力機扭力輸出與即時扭力。</span>
              </div>
              <select 
                value={settings.units.torque} 
                onChange={(e) => handleUnitChange('torque', e.target.value)}
                style={selectStyle}
              >
                <option value="nm">牛頓·米 (N·m)</option>
                <option value="lbft">磅·英尺 (lb-ft)</option>
              </select>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default SettingsView;
