import React from 'react';
import { CarParams } from '../../../context/CarParamsContext';

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
    <div className="d-flex flex-column gap-3">
      <h4 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Static Info")}</h4>
      
      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="weight" className="form-label mb-0 fs-7">{t("Weight")} ({settings.units.weight})</label>
        <input id="weight" type="number" value={Math.round(displayCarWeight)} onChange={e => handleWeightChange(e.target.value)} className="form-control form-control-sm" style={{ width: '170px' }} />
      </div>
      
      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="front_weight" className="form-label mb-0 fs-7">{t("Front Weight (%)")}</label>
        <input id="front_weight" type="number" value={carParams.weight_distribution} onChange={e => updateParam('weight_distribution', parseFloat(e.target.value))} className="form-control form-control-sm" style={{ width: '170px' }} step="0.1" />
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="drivetrain" className="form-label mb-0 fs-7">{t("Drivetrain")}</label>
        <select id="drivetrain" value={carParams.drivetrain} onChange={e => updateParam('drivetrain', e.target.value)} className="form-select form-select-sm" style={{ width: '170px' }}>
          <option value="FWD">{t("FWD (Front Wheel Drive)")}</option>
          <option value="RWD">{t("RWD (Rear Wheel Drive)")}</option>
          <option value="AWD">{t("AWD (All Wheel Drive)")}</option>
        </select>
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="induction" className="form-label mb-0 fs-7">{t("Induction")}</label>
        <select id="induction" value={carParams.induction} onChange={e => updateParam('induction', e.target.value)} className="form-select form-select-sm" style={{ width: '170px' }}>
          <option value="NA">{t("Naturally Aspirated (NA)")}</option>
          <option value="Supercharger">{t("Supercharger")}</option>
          <option value="Turbo">{t("Single Turbo")}</option>
          <option value="TwinTurbo">{t("Twin Turbo")}</option>
        </select>
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="max_hp" className="form-label mb-0 fs-7">{t("Max HP")} ({getPowerLabel()})</label>
        <input id="max_hp" type="number" value={Math.round(displayMaxHp)} onChange={e => handleMaxHpChange(e.target.value)} className="form-control form-control-sm" style={{ width: '170px' }} step="10" />
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="max_hp_rpm" className="form-label mb-0 fs-7">{t("Max HP RPM (rpm)")}</label>
        <input id="max_hp_rpm" type="number" value={carParams.maxHpRpm || 0} onChange={e => updateParam('maxHpRpm', parseInt(e.target.value))} className="form-control form-control-sm" style={{ width: '170px' }} step="100" />
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="max_torque" className="form-label mb-0 fs-7">{t("Max Torque")} ({getTorqueLabel()})</label>
        <input id="max_torque" type="number" value={Math.round(displayMaxTorque)} onChange={e => handleMaxTorqueChange(e.target.value)} className="form-control form-control-sm" style={{ width: '170px' }} step="10" />
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="max_torque_rpm" className="form-label mb-0 fs-7">{t("Max Torque RPM (rpm)")}</label>
        <input id="max_torque_rpm" type="number" value={carParams.maxTorqueRpm || 0} onChange={e => updateParam('maxTorqueRpm', parseInt(e.target.value))} className="form-control form-control-sm" style={{ width: '170px' }} step="100" />
      </div>
      
      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="front_tire_width" className="form-label mb-0 fs-7">{t("Front Tire (mm/% R in)")}</label>
        <div className="input-group input-group-sm" style={{ width: '170px' }}>
          <input id="front_tire_width" aria-label={t("Front Tire Width")} type="number" value={carParams.frontTireWidth || 245} onChange={e => updateParam('frontTireWidth', parseInt(e.target.value) || 0)} className="form-control text-center px-1" placeholder="245" />
          <span className="input-group-text px-1">/</span>
          <input aria-label={t("Front Tire Aspect Ratio")} type="number" value={carParams.frontTireAspect || 40} onChange={e => updateParam('frontTireAspect', parseInt(e.target.value) || 0)} className="form-control text-center px-1" placeholder="40" />
          <span className="input-group-text px-1">R</span>
          <input aria-label={t("Front Tire Rim Size")} type="number" value={carParams.frontTireRim || 18} onChange={e => updateParam('frontTireRim', parseInt(e.target.value) || 0)} className="form-control text-center px-1" placeholder="18" />
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="rear_tire_width" className="form-label mb-0 fs-7">{t("Rear Tire (mm/% R in)")}</label>
        <div className="input-group input-group-sm" style={{ width: '170px' }}>
          <input id="rear_tire_width" aria-label={t("Rear Tire Width")} type="number" value={carParams.rearTireWidth || 245} onChange={e => updateParam('rearTireWidth', parseInt(e.target.value) || 0)} className="form-control text-center px-1" placeholder="245" />
          <span className="input-group-text px-1">/</span>
          <input aria-label={t("Rear Tire Aspect Ratio")} type="number" value={carParams.rearTireAspect || 40} onChange={e => updateParam('rearTireAspect', parseInt(e.target.value) || 0)} className="form-control text-center px-1" placeholder="40" />
          <span className="input-group-text px-1">R</span>
          <input aria-label={t("Rear Tire Rim Size")} type="number" value={carParams.rearTireRim || 18} onChange={e => updateParam('rearTireRim', parseInt(e.target.value) || 0)} className="form-control text-center px-1" placeholder="18" />
        </div>
      </div>
      
      <h5 className="text-secondary fs-7 fw-bold mt-2 mb-0">{t("Assist Inputs")}</h5>
      <div className="d-flex justify-content-between align-items-center">
        <label htmlFor="aero_efficiency" className="form-label mb-0 fs-7">{t("Aero Eff (0-1)")}</label>
        <input id="aero_efficiency" type="number" value={carParams.aeroEfficiency ?? 0.5} onChange={e => updateParam('aeroEfficiency', parseFloat(e.target.value))} className="form-control form-control-sm" style={{ width: '170px' }} step="0.01" min="0" max="1" />
      </div>
    </div>
  );
};

