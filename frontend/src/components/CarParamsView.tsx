import React from 'react';
import { useCarParams, CarParams } from '../context/CarParamsContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useSettings } from '../context/SettingsContext';

const CarParamsView: React.FC = () => {
  const {
    carId, setCarId, carName, carParams, setCarParams, saveCarParams,
    clearDynoCurve, importDynoValues, updateSettings, isLoading,
    carsWithParams
  } = useCarParams();
  const { settings } = useSettings();
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  const [subTab, setSubTab] = React.useState<'config' | 'dyno'>('config');

  // Auto-save states
  const [saveState, setSaveState] = React.useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSavedTime, setLastSavedTime] = React.useState<string | null>(null);
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const triggerAutoSave = () => {
    setSaveState('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveCarParams();
        setSaveState('saved');
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        setLastSavedTime(timeStr);
      } catch (e) {
        setSaveState('unsaved');
      }
    }, 1500);
  };

  const renderSaveStatus = () => {
    if (saveState === 'unsaved') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ffaa00', fontSize: '0.85rem', fontWeight: 600 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffaa00', boxShadow: '0 0 8px #ffaa00', display: 'inline-block' }} />
          有尚未儲存的變更
        </div>
      );
    }
    if (saveState === 'saving') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 600 }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', 
            boxShadow: '0 0 8px var(--primary)', display: 'inline-block',
            animation: 'pulse 1s infinite alternate'
          }} />
          儲存中...
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#00e676', fontSize: '0.85rem', fontWeight: 600 }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e676', boxShadow: '0 0 8px #00e676', display: 'inline-block' }} />
        已儲存變更 {lastSavedTime && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '0.2rem' }}>({lastSavedTime})</span>}
      </div>
    );
  };

  // Power conversion for dyno (input in hp)
  const getPowerVal = (hp: number) => {
    if (settings.units.power === 'kw') return hp * 0.7457;
    if (settings.units.power === 'ps') return hp * 1.01387;
    return hp;
  };
  const getPowerLabel = () => {
    if (settings.units.power === 'kw') return 'kW';
    if (settings.units.power === 'ps') return 'PS';
    return 'HP';
  };

  // Torque conversion for dyno (input in lb-ft)
  const getTorqueVal = (lbft: number) => {
    if (settings.units.torque === 'nm') return lbft * 1.35582;
    return lbft;
  };
  const getTorqueLabel = () => {
    if (settings.units.torque === 'nm') return 'N·m';
    return 'lb-ft';
  };

  if (isLoading) {
    return <div style={{ color: 'white', padding: '2rem' }}>Loading car parameters...</div>;
  }

  if (!carParams) {
    return <div style={{ color: 'white', padding: '2rem' }}>No car loaded or telemetry inactive. Start driving a car to auto-create profile!</div>;
  }

  const updateParam = (field: keyof CarParams, value: any) => {
    if (!carParams) return;
    setCarParams({ ...carParams, [field]: value });
    triggerAutoSave();
  };

  const updateAdjust = (field: keyof CarParams['adjustability'], value: any) => {
    if (!carParams) return;
    setCarParams({ ...carParams, adjustability: { ...carParams.adjustability, [field]: value } });
    triggerAutoSave();
  };

  // Convert dyno_curve dict to sorted array for Recharts
  const dynoData = Object.keys(carParams.dyno_curve)
    .map(rpm => {
      const rawHp = carParams.dyno_curve[rpm].hp;
      const rawTorque = carParams.dyno_curve[rpm].torque;
      return {
        rpm: parseInt(rpm),
        hp: Math.round(getPowerVal(rawHp) * 10) / 10,
        torque: Math.round(getTorqueVal(rawTorque) * 10) / 10
      };
    })
    .sort((a, b) => a.rpm - b.rpm);

  // Weight unit handling (internal is kg)
  const displayCarWeight = settings.units.weight === 'lbs' 
    ? carParams.weight * 2.20462 
    : carParams.weight;

  const handleWeightChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const internalWeight = settings.units.weight === 'lbs'
      ? val / 2.20462
      : val;
    updateParam('weight', internalWeight);
  };

  // Power unit handling (internal is hp)
  const displayMaxHp = settings.units.power === 'kw' ? carParams.maxHp * 0.7457
    : settings.units.power === 'ps' ? carParams.maxHp * 1.01387
    : carParams.maxHp;

  const handleMaxHpChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const internalHp = settings.units.power === 'kw' ? val / 0.7457
      : settings.units.power === 'ps' ? val / 1.01387
      : val;
    updateParam('maxHp', Math.round(internalHp));
  };

  // Torque unit handling (internal is lb-ft)
  const displayMaxTorque = settings.units.torque === 'nm' ? carParams.maxTorque * 1.35582
    : carParams.maxTorque;

  const handleMaxTorqueChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const internalTorque = settings.units.torque === 'nm' ? val / 1.35582
      : val;
    updateParam('maxTorque', Math.round(internalTorque));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden', paddingRight: '0.5rem' }}>
      
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Car Parameters</h2>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={subTab === 'config' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('config')}>Profile Configuration</button>
            <button style={subTab === 'dyno' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('dyno')}>Live Dyno Curve</button>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          {renderSaveStatus()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          <span>車輛調校對象:</span>
          <select 
            value={carId} 
            onChange={(e) => setCarId(e.target.value)}
            style={{ 
              padding: '0.4rem 0.8rem', 
              background: 'rgba(0,0,0,0.4)', 
              color: 'white', 
              border: '1px solid rgba(255,255,255,0.15)', 
              borderRadius: '4px',
              fontWeight: 'normal',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {!carsWithParams.some(c => c.id === carId) && carId && (
              <option value={carId}>
                {carName} (ID: {carId}) *未儲存參數*
              </option>
            )}
            {carsWithParams.map(car => (
              <option key={car.id} value={car.id}>
                {car.name} (ID: {car.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {subTab === 'config' ? (
        /* Upper Section: Form Configurations */
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1, overflowY: 'auto' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>Car Profile Configuration</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Left Column: Static Info */}
            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>Static Info</h3>
              <div style={formRowStyle}>
                <label>Weight ({settings.units.weight})</label>
                <input type="number" value={Math.round(displayCarWeight)} onChange={e => handleWeightChange(e.target.value)} style={inputStyle} />
              </div>
              <div style={formRowStyle}>
                <label>Front Weight (%)</label>
                <input type="number" value={carParams.weight_distribution} onChange={e => updateParam('weight_distribution', parseFloat(e.target.value))} style={inputStyle} step="0.1" />
              </div>
              <div style={formRowStyle}>
                <label>Drivetrain</label>
                <select value={carParams.drivetrain} onChange={e => updateParam('drivetrain', e.target.value)} style={inputStyle}>
                  <option value="FWD">FWD (Front Wheel Drive)</option>
                  <option value="RWD">RWD (Rear Wheel Drive)</option>
                  <option value="AWD">AWD (All Wheel Drive)</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>Induction</label>
                <select value={carParams.induction} onChange={e => updateParam('induction', e.target.value)} style={inputStyle}>
                  <option value="NA">Naturally Aspirated (NA)</option>
                  <option value="Supercharger">Supercharger</option>
                  <option value="Turbo">Single Turbo</option>
                  <option value="TwinTurbo">Twin Turbo</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>Max HP ({getPowerLabel()})</label>
                <input type="number" value={Math.round(displayMaxHp)} onChange={e => handleMaxHpChange(e.target.value)} style={inputStyle} step="10" />
              </div>
              <div style={formRowStyle}>
                <label>Max HP RPM (rpm)</label>
                <input type="number" value={carParams.maxHpRpm || 0} onChange={e => updateParam('maxHpRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
              </div>
              <div style={formRowStyle}>
                <label>Max Torque ({getTorqueLabel()})</label>
                <input type="number" value={Math.round(displayMaxTorque)} onChange={e => handleMaxTorqueChange(e.target.value)} style={inputStyle} step="10" />
              </div>
              <div style={formRowStyle}>
                <label>Max Torque RPM (rpm)</label>
                <input type="number" value={carParams.maxTorqueRpm || 0} onChange={e => updateParam('maxTorqueRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
              </div>
              
              <div style={formRowStyle}>
                <label>Front Tire (mm/% R in)</label>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input type="number" value={carParams.frontTireWidth || 245} onChange={e => updateParam('frontTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} placeholder="245" />
                  <span style={{ color: 'gray' }}>/</span>
                  <input type="number" value={carParams.frontTireAspect || 40} onChange={e => updateParam('frontTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="40" />
                  <span style={{ color: 'gray' }}>R</span>
                  <input type="number" value={carParams.frontTireRim || 18} onChange={e => updateParam('frontTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="18" />
                </div>
              </div>
              <div style={formRowStyle}>
                <label>Rear Tire (mm/% R in)</label>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input type="number" value={carParams.rearTireWidth || 245} onChange={e => updateParam('rearTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} placeholder="245" />
                  <span style={{ color: 'gray' }}>/</span>
                  <input type="number" value={carParams.rearTireAspect || 40} onChange={e => updateParam('rearTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="40" />
                  <span style={{ color: 'gray' }}>R</span>
                  <input type="number" value={carParams.rearTireRim || 18} onChange={e => updateParam('rearTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="18" />
                </div>
              </div>
              
              <h4 style={{ margin: '1rem 0 0.5rem 0', color: 'var(--text-secondary)' }}>Assist Inputs</h4>
              <div style={formRowStyle}>
                <label>Aero Bal (0-1)</label>
                <input type="number" value={carParams.aeroBalance ?? 0.5} onChange={e => updateParam('aeroBalance', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
              </div>
              <div style={formRowStyle}>
                <label>Aero Eff (0-1)</label>
                <input type="number" value={carParams.aeroEfficiency ?? 0.5} onChange={e => updateParam('aeroEfficiency', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
              </div>
              <div style={formRowStyle}>
                <label>Mech Bal (0-1)</label>
                <input type="number" value={carParams.mechBalance ?? 0.5} onChange={e => updateParam('mechBalance', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
              </div>
            </div>
            
            {/* Right Column: Adjustability Limits */}
            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>Adjustability Limits</h3>
              <div style={formRowStyle}>
                <label>Gearbox</label>
                <select value={carParams.adjustability.gearbox} onChange={e => updateAdjust('gearbox', e.target.value)} style={inputStyle}>
                  <option value="Fixed">Fixed (Unadjustable)</option>
                  <option value="FinalDrive">Final Drive Only</option>
                  <option value="Full">Full Adjustable</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>Gears Count</label>
                <input type="number" value={carParams.adjustability.gears} min={4} max={10} onChange={e => updateAdjust('gears', parseInt(e.target.value))} style={inputStyle} />
              </div>
              <div style={formRowStyle}>
                <label>Suspension</label>
                <select value={carParams.adjustability.suspension} onChange={e => updateAdjust('suspension', e.target.value)} style={inputStyle}>
                  <option value="Fixed">Fixed</option>
                  <option value="Street">Street (No Springs/Dampers)</option>
                  <option value="Sport">Sport (No Springs/Dampers)</option>
                  <option value="Race">Race (Full Adjustable)</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>Anti-roll Bars</label>
                <select value={carParams.adjustability.arb} onChange={e => updateAdjust('arb', e.target.value)} style={inputStyle}>
                  <option value="Fixed">Fixed</option>
                  <option value="Adjustable">Adjustable</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>Aero</label>
                <select value={carParams.adjustability.aero || 'Fixed'} onChange={e => updateAdjust('aero', e.target.value)} style={inputStyle}>
                  <option value="Fixed">Fixed</option>
                  <option value="Front Only">Front Only</option>
                  <option value="Rear Only">Rear Only</option>
                  <option value="Adjustable">Adjustable</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>Brakes</label>
                <select value={carParams.adjustability.brakes || 'Fixed'} onChange={e => updateAdjust('brakes', e.target.value)} style={inputStyle}>
                  <option value="Fixed">Fixed</option>
                  <option value="Adjustable">Adjustable</option>
                </select>
              </div>
              <div style={formRowStyle}>
                <label>Differential</label>
                <select value={carParams.adjustability.diff || 'Fixed'} onChange={e => updateAdjust('diff', e.target.value)} style={inputStyle}>
                  <option value="Fixed">Fixed</option>
                  <option value="Adjustable">Adjustable</option>
                </select>
              </div>
            </div>
          </div>

          {/* Import from Dyno button */}
          <button
            onClick={importDynoValues}
            disabled={Object.keys(carParams.dyno_curve).length === 0}
            style={{
              ...btnStyle,
              background: Object.keys(carParams.dyno_curve).length === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0, 180, 255, 0.15)',
              color: Object.keys(carParams.dyno_curve).length === 0 ? 'rgba(255,255,255,0.3)' : '#00b4ff',
              border: '1px solid rgba(0, 180, 255, 0.3)',
              fontSize: '0.85rem',
              padding: '0.4rem 0.75rem',
              cursor: Object.keys(carParams.dyno_curve).length === 0 ? 'not-allowed' : 'pointer',
              width: '100%',
              textAlign: 'center',
              marginTop: '0.5rem'
            }}
          >
            📥 從 Dyno 數據導入 Max HP / Torque (含 RPM)
          </button>
        </div>
      ) : (
        /* Lower Section: Dyno Chart */
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, minHeight: 0 }}>
          {/* Title row with toggles */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.1rem' }}>Live Dyno Curve</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setShowClearConfirm(true)}
                style={{
                  ...btnStyle,
                  background: 'rgba(255, 60, 60, 0.15)',
                  color: '#ff6b6b',
                  border: '1px solid rgba(255, 60, 60, 0.3)',
                  fontSize: '0.8rem',
                  padding: '0.3rem 0.6rem'
                }}
              >
                清除數據
              </button>
            </div>
          </div>

          {/* Toggle switches row */}
          <div style={{
            display: 'flex', gap: '1.5rem',
            padding: '0.5rem 0.8rem',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '6px',
            alignItems: 'center',
            fontSize: '0.85rem',
            width: 'fit-content'
          }}>
            <ToggleSwitch
              label="Dyno 紀錄"
              checked={settings.dyno_recording}
              onChange={(v) => updateSettings({ dyno_recording: v })}
              color="#00e676"
            />
          </div>

          {/* Clear Confirmation Dialog */}
          {showClearConfirm && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.85)',
              border: '1px solid rgba(255, 60, 60, 0.5)',
              borderRadius: '8px',
              padding: '1rem 1.25rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}>
              <span style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>
                ⚠ 確定要清除此車輛的所有 Dyno 數據嗎？此操作無法復原。
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    await clearDynoCurve();
                    setShowClearConfirm(false);
                  }}
                  style={{
                    ...btnStyle,
                    background: '#ff4444',
                    color: 'white',
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.75rem'
                  }}
                >
                  確認清除
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    ...btnStyle,
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.75rem'
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
            在遊戲中以全油門駕駛車輛，系統將自動收集並記錄各 RPM 區段的馬力與扭矩數據。每個 RPM 點保留最多 50 筆歷史紀錄，透過 IQR 過濾離群值後加權計算。
          </p>

          <div style={{ flex: 1, minHeight: 0 }}>
            {dynoData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dynoData} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="rpm" 
                    stroke="var(--text-secondary)" 
                    label={{ value: 'Engine RPM', position: 'bottom', fill: 'var(--text-secondary)', offset: -5 }} 
                  />
                  <YAxis 
                    yAxisId="hp" 
                    stroke="var(--accent)" 
                    label={{ value: `Power (${getPowerLabel()})`, angle: -90, position: 'insideLeft', fill: 'var(--accent)' }} 
                  />
                  <YAxis 
                    yAxisId="torque" 
                    orientation="right" 
                    stroke="hsl(120, 80%, 60%)" 
                    label={{ value: `Torque (${getTorqueLabel()})`, angle: -90, position: 'insideRight', fill: 'hsl(120, 80%, 60%)' }} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }}
                  />
                  <Legend verticalAlign="top" height={24}/>
                  <Line yAxisId="hp" type="monotone" dataKey="hp" name={`Power (${getPowerLabel()})`} stroke="var(--accent)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
                  <Line yAxisId="torque" type="monotone" dataKey="torque" name={`Torque (${getTorqueLabel()})`} stroke="hsl(120, 80%, 60%)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                {settings.dyno_recording
                  ? '尚未收集到 Dyno 數據。請在遊戲中全油門行駛！'
                  : 'Dyno 紀錄已關閉。開啟後將開始收集數據。'}
              </div>
            )}
          </div>
        </div>
      )}
      
    </div>
  );
};

// --- Toggle Switch Component ---
const ToggleSwitch: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
}> = ({ label, checked, onChange, color = '#00e676' }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        background: checked ? color : 'rgba(255,255,255,0.15)',
        position: 'relative',
        transition: 'background 0.2s ease',
        flexShrink: 0,
        cursor: 'pointer'
      }}
    >
      <div style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'white',
        position: 'absolute',
        top: '2px',
        left: checked ? '18px' : '2px',
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }} />
    </div>
    <span style={{ color: checked ? 'white' : 'var(--text-secondary)', fontSize: '0.85rem', transition: 'color 0.2s' }}>
      {label}
    </span>
  </label>
);

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem'
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'white',
  borderRadius: '4px',
  width: '180px',
  textAlign: 'right'
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--primary)',
  color: 'black',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const activeTabStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

const inactiveTabStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  border: 'none',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

export default CarParamsView;
