import React from 'react';
import { CarParams } from '../../../context/CarParamsContext';
import { formRowStyle, inputStyle } from './CommonStyles';

interface BasicCarInfoProps {
  t: (key: string) => string;
  settings: any;
  carParams: CarParams;
  updateParam: (field: keyof CarParams, value: any) => void;
  displayCarWeight: number;
  displayMaxHp: number;
  displayMaxTorque: number;
  handleWeightChange: (valStr: string) => void;
  handleMaxHpChange: (valStr: string) => void;
  handleMaxTorqueChange: (valStr: string) => void;
  getPowerLabel: () => string;
  getTorqueLabel: () => string;
}

export const BasicCarInfo: React.FC<BasicCarInfoProps> = ({
  t,
  settings,
  carParams,
  updateParam,
  displayCarWeight,
  displayMaxHp,
  displayMaxTorque,
  handleWeightChange,
  handleMaxHpChange,
  handleMaxTorqueChange,
  getPowerLabel,
  getTorqueLabel
}) => {
  return (
    <div>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>{t("Static Info")}</h3>
      <div style={formRowStyle}>
        <label htmlFor="weight">{t("Weight")} ({settings.units.weight})</label>
        <input id="weight" type="number" value={Math.round(displayCarWeight)} onChange={e => handleWeightChange(e.target.value)} style={inputStyle} />
      </div>
      <div style={formRowStyle}>
        <label htmlFor="front_weight">{t("Front Weight (%)")}</label>
        <input id="front_weight" type="number" value={carParams.weight_distribution} onChange={e => updateParam('weight_distribution', parseFloat(e.target.value))} style={inputStyle} step="0.1" />
      </div>
      <div style={formRowStyle}>
        <label htmlFor="drivetrain">{t("Drivetrain")}</label>
        <select id="drivetrain" value={carParams.drivetrain} onChange={e => updateParam('drivetrain', e.target.value)} style={inputStyle}>
          <option value="FWD">{t("FWD (Front Wheel Drive)")}</option>
          <option value="RWD">{t("RWD (Rear Wheel Drive)")}</option>
          <option value="AWD">{t("AWD (All Wheel Drive)")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label htmlFor="induction">{t("Induction")}</label>
        <select id="induction" value={carParams.induction} onChange={e => updateParam('induction', e.target.value)} style={inputStyle}>
          <option value="NA">{t("Naturally Aspirated (NA)")}</option>
          <option value="Supercharger">{t("Supercharger")}</option>
          <option value="Turbo">{t("Single Turbo")}</option>
          <option value="TwinTurbo">{t("Twin Turbo")}</option>
        </select>
      </div>
      <div style={formRowStyle}>
        <label htmlFor="max_hp">{t("Max HP")} ({getPowerLabel()})</label>
        <input id="max_hp" type="number" value={Math.round(displayMaxHp)} onChange={e => handleMaxHpChange(e.target.value)} style={inputStyle} step="10" />
      </div>
      <div style={formRowStyle}>
        <label htmlFor="max_hp_rpm">{t("Max HP RPM (rpm)")}</label>
        <input id="max_hp_rpm" type="number" value={carParams.maxHpRpm || 0} onChange={e => updateParam('maxHpRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
      </div>
      <div style={formRowStyle}>
        <label htmlFor="max_torque">{t("Max Torque")} ({getTorqueLabel()})</label>
        <input id="max_torque" type="number" value={Math.round(displayMaxTorque)} onChange={e => handleMaxTorqueChange(e.target.value)} style={inputStyle} step="10" />
      </div>
      <div style={formRowStyle}>
        <label htmlFor="max_torque_rpm">{t("Max Torque RPM (rpm)")}</label>
        <input id="max_torque_rpm" type="number" value={carParams.maxTorqueRpm || 0} onChange={e => updateParam('maxTorqueRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
      </div>
      
      <div style={formRowStyle}>
        <label htmlFor="front_tire_width">{t("Front Tire (mm/% R in)")}</label>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input id="front_tire_width" aria-label={t("Front Tire Width")} type="number" value={carParams.frontTireWidth || 245} onChange={e => updateParam('frontTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} placeholder="245" />
          <span style={{ color: 'gray' }}>/</span>
          <input aria-label={t("Front Tire Aspect Ratio")} type="number" value={carParams.frontTireAspect || 40} onChange={e => updateParam('frontTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="40" />
          <span style={{ color: 'gray' }}>{t("R")}</span>
          <input aria-label={t("Front Tire Rim Size")} type="number" value={carParams.frontTireRim || 18} onChange={e => updateParam('frontTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="18" />
        </div>
      </div>
      <div style={formRowStyle}>
        <label htmlFor="rear_tire_width">{t("Rear Tire (mm/% R in)")}</label>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input id="rear_tire_width" aria-label={t("Rear Tire Width")} type="number" value={carParams.rearTireWidth || 245} onChange={e => updateParam('rearTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '60px', padding: '0.25rem', textAlign: 'center' }} placeholder="245" />
          <span style={{ color: 'gray' }}>/</span>
          <input aria-label={t("Rear Tire Aspect Ratio")} type="number" value={carParams.rearTireAspect || 40} onChange={e => updateParam('rearTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="40" />
          <span style={{ color: 'gray' }}>{t("R")}</span>
          <input aria-label={t("Rear Tire Rim Size")} type="number" value={carParams.rearTireRim || 18} onChange={e => updateParam('rearTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} placeholder="18" />
        </div>
      </div>
      
      <h4 style={{ margin: '1rem 0 0.5rem 0', color: 'var(--text-secondary)' }}>{t("Assist Inputs")}</h4>
      <div style={formRowStyle}>
        <label htmlFor="aero_balance">{t("Aero Bal (0-1)")}</label>
        <input id="aero_balance" type="number" value={carParams.aeroBalance ?? 0.5} onChange={e => updateParam('aeroBalance', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
      </div>
      <div style={formRowStyle}>
        <label htmlFor="aero_efficiency">{t("Aero Eff (0-1)")}</label>
        <input id="aero_efficiency" type="number" value={carParams.aeroEfficiency ?? 0.5} onChange={e => updateParam('aeroEfficiency', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
      </div>
      <div style={formRowStyle}>
        <label htmlFor="mech_balance">{t("Mech Bal (0-1)")}</label>
        <input id="mech_balance" type="number" value={carParams.mechBalance ?? 0.5} onChange={e => updateParam('mechBalance', parseFloat(e.target.value))} style={inputStyle} step="0.01" min="0" max="1" />
      </div>
    </div>
  );
};
