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
  const isFrontAutoAero = (carParams.aero_downforce_front ?? 0) <= 0;
  const isRearAutoAero = (carParams.aero_downforce_rear ?? 0) <= 0;

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem', marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {t("Suspension & Aerodynamic Limits")}
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Column 1: Spring Stiffness Range Limits */}
        <div>
          <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {t("Spring Stiffness Slider Limits")}
          </h4>
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
        </div>

        {/* Column 2: Ride Height & Aerodynamic Downforce Limits */}
        <div>
          <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {t("Ride Height & Aero Downforce Limits")}
          </h4>
          
          <div style={formRowStyle}>
            <label>{t("Front Ride Height Range (cm)")}</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="number" step="0.1" value={carParams.height_front_min ?? 10.0} onChange={e => updateParam('height_front_min', parseFloat(e.target.value) || 10.0)} style={{ ...inputStyle, width: '88px', textAlign: 'center' }} placeholder="Min" />
              <input type="number" step="0.1" value={carParams.height_front_max ?? 25.0} onChange={e => updateParam('height_front_max', parseFloat(e.target.value) || 25.0)} style={{ ...inputStyle, width: '88px', textAlign: 'center' }} placeholder="Max" />
            </div>
          </div>

          <div style={formRowStyle}>
            <label>{t("Rear Ride Height Range (cm)")}</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="number" step="0.1" value={carParams.height_rear_min ?? 10.0} onChange={e => updateParam('height_rear_min', parseFloat(e.target.value) || 10.0)} style={{ ...inputStyle, width: '88px', textAlign: 'center' }} placeholder="Min" />
              <input type="number" step="0.1" value={carParams.height_rear_max ?? 25.0} onChange={e => updateParam('height_rear_max', parseFloat(e.target.value) || 25.0)} style={{ ...inputStyle, width: '88px', textAlign: 'center' }} placeholder="Max" />
            </div>
          </div>

          <div style={formRowStyle}>
            <label>{t("Front Downforce (kgf)")}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="number" disabled={isFrontAutoAero} value={isFrontAutoAero ? 0 : (carParams.aero_downforce_front || 0)} onChange={e => updateParam('aero_downforce_front', Math.max(0, parseFloat(e.target.value) || 0))} style={{ ...inputStyle, width: '88px', opacity: isFrontAutoAero ? 0.5 : 1 }} />
              <label style={{ fontSize: '0.8rem', color: 'gray', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={isFrontAutoAero} onChange={e => updateParam('aero_downforce_front', e.target.checked ? 0 : 50)} />
                {t("Auto (0)")}
              </label>
            </div>
          </div>

          <div style={formRowStyle}>
            <label>{t("Rear Downforce (kgf)")}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="number" disabled={isRearAutoAero} value={isRearAutoAero ? 0 : (carParams.aero_downforce_rear || 0)} onChange={e => updateParam('aero_downforce_rear', Math.max(0, parseFloat(e.target.value) || 0))} style={{ ...inputStyle, width: '88px', opacity: isRearAutoAero ? 0.5 : 1 }} />
              <label style={{ fontSize: '0.8rem', color: 'gray', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={isRearAutoAero} onChange={e => updateParam('aero_downforce_rear', e.target.checked ? 0 : 50)} />
                {t("Auto (0)")}
              </label>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
