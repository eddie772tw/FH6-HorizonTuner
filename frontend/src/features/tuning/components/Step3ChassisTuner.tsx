import React, { useState, useEffect } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';
import { calculateChassisTuning, ChassisTuningResult } from '../../../utils/tuningMath';

interface Step3ChassisTunerProps {
  selectedRaceGoal: string;
  carParams: CarParams | null;
  saveCarParams: () => Promise<void>;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'white',
  padding: '0.3rem 0.5rem',
  borderRadius: '4px',
  width: '70px',
  textAlign: 'right',
  fontSize: '0.85rem'
};

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.2s ease'
};

export const Step3ChassisTuner: React.FC<Step3ChassisTunerProps> = ({
  selectedRaceGoal,
  carParams,
  saveCarParams
}) => {
  const { convertSpringRate, convertHeight, t } = useSettings();

  const [tuningResult, setTuningResult] = useState<ChassisTuningResult | null>(null);

  // Recalculate tuning whenever selectedRaceGoal or carParams changes
  useEffect(() => {
    if (carParams) {
      const res = calculateChassisTuning(selectedRaceGoal, carParams);
      setTuningResult(res);
    }
  }, [selectedRaceGoal, carParams]);

  if (!tuningResult || !carParams) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', color: 'gray' }}>
        {t("Please define basic vehicle parameters in Step 1 first.")}
      </div>
    );
  }

  const { arb, springs, damping, diff } = tuningResult;
  const drivetrain = carParams.drivetrain || 'RWD';

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
            Step 3: {t("Chassis & dynamic tuning recommendations")}
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {t("Calculated based on")} <strong>{selectedRaceGoal}</strong> {t("profile for")} <strong>{carParams.weight} kg ({carParams.weight_distribution}% F) {drivetrain}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={saveCarParams}
          style={{ ...btnStyle, background: 'var(--primary)', color: 'black', padding: '0.4rem 1.2rem', fontSize: '0.85rem' }}
        >
          {t("Save Setup")}
        </button>
      </div>

      {/* Grid of Tuning Recommendations Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
        
        {/* Card 1: Anti-Roll Bars (ARB) */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem' }}>{t("Anti-Roll Bars (ARB)")}</span>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Range: 1.0 - 65.0")}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front ARB")}</span>
            <input type="text" readOnly value={arb.front} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear ARB")}</span>
            <input type="text" readOnly value={arb.rear} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <p style={{ margin: 0, color: 'gray', fontSize: '0.75rem', lineHeight: '1.3' }}>
            {selectedRaceGoal === 'Drift' && t("Extreme front-soft (10.0) / rear-stiff (50.0) configuration for immediate rotation.")}
            {selectedRaceGoal === 'Road' && drivetrain === 'AWD' && t("AWD 1/65 Meta Strategy applied to minimize mid-corner understeer.")}
            {selectedRaceGoal === 'Rally' && t("Softened by 65% to allow independent wheel travel over terrain bumps.")}
            {selectedRaceGoal === 'Drag' && t("Front unconstrained (1.0) for max weight transfer to rear axles.")}
          </p>
        </div>

        {/* Card 2: Springs & Ride Height */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem' }}>{t("Springs & Ride Height")}</span>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{convertSpringRate(1).label} / {convertHeight(1).label}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Spring Stiffness")}</span>
            <input type="text" readOnly value={convertSpringRate(springs.front).value.toFixed(1)} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Spring Stiffness")}</span>
            <input type="text" readOnly value={convertSpringRate(springs.rear).value.toFixed(1)} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Ride Height")}</span>
            <input type="text" readOnly value={convertHeight(springs.heightF).value.toFixed(1)} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Ride Height")}</span>
            <input type="text" readOnly value={convertHeight(springs.heightR).value.toFixed(1)} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>
        </div>

        {/* Card 3: Damping System */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem' }}>{t("Damping System")}</span>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Rebound / Bump Ratio")}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Rebound Damping")}</span>
            <input type="text" readOnly value={damping.reboundF} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Rebound Damping")}</span>
            <input type="text" readOnly value={damping.reboundR} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Bump Damping")}</span>
            <input type="text" readOnly value={damping.bumpF} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Bump Damping")}</span>
            <input type="text" readOnly value={damping.bumpR} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
          </div>
        </div>

        {/* Card 4: Differential & Center Split */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem' }}>{t("Differential & Torque Split")}</span>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Lock %")}</span>
          </div>

          {(drivetrain === 'FWD' || drivetrain === 'AWD') && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Accel Lock")}</span>
                <input type="text" readOnly value={`${diff.accelF}%`} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Front Decel Lock")}</span>
                <input type="text" readOnly value={`${diff.decelF}%`} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
              </div>
            </>
          )}

          {(drivetrain === 'RWD' || drivetrain === 'AWD') && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Accel Lock")}</span>
                <input type="text" readOnly value={`${diff.accelR}%`} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Rear Decel Lock")}</span>
                <input type="text" readOnly value={`${diff.decelR}%`} style={{ ...inputStyle, border: '1px solid var(--primary)' }} />
              </div>
            </>
          )}

          {drivetrain === 'AWD' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{t("AWD Center Rear Split")}</span>
              <input type="text" readOnly value={`${diff.centerRear}% ${t("Rear")}`} style={{ ...inputStyle, border: '1px solid var(--primary)', width: '90px' }} />
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
