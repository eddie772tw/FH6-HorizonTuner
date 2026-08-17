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
      <div style={{...formRowStyle, opacity: 0.5}}>
        <label htmlFor="adj-gearbox">{t("Gearbox")} <span style={{color: 'orange', fontSize: '0.7rem'}}>({t("Coming Soon")})</span></label>
        <select id="adj-gearbox" value={carParams.adjustability.gearbox} disabled style={inputStyle}>
          <option value="Fixed">{t("Fixed (Unadjustable)")}</option>
          <option value="FinalDrive">{t("Final Drive Only")}</option>
          <option value="Full">{t("Full Adjustable")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label htmlFor="adj-gears">{t("Gears Count")}</label>
        <input id="adj-gears" type="number" value={carParams.adjustability.gears} min={4} max={10} onChange={e => updateAdjust('gears', parseInt(e.target.value))} style={inputStyle} />
      </div>
      <div style={{...formRowStyle, opacity: 0.5}}>
        <label htmlFor="adj-suspension">{t("Suspension")} <span style={{color: 'orange', fontSize: '0.7rem'}}>({t("Coming Soon")})</span></label>
        <select id="adj-suspension" value={carParams.adjustability.suspension} disabled style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Street">{t("Street (No Springs/Dampers)")}</option>
          <option value="Sport">{t("Sport (No Springs/Dampers)")}</option>
          <option value="Race">{t("Race (Full Adjustable)")}</option>
        </select>
      </div>
      <div style={{...formRowStyle, opacity: 0.5}}>
        <label htmlFor="adj-arb">{t("Anti-roll Bars")} <span style={{color: 'orange', fontSize: '0.7rem'}}>({t("Coming Soon")})</span></label>
        <select id="adj-arb" value={carParams.adjustability.arb} disabled style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
      <div style={{...formRowStyle, opacity: 0.5}}>
        <label htmlFor="adj-aero">{t("Aero")} <span style={{color: 'orange', fontSize: '0.7rem'}}>({t("Coming Soon")})</span></label>
        <select id="adj-aero" value={carParams.adjustability.aero || 'Fixed'} disabled style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Front Only">{t("Front Only")}</option>
          <option value="Rear Only">{t("Rear Only")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
      <div style={{...formRowStyle, opacity: 0.5}}>
        <label htmlFor="adj-brakes">{t("Brakes")} <span style={{color: 'orange', fontSize: '0.7rem'}}>({t("Coming Soon")})</span></label>
        <select id="adj-brakes" value={carParams.adjustability.brakes || 'Fixed'} disabled style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
      <div style={{...formRowStyle, opacity: 0.5}}>
        <label htmlFor="adj-diff">{t("Differential")} <span style={{color: 'orange', fontSize: '0.7rem'}}>({t("Coming Soon")})</span></label>
        <select id="adj-diff" value={carParams.adjustability.diff || 'Fixed'} disabled style={inputStyle}>
          <option value="Fixed">{t("Fixed")}</option>
          <option value="Adjustable">{t("Adjustable")}</option>
        </select>
      </div>
    </div>
  );
};
