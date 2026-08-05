import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';

interface Step1GoalSetupProps {
  selectedRaceGoal: string;
  setSelectedRaceGoal: (goal: string) => void;
  carParams: CarParams | null;
  updateParam: (field: keyof CarParams, value: any) => void;
  saveCarParams: () => Promise<void>;
  hasCoreParams: boolean;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'white',
  padding: '0.4rem 0.6rem',
  borderRadius: '6px',
  fontSize: '0.9rem'
};

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.2s ease'
};

export const Step1GoalSetup: React.FC<Step1GoalSetupProps> = ({
  selectedRaceGoal,
  setSelectedRaceGoal,
  carParams,
  updateParam,
  saveCarParams,
  hasCoreParams
}) => {
  const { settings, convertSpringRate, convertSpringRateToKgfmm, convertHeight, convertHeightToCm, t } = useSettings();

  const applyDefaultLimits = () => {
    if (!carParams) return;
    updateParam('spring_front_min', 10.0);
    updateParam('spring_front_max', 120.0);
    updateParam('spring_rear_min', 10.0);
    updateParam('spring_rear_max', 120.0);
    updateParam('height_front_min', 10.0);
    updateParam('height_front_max', 25.0);
    updateParam('height_rear_min', 10.0);
    updateParam('height_rear_max', 25.0);
  };

  const isFrontAutoAero = (carParams?.aero_downforce_front ?? 0) <= 0;
  const isRearAutoAero = (carParams?.aero_downforce_rear ?? 0) <= 0;

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
        Step 1: {t("Define tuning goals & check parameters")}
      </h3>

      {/* Select Goal Card */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(0, 180, 255, 0.05)', border: '1px solid rgba(0, 180, 255, 0.15)', padding: '1.2rem', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>{t("Select Race / Tuning Goal:")}</span>
          <select 
            value={selectedRaceGoal} 
            onChange={e => setSelectedRaceGoal(e.target.value)} 
            style={{ ...inputStyle, width: '280px', border: '1px solid var(--primary)', background: 'black' }}
          >
            <option value="Road">{t("Road / Circuit")}</option>
            <option value="Drift">{t("Drift")}</option>
            <option value="Rally">{t("Rally / Off-Road")}</option>
            <option value="Drag">{t("Drag")}</option>
          </select>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.4' }}>
          {selectedRaceGoal === 'Road' && t("Road / Circuit setting optimizes chassis roll stability, aerodynamic downforce compensation, and gear ratio continuity.")}
          {selectedRaceGoal === 'Drift' && t("Drift mode configures extreme front-soft rear-stiff anti-roll bars, softened springs, and wheelspin-focused differential.")}
          {selectedRaceGoal === 'Rally' && t("Rally mode softens anti-roll bars and springs for max suspension travel, and increases ride height for off-road landings.")}
          {selectedRaceGoal === 'Drag' && t("Drag setting sets rake angle ride height, diagonal extreme damping, and 100% differential lock for maximum launch traction.")}
        </p>
      </div>

      {/* Vehicle Parameters Form */}
      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        
        {/* Section 1: Core Physics & Drivetrain */}
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
          {t("Core Physics & Drivetrain")}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem 2rem', marginBottom: '1.2rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Weight")} ({settings.units.weight})</label>
            <input 
              type="number" 
              value={carParams?.weight ? Math.round(settings.units.weight === 'lbs' ? carParams.weight * 2.2046 : carParams.weight) : ''} 
              onChange={e => {
                const val = parseFloat(e.target.value) || 0;
                updateParam('weight', settings.units.weight === 'lbs' ? val / 2.2046 : val);
              }} 
              style={{ ...inputStyle, width: '120px' }} 
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Weight Distribution")} (%)</label>
            <input 
              type="number" 
              value={carParams?.weight_distribution || ''} 
              onChange={e => updateParam('weight_distribution', parseFloat(e.target.value) || 0)} 
              style={{ ...inputStyle, width: '120px' }} 
              step="0.1" 
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Drivetrain")}</label>
            <select 
              value={carParams?.drivetrain || 'RWD'} 
              onChange={e => updateParam('drivetrain', e.target.value)} 
              style={{ ...inputStyle, width: '120px' }}
            >
              <option value="FWD">{t("FWD")}</option>
              <option value="RWD">{t("RWD")}</option>
              <option value="AWD">{t("AWD")}</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Tire Compound")}</label>
            <select 
              value={carParams?.tireType || 'Stock'} 
              onChange={e => updateParam('tireType', e.target.value)} 
              style={{ ...inputStyle, width: '120px' }}
            >
              <option value="Stock">{t("Stock")}</option>
              <option value="Street">{t("Street")}</option>
              <option value="Sport">{t("Sport")}</option>
              <option value="Semi-Slick">{t("Semi-Slick")}</option>
              <option value="Slick">{t("Slick")}</option>
              <option value="Rally">{t("Rally")}</option>
              <option value="Off-Road">{t("Off-Road")}</option>
              <option value="Snow">{t("Snow")}</option>
              <option value="Drag">{t("Drag")}</option>
              <option value="Drift">{t("Drift")}</option>
            </select>
          </div>

          {/* Dynamic parameter: Induction ONLY shown when RaceGoal === 'Drift' */}
          {selectedRaceGoal === 'Drift' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Induction Type")}</label>
              <select 
                value={carParams?.induction || 'NA'} 
                onChange={e => updateParam('induction', e.target.value)} 
                style={{ ...inputStyle, width: '120px' }}
              >
                <option value="NA">{t("Naturally Aspirated (NA)")}</option>
                <option value="Supercharger">{t("Supercharger")}</option>
                <option value="Turbo">{t("Single Turbo")}</option>
                <option value="TwinTurbo">{t("Twin Turbo")}</option>
              </select>
            </div>
          )}

        </div>

        {/* Dynamic Section: Mechanical & Aero Balance (Road / Circuit Only) */}
        {selectedRaceGoal === 'Road' && (
          <>
            <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
              {t("Mechanical & Aero Balance (AEGO Coefficients)")}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem 1.5rem', marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Mechanical Balance (Bm)")}</label>
                <input 
                  type="number" step="0.05" min="0.1" max="1.0" 
                  value={carParams?.mechBalance ?? 0.50} 
                  onChange={e => updateParam('mechBalance', parseFloat(e.target.value) || 0.50)} 
                  style={{ ...inputStyle, width: '70px', textAlign: 'center' }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Aero Balance (Ba)")}</label>
                <input 
                  type="number" step="0.05" min="0.1" max="1.0" 
                  value={carParams?.aeroBalance ?? 0.50} 
                  onChange={e => updateParam('aeroBalance', parseFloat(e.target.value) || 0.50)} 
                  style={{ ...inputStyle, width: '70px', textAlign: 'center' }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Aero Efficiency (E)")}</label>
                <input 
                  type="number" step="0.05" min="0.1" max="1.0" 
                  value={carParams?.aeroEfficiency ?? 0.50} 
                  onChange={e => updateParam('aeroEfficiency', parseFloat(e.target.value) || 0.50)} 
                  style={{ ...inputStyle, width: '70px', textAlign: 'center' }} 
                />
              </div>
            </div>
          </>
        )}

        {/* Section 2: Engine Power & Gearbox */}
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
          {t("Power Specs & Transmission")}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem 2rem', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Max HP")}</label>
            <input type="number" value={carParams?.maxHp || 0} onChange={e => updateParam('maxHp', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="10" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Max HP RPM (rpm)")}</label>
            <input type="number" value={carParams?.maxHpRpm || 0} onChange={e => updateParam('maxHpRpm', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="100" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Max Torque")}</label>
            <input type="number" value={carParams?.maxTorque || 0} onChange={e => updateParam('maxTorque', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="10" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Max Torque RPM (rpm)")}</label>
            <input type="number" value={carParams?.maxTorqueRpm || 0} onChange={e => updateParam('maxTorqueRpm', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '120px' }} step="100" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Gears Count")}</label>
            <input 
              type="number" 
              value={carParams?.adjustability?.gears || 6} 
              min={4} max={10} 
              onChange={e => updateParam('adjustability', { ...carParams?.adjustability, gears: parseInt(e.target.value) || 6 })} 
              style={{ ...inputStyle, width: '120px' }} 
            />
          </div>
        </div>

        {/* Section 3: Suspension & Ride Height Slider Range Limits */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', marginBottom: '0.8rem' }}>
          <h4 style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {t("Suspension Slider Limits (Race Upgrades)")}
          </h4>
          <button 
            type="button" 
            onClick={applyDefaultLimits} 
            style={{ ...btnStyle, background: 'rgba(255,255,255,0.08)', color: 'var(--primary)', padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
          >
            {t("Apply Race Defaults")}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem 2rem', marginBottom: '1.2rem' }}>
          {/* Front / Rear Spring Min / Max */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Spring Range")} ({convertSpringRate(1).label})</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input 
                type="number" step="0.1" 
                value={Number(convertSpringRate(carParams?.spring_front_min ?? 10.0).value.toFixed(1))} 
                onChange={e => updateParam('spring_front_min', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
              <span style={{ color: 'gray' }}>-</span>
              <input 
                type="number" step="0.1" 
                value={Number(convertSpringRate(carParams?.spring_front_max ?? 120.0).value.toFixed(1))} 
                onChange={e => updateParam('spring_front_max', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Spring Range")} ({convertSpringRate(1).label})</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input 
                type="number" step="0.1" 
                value={Number(convertSpringRate(carParams?.spring_rear_min ?? 10.0).value.toFixed(1))} 
                onChange={e => updateParam('spring_rear_min', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
              <span style={{ color: 'gray' }}>-</span>
              <input 
                type="number" step="0.1" 
                value={Number(convertSpringRate(carParams?.spring_rear_max ?? 120.0).value.toFixed(1))} 
                onChange={e => updateParam('spring_rear_max', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
            </div>
          </div>

          {/* Front / Rear Ride Height Min / Max */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Height Range")} ({convertHeight(1).label})</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input 
                type="number" step="0.1" 
                value={Number(convertHeight(carParams?.height_front_min ?? 10.0).value.toFixed(1))} 
                onChange={e => updateParam('height_front_min', convertHeightToCm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
              <span style={{ color: 'gray' }}>-</span>
              <input 
                type="number" step="0.1" 
                value={Number(convertHeight(carParams?.height_front_max ?? 25.0).value.toFixed(1))} 
                onChange={e => updateParam('height_front_max', convertHeightToCm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Height Range")} ({convertHeight(1).label})</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input 
                type="number" step="0.1" 
                value={Number(convertHeight(carParams?.height_rear_min ?? 10.0).value.toFixed(1))} 
                onChange={e => updateParam('height_rear_min', convertHeightToCm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
              <span style={{ color: 'gray' }}>-</span>
              <input 
                type="number" step="0.1" 
                value={Number(convertHeight(carParams?.height_rear_max ?? 25.0).value.toFixed(1))} 
                onChange={e => updateParam('height_rear_max', convertHeightToCm(parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '55px', padding: '0.2rem', textAlign: 'center' }} 
              />
            </div>
          </div>
        </div>

        {/* Section 4: Aerodynamic Downforce with Auto-Derivation Checkbox */}
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
          {t("Aerodynamic Downforce (kgf)")}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem 2rem', marginBottom: '0.5rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Downforce (kgf)")}</label>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input 
                type="number" 
                disabled={isFrontAutoAero} 
                value={isFrontAutoAero ? 0 : (carParams?.aero_downforce_front || 0)} 
                onChange={e => updateParam('aero_downforce_front', Math.max(0, parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '80px', opacity: isFrontAutoAero ? 0.5 : 1 }} 
              />
              <label style={{ fontSize: '0.78rem', color: 'gray', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={isFrontAutoAero} 
                  onChange={e => updateParam('aero_downforce_front', e.target.checked ? 0 : 50)} 
                />
                {t("Auto-Derive (0)")}
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Downforce (kgf)")}</label>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input 
                type="number" 
                disabled={isRearAutoAero} 
                value={isRearAutoAero ? 0 : (carParams?.aero_downforce_rear || 0)} 
                onChange={e => updateParam('aero_downforce_rear', Math.max(0, parseFloat(e.target.value) || 0))} 
                style={{ ...inputStyle, width: '80px', opacity: isRearAutoAero ? 0.5 : 1 }} 
              />
              <label style={{ fontSize: '0.78rem', color: 'gray', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={isRearAutoAero} 
                  onChange={e => updateParam('aero_downforce_rear', e.target.checked ? 0 : 50)} 
                />
                {t("Auto-Derive (0)")}
              </label>
            </div>
          </div>

        </div>
        <p style={{ margin: '0 0 1.2rem 0', color: 'gray', fontSize: '0.78rem', lineHeight: '1.3' }}>
          * {t("Checking 'Auto-Derive (0)' locks the value to 0. Step3 will automatically compute optimal downforce balance from vehicle weight distribution and drivetrain modifier.")}
        </p>

        {/* Section 5: Tire Dimensions */}
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
          {t("Tire Specifications")}
        </h4>
        <div style={{ display: 'flex', gap: '2.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Tire (mm / % R in)")}</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input type="number" value={carParams?.frontTireWidth || 245} onChange={e => updateParam('frontTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '55px', padding: '0.25rem', textAlign: 'center' }} />
              <span style={{ color: 'gray' }}>/</span>
              <input type="number" value={carParams?.frontTireAspect || 40} onChange={e => updateParam('frontTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
              <span style={{ color: 'gray' }}>R</span>
              <input type="number" value={carParams?.frontTireRim || 18} onChange={e => updateParam('frontTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Tire (mm / % R in)")}</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input type="number" value={carParams?.rearTireWidth || 245} onChange={e => updateParam('rearTireWidth', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '55px', padding: '0.25rem', textAlign: 'center' }} />
              <span style={{ color: 'gray' }}>/</span>
              <input type="number" value={carParams?.rearTireAspect || 40} onChange={e => updateParam('rearTireAspect', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
              <span style={{ color: 'gray' }}>R</span>
              <input type="number" value={carParams?.rearTireRim || 18} onChange={e => updateParam('rearTireRim', parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '45px', padding: '0.25rem', textAlign: 'center' }} />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            type="button"
            onClick={saveCarParams} 
            style={{ ...btnStyle, background: 'var(--primary)', color: 'black', padding: '0.5rem 1.4rem', fontSize: '0.9rem' }}
          >
            {t("Save Parameters")}
          </button>
        </div>

      </div>

      {!hasCoreParams && (
        <div style={{ padding: '0.8rem', background: 'rgba(255, 61, 0, 0.05)', border: '1px solid #ff3d00', borderRadius: '8px', color: '#ff3d00', fontSize: '0.85rem', textAlign: 'center' }}>
          {t("Tuning calculator requires valid vehicle weight and weight distribution parameters. Please fill them out above to unlock tuning wizard.")}
        </div>
      )}

    </div>
  );
};
