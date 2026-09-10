import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';

import { Season } from '../../../utils/tuningMath';
import {
  displayPowerToProfile,
  displayTorqueToProfile,
  displayWeightToProfile,
  profilePowerToDisplay,
  profileTorqueToDisplay,
  profileWeightToDisplay,
} from '../../../utils/profileUnitConversions';

interface Step1GoalSetupProps {
  selectedRaceGoal: string;
  setSelectedRaceGoal: (goal: string) => void;
  season: Season;
  setSeason: (season: Season) => void;
  carParams: CarParams | null;
  updateParam: (field: keyof CarParams, value: any) => void;
  hasCoreParams: boolean;
  onOpenUnitSettings: () => void;
  onProceed: () => Promise<void>;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  color: 'var(--input-text)',
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
  season,
  setSeason,
  carParams,
  updateParam,
  hasCoreParams,
  onOpenUnitSettings,
  onProceed
}) => {
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'failed'>('idle');
  const handleProceed = async () => {
    setSaveState('saving');
    try {
      await onProceed();
      setSaveState('idle');
    } catch {
      setSaveState('failed');
    }
  };
  const {
    settings,
    convertSpringRate,
    convertSpringRateToKgfmm,
    convertHeight,
    convertHeightToCm,
    convertPower,
    convertTorque,
    convertTirePressureFromPsi,
    t
  } = useSettings();

  const displayPower = (hp: number) => ({
    value: profilePowerToDisplay(hp, settings.units),
    label: convertPower(0).label,
  });
  const seasonalPressure = convertTirePressureFromPsi(0.5);

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


  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
          Step 1: {t("Define tuning goals & check parameters")}
        </h3>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onOpenUnitSettings}>
            {t("Workflow Units")}
          </button>
          <span
            title={!hasCoreParams ? t("Please set basic vehicle parameters in Step 1 to proceed.") : undefined}
            tabIndex={!hasCoreParams ? 0 : undefined}
            role={!hasCoreParams ? "group" : undefined}
            aria-label={!hasCoreParams ? t("Please set basic vehicle parameters in Step 1 to proceed.") : undefined}
            style={{ display: 'inline-block', cursor: !hasCoreParams ? 'not-allowed' : 'auto' }}
          >
            <button type="button" className="btn btn-primary btn-sm fw-bold" disabled={!hasCoreParams || saveState === 'saving'} style={{ pointerEvents: !hasCoreParams ? 'none' : 'auto' }} onClick={() => void handleProceed()}>
              {t(saveState === 'saving' ? "Saving..." : "Save & prepare driving data")} &gt;
            </button>
          </span>
        </div>
      </div>

      {saveState === 'failed' && <div role="alert" className="text-danger">{t("Save failed.")}</div>}
      {/* Select Goal & Season Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(0, 180, 255, 0.05)', border: '1px solid rgba(0, 180, 255, 0.15)', padding: '1.2rem', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>{t("Select Race / Tuning Goal:")}</span>
            <select 
              value={selectedRaceGoal} 
              onChange={e => setSelectedRaceGoal(e.target.value)} 
              style={{ ...inputStyle, width: '200px', border: '1px solid var(--primary)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
            >
              <option value="Road">{t("Road / Circuit")}</option>
              <option value="Drift">{t("Drift")}</option>
              <option value="Rally">{t("Rally / Off-Road")}</option>
              <option value="Drag">{t("Drag")}</option>
            </select>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.4' }}>
            {selectedRaceGoal === 'Road' && t("Road / Circuit settings use mechanical chassis and gearing formulas. Aero inputs are excluded from this workflow.")}
            {selectedRaceGoal === 'Drift' && t("Drift mode configures extreme front-soft rear-stiff anti-roll bars, softened springs, and wheelspin-focused differential.")}
            {selectedRaceGoal === 'Rally' && t("Rally mode softens anti-roll bars and springs for max suspension travel, and increases ride height for off-road landings.")}
            {selectedRaceGoal === 'Drag' && t("Drag setting sets rake angle ride height, diagonal extreme damping, and 100% differential lock for maximum launch traction.")}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255, 183, 3, 0.05)', border: '1px solid rgba(255, 183, 3, 0.2)', padding: '1.2rem', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>{t("Current Season:")}</span>
            <select 
              value={season} 
              onChange={e => setSeason(e.target.value as Season)} 
              style={{ ...inputStyle, width: '200px', border: '1px solid #ffb703', background: 'var(--input-bg)', color: 'var(--input-text)' }}
            >
              <option value="Summer">{t("Summer")} (-{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
              <option value="Autumn">{t("Autumn")} (-{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
              <option value="Spring">{t("Spring")} (+{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
              <option value="Winter">{t("Winter")} (+{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
            </select>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.4' }}>
            {t("Game season directly affects ambient temperatures and tire pressure fermentation offsets, fitting into Step 4 static setup recommendations.")}
          </p>
        </div>
      </div>


      {/* Vehicle Parameters Form */}
      <div style={{ background: 'var(--surface-1)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
        <p className="small" style={{ color: 'var(--text-secondary)' }}>{t('Copy the weight, front weight percentage, power and torque shown for your current build. Confirm the installed tires and gearbox. Existing profile values may be defaults; they are not automatically read from the game.')}</p>
        <p className="small" style={{ color: 'var(--text-secondary)' }}>{t('You do not need to know peak RPM, target speed or aero efficiency. The next step guides you through collecting engine data before calculating a tune.')}</p>
        
        {/* Section 1: Core Physics & Drivetrain */}
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
          {t("Core Physics & Drivetrain")}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem 2rem', marginBottom: '1.2rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Weight")} ({settings.units.weight})</label>
            <input 
              type="number" 
              value={carParams?.weight ? profileWeightToDisplay(carParams.weight, settings.units) : ''}
              onChange={e => {
                const val = parseFloat(e.target.value) || 0;
                updateParam('weight', displayWeightToProfile(val, settings.units));
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

          {/* Induction Type parameter (affects powerband and turbo lag in Road/Drift) */}
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

        </div>

        {/* Section 2: Engine Power & Gearbox */}
        <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
          {t("Power Specs & Transmission")}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem 2rem', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Max Power")} ({displayPower(0).label})</label>
            <input type="number" value={profilePowerToDisplay(carParams?.maxHp || 0, settings.units)} onChange={e => updateParam('maxHp', displayPowerToProfile(parseFloat(e.target.value) || 0, settings.units))} style={{ ...inputStyle, width: '120px' }} step="any" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Max Torque")} ({convertTorque(0).label})</label>
            <input type="number" value={profileTorqueToDisplay(carParams?.maxTorque || 0, settings.units)} onChange={e => updateParam('maxTorque', displayTorqueToProfile(parseFloat(e.target.value) || 0, settings.units))} style={{ ...inputStyle, width: '120px' }} step="any" />
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

      </div>

      {!hasCoreParams && (
        <div style={{ padding: '0.8rem', background: 'rgba(255, 61, 0, 0.05)', border: '1px solid #ff3d00', borderRadius: '8px', color: '#ff3d00', fontSize: '0.85rem', textAlign: 'center' }}>
          {t("Tuning calculator requires valid vehicle weight and weight distribution parameters. Please fill them out above to unlock tuning wizard.")}
        </div>
      )}

    </div>
  );
};
