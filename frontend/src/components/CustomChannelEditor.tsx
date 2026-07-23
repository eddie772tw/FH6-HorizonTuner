import React, { useState, useMemo } from 'react';
import { evaluateCustomMath } from '../utils/customMathEngine';
import { useSettings } from '../context/SettingsContext';

export interface CustomChannelItem {
  name: string;
  formula: string;
}

interface CustomChannelEditorProps {
  channels: CustomChannelItem[];
  onChange: (channels: CustomChannelItem[]) => void;
}

const AVAILABLE_VARIABLES = [
  { key: 'Speed', desc: 'Vehicle Speed (km/h)', sampleVal: 120 },
  { key: 'RPM', desc: 'Engine RPM', sampleVal: 6200 },
  { key: 'Throttle', desc: 'Throttle Input (0-100%)', sampleVal: 100 },
  { key: 'Brake', desc: 'Brake Input (0-100%)', sampleVal: 0 },
  { key: 'Steer', desc: 'Steering Input (-100 to 100%)', sampleVal: 15 },
  { key: 'LatG', desc: 'Lateral Acceleration (G)', sampleVal: 1.25 },
  { key: 'LonG', desc: 'Longitudinal Acceleration (G)', sampleVal: -0.8 },
  { key: 'Susp_FL', desc: 'FL Suspension Travel (%)', sampleVal: 45 },
  { key: 'Susp_FR', desc: 'FR Suspension Travel (%)', sampleVal: 52 },
  { key: 'Susp_RL', desc: 'RL Suspension Travel (%)', sampleVal: 40 },
  { key: 'Susp_RR', desc: 'RR Suspension Travel (%)', sampleVal: 48 },
  { key: 'Temp_FL', desc: 'FL Tire Temp (°C)', sampleVal: 85 },
  { key: 'Temp_FR', desc: 'FR Tire Temp (°C)', sampleVal: 92 },
  { key: 'SlipAngle_FL', desc: 'FL Slip Angle (deg)', sampleVal: 3.5 },
  { key: 'SlipAngle_RL', desc: 'RL Slip Angle (deg)', sampleVal: 5.2 },
];

const OPERATORS = ['+', '-', '*', '/', '(', ')'];

const CustomChannelEditor: React.FC<CustomChannelEditorProps> = ({ channels, onChange }) => {
  const { t } = useSettings();
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [selectedVarDropdown, setSelectedVarDropdown] = useState('');

  // Sample context for live formula evaluation
  const sampleContext = useMemo(() => {
    const ctx: Record<string, number> = {};
    AVAILABLE_VARIABLES.forEach(v => {
      ctx[v.key] = v.sampleVal;
    });
    return ctx;
  }, []);

  // Live Formula Evaluation result
  const liveEvaluation = useMemo(() => {
    if (!formula.trim()) return { isValid: true, val: 0 };
    const val = evaluateCustomMath(formula, sampleContext);
    return { isValid: val !== 0 || formula.includes('0'), val };
  }, [formula, sampleContext]);

  const handleInsertVariable = (varKey: string) => {
    setFormula(prev => (prev ? `${prev} ${varKey}` : varKey));
    setSelectedVarDropdown('');
  };

  const handleAddChannel = () => {
    if (!name.trim() || !formula.trim()) return;
    const updated = [...channels, { name: name.trim(), formula: formula.trim() }];
    onChange(updated);
    setName('');
    setFormula('');
  };

  const handleRemoveChannel = (index: number) => {
    const updated = channels.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ color: 'var(--primary)', margin: 0 }}>
          {t("Custom Math Channel Formula Editor")}
        </h4>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {channels.length} {t("Custom Channels")}
        </span>
      </div>

      {/* Editor Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
        
        {/* Row 1: Channel Name & Autocomplete Dropdown */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Channel Name")}:</span>
            <input
              type="text"
              placeholder="e.g. OversteerMetric"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Autocomplete Variable Picker")}:</span>
            <select
              value={selectedVarDropdown}
              onChange={(e) => {
                const val = e.target.value;
                if (val) handleInsertVariable(val);
              }}
              style={selectStyle}
            >
              <option value="">-- {t("Select Variable to Insert")} --</option>
              {AVAILABLE_VARIABLES.map(v => (
                <option key={v.key} value={v.key}>
                  {v.key} ({v.desc})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Operator Bar */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '0.2rem' }}>{t("Operators")}:</span>
          {OPERATORS.map(op => (
            <button
              key={op}
              type="button"
              onClick={() => handleInsertVariable(op)}
              style={{ ...btnOpStyle }}
            >
              {op}
            </button>
          ))}
        </div>

        {/* Row 2: Formula Input & Live Preview */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Formula Expression")}:</span>
            <input
              type="text"
              placeholder="e.g. SlipAngle_RL - SlipAngle_FL"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace', color: 'var(--secondary)' }}
            />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Live Preview")}:</span>
            <div style={{ 
              padding: '0.45rem 0.75rem', 
              background: liveEvaluation.isValid ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)', 
              border: `1px solid ${liveEvaluation.isValid ? 'rgba(0,255,0,0.3)' : 'rgba(255,0,0,0.3)'}`,
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              color: liveEvaluation.isValid ? '#00ff00' : '#ff003c',
              textAlign: 'center'
            }}>
              {liveEvaluation.isValid ? `= ${liveEvaluation.val.toFixed(2)}` : t("Syntax Error")}
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddChannel}
            disabled={!name.trim() || !formula.trim()}
            style={{ ...btnStyle, marginTop: '1.2rem', height: '36px' }}
          >
            + {t("Add Channel")}
          </button>
        </div>
      </div>

      {/* Active Channels List */}
      {channels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {channels.map((ch, idx) => (
            <div key={ch.name} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid rgba(255,255,255,0.15)',
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.8rem'
            }}>
              <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{ch.name}:</span>
              <span style={{ fontFamily: 'monospace', color: '#ccc' }}>{ch.formula}</span>
              <button 
                onClick={() => handleRemoveChannel(idx)} 
                style={{ background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold', marginLeft: '0.2rem' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.2)',
  padding: '0.45rem 0.75rem',
  borderRadius: '4px',
  fontSize: '0.85rem',
  width: '100%',
  boxSizing: 'border-box'
};

const selectStyle: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.2)',
  padding: '0.45rem 0.75rem',
  borderRadius: '4px',
  fontSize: '0.85rem',
  cursor: 'pointer',
  width: '100%'
};

const btnStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

const btnOpStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.2)',
  padding: '0.2rem 0.6rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '0.85rem'
};

export default CustomChannelEditor;
