import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { AppliedTuningSetup } from '../../../utils/tuningDiagnosis';

export interface AppliedSetupTableProps {
  setup: AppliedTuningSetup;
  onChange: (field: keyof AppliedTuningSetup, value: number) => void;
  onReset: () => void;
  isAwd?: boolean;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  color: 'var(--input-text)',
  padding: '0.25rem 0.5rem',
  borderRadius: '4px',
  fontSize: '0.82rem',
  width: '80px',
  textAlign: 'right'
};

export function convertDisplayedSpringToCanonical(
  displayedVal: number,
  convertSpringRateToKgfmm: (val: number) => number
): number {
  const kgfmm = convertSpringRateToKgfmm(displayedVal);
  return Number(kgfmm.toFixed(2));
}

export function convertDisplayedHeightToCanonical(
  displayedVal: number,
  convertHeightToCm: (val: number) => number
): number {
  const cm = convertHeightToCm(displayedVal);
  return Number(cm.toFixed(2));
}

export const AppliedSetupTable: React.FC<AppliedSetupTableProps> = ({
  setup,
  onChange,
  onReset,
  isAwd = false
}) => {
  const {
    convertTirePressureFromPsi,
    convertTirePressureToPsi,
    convertSpringRate,
    convertSpringRateToKgfmm,
    convertHeight,
    convertHeightToCm,
    t
  } = useSettings();

  const displayedPressF = convertTirePressureFromPsi(setup.tirePressureFront);
  const displayedPressR = convertTirePressureFromPsi(setup.tirePressureRear);
  const displayedSpringF = convertSpringRate(setup.springsFront);
  const displayedSpringR = convertSpringRate(setup.springsRear);
  const displayedHeightF = convertHeight(setup.rideHeightFront);
  const displayedHeightR = convertHeight(setup.rideHeightRear);

  const handlePressureChange = (field: 'tirePressureFront' | 'tirePressureRear', displayedVal: number) => {
    const psi = convertTirePressureToPsi(displayedVal);
    onChange(field, Number(psi.toFixed(2)));
  };

  const handleSpringChange = (field: 'springsFront' | 'springsRear', displayedVal: number) => {
    const canonical = convertDisplayedSpringToCanonical(displayedVal, convertSpringRateToKgfmm);
    onChange(field, canonical);
  };

  const handleHeightChange = (field: 'rideHeightFront' | 'rideHeightRear', displayedVal: number) => {
    const canonical = convertDisplayedHeightToCanonical(displayedVal, convertHeightToCm);
    onChange(field, canonical);
  };

  return (
    <div
      className="glass-panel"
      style={{
        background: 'rgba(0,0,0,0.3)',
        padding: '1rem',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem'
      }}
    >
      {/* Table Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
        <div>
          <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.9rem' }}>
            {t("Current Applied Setup")}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
            ({t("Editable baseline for regression")})
          </span>
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          style={{ fontSize: '0.72rem', padding: '0.15rem 0.6rem' }}
          onClick={onReset}
          title={t("Reset all fields to initial wizard calculations")}
        >
          {t("Reset to Baseline")}
        </button>
      </div>

      {/* Grid: 4 Parameter Categories */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>

        {/* Category 1: Tires & Alignment */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#00b4d8' }}>
            1. {t("Tires & Alignment")}
          </span>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front Cold Pressure")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={displayedPressF.value.toFixed(1)}
                onChange={e => handlePressureChange('tirePressureFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front Cold Pressure")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>{displayedPressF.label}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Cold Pressure")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={displayedPressR.value.toFixed(1)}
                onChange={e => handlePressureChange('tirePressureRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Cold Pressure")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>{displayedPressR.label}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front Camber")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={setup.camberFront.toFixed(1)}
                onChange={e => onChange('camberFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front Camber")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>°</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Camber")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={setup.camberRear.toFixed(1)}
                onChange={e => onChange('camberRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Camber")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>°</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front Toe")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.05"
                value={setup.toeFront.toFixed(2)}
                onChange={e => onChange('toeFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front Toe")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>°</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Toe")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.05"
                value={setup.toeRear.toFixed(2)}
                onChange={e => onChange('toeRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Toe")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>°</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Caster")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={setup.caster.toFixed(1)}
                onChange={e => onChange('caster', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Caster")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>°</span>
            </div>
          </div>
        </div>

        {/* Category 2: Anti-Roll Bars & Springs */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}>
            2. {t("Anti-Roll Bars & Springs")}
          </span>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front ARB")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.5"
                value={setup.arbFront.toFixed(1)}
                onChange={e => onChange('arbFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front ARB")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}></span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear ARB")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.5"
                value={setup.arbRear.toFixed(1)}
                onChange={e => onChange('arbRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear ARB")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}></span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front Springs")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.5"
                value={displayedSpringF.value.toFixed(1)}
                onChange={e => handleSpringChange('springsFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front Springs")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>{displayedSpringF.label}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Springs")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.5"
                value={displayedSpringR.value.toFixed(1)}
                onChange={e => handleSpringChange('springsRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Springs")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>{displayedSpringR.label}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front Ride Height")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={displayedHeightF.value.toFixed(1)}
                onChange={e => handleHeightChange('rideHeightFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front Ride Height")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>{displayedHeightF.label}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Ride Height")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={displayedHeightR.value.toFixed(1)}
                onChange={e => handleHeightChange('rideHeightRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Ride Height")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>{displayedHeightR.label}</span>
            </div>
          </div>
        </div>

        {/* Category 3: Damping */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ffb703' }}>
            3. {t("Damping")}
          </span>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front Rebound")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={setup.reboundFront.toFixed(1)}
                onChange={e => onChange('reboundFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front Rebound")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}></span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Rebound")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={setup.reboundRear.toFixed(1)}
                onChange={e => onChange('reboundRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Rebound")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}></span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Front Bump")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={setup.bumpFront.toFixed(1)}
                onChange={e => onChange('bumpFront', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Front Bump")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}></span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Bump")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.1"
                value={setup.bumpRear.toFixed(1)}
                onChange={e => onChange('bumpRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Bump")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}></span>
            </div>
          </div>
        </div>

        {/* Category 4: Differential */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#00e676' }}>
            4. {t("Differential")}
          </span>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Accel")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="1"
                value={setup.diffAccelRear}
                onChange={e => onChange('diffAccelRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Accel")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>%</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Rear Decel")}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="number"
                step="1"
                value={setup.diffDecelRear}
                onChange={e => onChange('diffDecelRear', parseFloat(e.target.value) || 0)}
                style={inputStyle}
                aria-label={t("Rear Decel")}
              />
              <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>%</span>
            </div>
          </div>

          {isAwd && setup.diffCenterRear !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t("Center Balance (Rear %)")}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <input
                  type="number"
                  step="1"
                  value={setup.diffCenterRear}
                  onChange={e => onChange('diffCenterRear', parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                  aria-label={t("Center Balance")}
                />
                <span style={{ fontSize: '0.7rem', color: 'gray', minWidth: '24px' }}>%</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
