import React from 'react';
import { CarParams } from '../../../context/CarParamsContext';
import { formRowStyle, inputStyle } from './CommonStyles';

interface AdvancedGeometryProps {
  t: (key: string) => string;
  settings: any;
  carParams: CarParams;
  updateParam: (field: keyof CarParams, value: any) => void;
  displaySpringFrontMin: number | string;
  displaySpringFrontMax: number | string;
  displaySpringRearMin: number | string;
  displaySpringRearMax: number | string;
  handleSpringFrontMinChange: (valStr: string) => void;
  handleSpringFrontMaxChange: (valStr: string) => void;
  handleSpringRearMinChange: (valStr: string) => void;
  handleSpringRearMaxChange: (valStr: string) => void;
}

export const AdvancedGeometry: React.FC<AdvancedGeometryProps> = ({
  t,
  settings,
  carParams,
  updateParam,
  displaySpringFrontMin,
  displaySpringFrontMax,
  displaySpringRearMin,
  displaySpringRearMax,
  handleSpringFrontMinChange,
  handleSpringFrontMaxChange,
  handleSpringRearMinChange,
  handleSpringRearMaxChange
}) => {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem', marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {t("Advanced Suspension Limits & Geometry")}
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Column 1: Spring & ARB Limits */}
        <div>
          <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Spring & ARB Slider Limits")}</h4>
          <div style={formRowStyle}>
            <label>{t("Front Spring Min")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
            <input type="number" value={displaySpringFrontMin} onChange={e => handleSpringFrontMinChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 10.0" />
          </div>
          <div style={formRowStyle}>
            <label>{t("Front Spring Max")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
            <input type="number" value={displaySpringFrontMax} onChange={e => handleSpringFrontMaxChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 120.0" />
          </div>
          <div style={formRowStyle}>
            <label>{t("Rear Spring Min")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
            <input type="number" value={displaySpringRearMin} onChange={e => handleSpringRearMinChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 10.0" />
          </div>
          <div style={formRowStyle}>
            <label>{t("Rear Spring Max")} ({settings.units.springRate === 'lbsin' ? 'lbs/in' : 'kgf/mm'})</label>
            <input type="number" value={displaySpringRearMax} onChange={e => handleSpringRearMaxChange(e.target.value)} style={inputStyle} step="0.1" placeholder="e.g. 120.0" />
          </div>
          <div style={formRowStyle}>
            <label>{t("Front ARB Min / Max")}</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="number" value={carParams.arb_front_min ?? 1.0} onChange={e => updateParam('arb_front_min', parseFloat(e.target.value) || 1.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="1.0" />
              <input type="number" value={carParams.arb_front_max ?? 65.0} onChange={e => updateParam('arb_front_max', parseFloat(e.target.value) || 65.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="65.0" />
            </div>
          </div>
          <div style={formRowStyle}>
            <label>{t("Rear ARB Min / Max")}</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="number" value={carParams.arb_rear_min ?? 1.0} onChange={e => updateParam('arb_rear_min', parseFloat(e.target.value) || 1.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="1.0" />
              <input type="number" value={carParams.arb_rear_max ?? 65.0} onChange={e => updateParam('arb_rear_max', parseFloat(e.target.value) || 65.0)} style={{ ...inputStyle, width: '88px', padding: '0.5rem', textAlign: 'center' }} placeholder="65.0" />
            </div>
          </div>
        </div>

        
        {/* Column 3: Tuning Preferences */}
        <div>
          <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("Tuning Goal Preferences")}</h4>
          <div style={formRowStyle}>
            <label>{t("Target Ride Freq (Hz)")}</label>
            <input type="number" value={carParams.target_ride_frequency ?? 2.4} onChange={e => updateParam('target_ride_frequency', parseFloat(e.target.value) || 2.4)} style={inputStyle} step="0.05" min="1.0" max="4.0" />
          </div>
          <div style={formRowStyle}>
            <label>{t("Target Rebound Ratio")}</label>
            <input type="number" value={carParams.target_rebound_ratio ?? 0.70} onChange={e => updateParam('target_rebound_ratio', parseFloat(e.target.value) || 0.70)} style={inputStyle} step="0.01" min="0.30" max="0.95" />
          </div>
          <div style={formRowStyle}>
            <label>{t("Target Bump Ratio")}</label>
            <input type="number" value={carParams.target_bump_ratio ?? 0.55} onChange={e => updateParam('target_bump_ratio', parseFloat(e.target.value) || 0.55)} style={inputStyle} step="0.01" min="0.20" max="0.90" />
          </div>
        </div>
      </div>
    </div>
  );
};
