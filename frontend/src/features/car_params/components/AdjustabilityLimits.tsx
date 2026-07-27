import React from 'react';
import { CarParams } from '../../../context/CarParamsContext';
import { formRowStyle, inputStyle } from './CommonStyles';

interface AdjustabilityLimitsProps {
  t: (key: string) => string;
  carParams: CarParams;
  updateAdjust: (field: keyof CarParams['adjustability'], value: any) => void;
}

export const AdjustabilityLimits: React.FC<AdjustabilityLimitsProps> = ({
  t,
  carParams,
  updateAdjust
}) => {
  return (
    <div>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>{t("Adjustability Limits")}</h3>
      <div style={formRowStyle}>
        <label>{t("Gearbox")}</label>
        <select value={carParams.adjustability.gearbox} onChange={e => updateAdjust('gearbox', e.target.value)} style={inputStyle}>
          <option value="Fixed">{t("Fixed (Unadjustable)")}</option>
          <option value="FinalDrive">{t("Final Drive Only")}</option>
          <option value="Full">{t("Full Adjustable")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label>{t("Gears Count")}</label>
        <input type="number" value={carParams.adjustability.gears} min={4} max={10} onChange={e => updateAdjust('gears', parseInt(e.target.value))} style={inputStyle} />
      </div>
      <div style={formRowStyle}>
        <label>{t("Suspension")}</label>
        <select value={carParams.adjustability.suspension} onChange={e => updateAdjust('suspension', e.target.value)} style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Street">{t("Street (No Springs/Dampers)")}</option>
          <option value="Sport">{t("Sport (No Springs/Dampers)")}</option>
          <option value="Race">{t("Race (Full Adjustable)")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label>{t("Anti-roll Bars")}</label>
        <select value={carParams.adjustability.arb} onChange={e => updateAdjust('arb', e.target.value)} style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label>{t("Aero")}</label>
        <select value={carParams.adjustability.aero || 'Fixed'} onChange={e => updateAdjust('aero', e.target.value)} style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Front Only">{t("Front Only")}</option>
          <option value="Rear Only">{t("Rear Only")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label>{t("Brakes")}</label>
        <select value={carParams.adjustability.brakes || 'Fixed'} onChange={e => updateAdjust('brakes', e.target.value)} style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label>{t("Differential")}</label>
        <select value={carParams.adjustability.diff || 'Fixed'} onChange={e => updateAdjust('diff', e.target.value)} style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
    </div>
  );
};
