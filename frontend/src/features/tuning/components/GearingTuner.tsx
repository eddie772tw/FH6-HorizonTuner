import React, { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useSettings } from '../../../context/SettingsContext';

interface GearingTunerProps {
  tuning: any;
  tuningMode: string;
  updateSection: (section: any, field: string, value: any) => void;
  numGears: number;
  chartData: any[];
  xMax: number;
  yMax: number;
  carParams: any;
  gearingMethod: string;
  setGearingMethod: (v: 'basic' | 'scientific' | 'drag_optimize') => void;
  basicCustomP: number;
  setBasicCustomP: (v: number) => void;
  pMin: number;
  pMax: number;
  gearingDiscipline: string;
  applyBasicGearing: () => void;
  applyScientificGearing: () => void;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'white',
  borderRadius: '4px'
};

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const GearingTunerComponent: React.FC<GearingTunerProps> = ({ 
  tuning, tuningMode, updateSection, numGears, chartData, xMax, yMax, carParams, 
  gearingMethod, setGearingMethod, basicCustomP, setBasicCustomP, pMin, pMax, 
  gearingDiscipline, applyBasicGearing, applyScientificGearing 
}) => {
  const { t } = useSettings();

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem', marginTop: '0.5rem' }}>
      <div style={{ marginBottom: '0.8rem' }}>
        <h4 style={{ margin: 0, color: 'white', fontSize: '0.95rem' }}>⚙️ {t("Gearbox Ratios (Optional)")}</h4>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.9fr 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Gears Input panel */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '6px', maxHeight: '380px', height: '380px', overflowY: 'auto' }}>
          <div style={formRowStyle}>
            <span style={{fontSize: '0.8rem', opacity: tuningMode === 'recommended' ? 0.5 : 1}}>{t("Final Drive")}</span>
            <input 
              type="number" step="0.01" value={tuning.gearing.finalDrive} 
              onChange={(e) => updateSection('gearing', 'finalDrive', parseFloat(e.target.value) || 3.40)} 
              disabled={tuningMode === 'recommended'}
              style={{ ...inputStyle, width: '60px', padding: '0.2rem', fontSize: '0.8rem', textAlign: 'right', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
            />
          </div>
          {Array.from({length: numGears}).map((_, i) => (
            <div key={`gear-in-${i}`} style={{ ...formRowStyle, marginBottom: '0.3rem' }}>
              <span style={{fontSize: '0.8rem', opacity: tuningMode === 'recommended' ? 0.5 : 1}}>{i + 1} Gear</span>
              <input 
                type="number" step="0.01" value={tuning.gearing.gears[i] || 0.0} 
                onChange={(e) => {
                  const newGears = [...tuning.gearing.gears];
                  newGears[i] = parseFloat(e.target.value) || 0.0;
                  updateSection('gearing', 'gears', newGears);
                }} 
                disabled={tuningMode === 'recommended'}
                style={{ ...inputStyle, width: '60px', padding: '0.2rem', fontSize: '0.8rem', textAlign: 'right', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
              />
            </div>
          ))}
        </div>

        {/* Gearing graph */}
        <div style={{ height: '380px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', padding: '0.5rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 15, right: 15, bottom: 5, left: -20 }}>
              <XAxis dataKey="speed" type="number" domain={[0, xMax]} stroke="rgba(255,255,255,0.4)" fontSize={9} />
              <YAxis type="number" domain={[0, yMax]} stroke="rgba(255,255,255,0.4)" fontSize={9} />
              {carParams?.maxHpRpm && (
                <ReferenceLine 
                  y={carParams.maxHpRpm} 
                  stroke="#ff3d00" 
                  strokeDasharray="3 3" 
                  label={{ value: `${t("Max HP")}: ${carParams.maxHpRpm} RPM`, fill: '#ff3d00', fontSize: 9, position: 'top' }} 
                />
              )}
              {carParams?.maxTorqueRpm && (
                <ReferenceLine 
                  y={carParams.maxTorqueRpm} 
                  stroke="#ffaa00" 
                  strokeDasharray="3 3" 
                  label={{ value: `${t("Max Torque")}: ${carParams.maxTorqueRpm} RPM`, fill: '#ffaa00', fontSize: 9, position: 'bottom' }} 
                />
              )}
              {Array.from({length: numGears}).map((_, i) => (
                <Line key={`gear-graph-${i}`} type="linear" dataKey={`gear${i+1}`} stroke={`hsl(${i * 45}, 80%, 60%)`} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={true} />
              ))}
              {/* Envelope Line */}
              <Line 
                type="monotone" 
                dataKey="currentEnvelope" 
                stroke="#ff00ff" 
                strokeWidth={1.5}
                strokeDasharray="4 4" 
                name={t("Gearing Envelope")}
                dot={false} 
                isAnimationActive={false}
                connectNulls={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Gearing Controls panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>{t("Tuning Method")}</span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={() => setGearingMethod('basic')} style={{ ...btnStyle, flex: 1, fontSize: '0.72rem', padding: '0.2rem 0.3rem', background: gearingMethod==='basic'?'var(--primary)':'rgba(255,255,255,0.05)', color: gearingMethod==='basic'?'black':'white' }}>{t("Basic Linear")}</button>
            <button onClick={() => setGearingMethod('scientific')} style={{ ...btnStyle, flex: 1, fontSize: '0.72rem', padding: '0.2rem 0.3rem', background: gearingMethod==='scientific'?'var(--primary)':'rgba(255,255,255,0.05)', color: gearingMethod==='scientific'?'black':'white' }}>{t("Scientific")}</button>
          </div>

          {gearingMethod === 'basic' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t("Spacing (p):")}</span>
                <span style={{ fontWeight: 'bold' }}>{basicCustomP.toFixed(2)}</span>
              </div>
              <input 
                type="range" min={pMin} max={pMax} step="0.01" value={basicCustomP} 
                onChange={(e) => setBasicCustomP(parseFloat(e.target.value))} 
                style={{ width: '100%', accentColor: 'var(--primary)' }} 
              />
              <button 
                onClick={applyBasicGearing}
                style={{ ...btnStyle, fontSize: '0.75rem', padding: '0.35rem', marginTop: '0.3rem' }}
              >
                ⚙️ {t("Apply")}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t("Discipline:")}</span>
                <span style={{ fontWeight: 'bold', color: 'white' }}>{gearingDiscipline}</span>
              </div>
              <button 
                onClick={applyScientificGearing} 
                style={{ ...btnStyle, background: 'rgba(0, 180, 255, 0.2)', color: '#00b4ff', border: '1px solid rgba(0, 180, 255, 0.3)', fontSize: '0.75rem', padding: '0.35rem', marginTop: '0.3rem', width: '100%' }}
              >
                🚀 {t("Apply")}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export const GearingTuner = memo(GearingTunerComponent);
