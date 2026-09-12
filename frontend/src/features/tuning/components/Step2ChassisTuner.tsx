import React, { useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';
import {
  ChassisTuningResult,
  StaticTireAlignResult,
  Season,
} from '../../../utils/tuningMath';

interface Step2ChassisTunerProps {
  selectedRaceGoal: string;
  season: Season;
  carParams: CarParams | null;
  chassis: ChassisTuningResult | null;
  alignment: StaticTireAlignResult | null;
  saveCarParams: () => Promise<void>;
}

export const Step2ChassisTuner: React.FC<Step2ChassisTunerProps> = ({
  selectedRaceGoal,
  season,
  carParams,
  chassis,
  alignment,
  saveCarParams,
}) => {
  const {
    settings,
    convertSpringRate,
    convertHeight,
    convertTirePressureFromPsi,
    t,
  } = useSettings();

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!carParams || !chassis || !alignment) {
    return (
      <div className="glass-panel p-4 text-center text-body-secondary">
        {t('Please define basic vehicle parameters in Step 1 first.')}
      </div>
    );
  }

  const { arb, springs, damping, diff } = chassis;
  const drivetrain = carParams.drivetrain || 'RWD';

  // Tire Pressure Formatting
  const pcFFormatted = convertTirePressureFromPsi(alignment.pcF);
  const pcRFormatted = convertTirePressureFromPsi(alignment.pcR);
  const targetHotFormatted = convertTirePressureFromPsi(alignment.targetPhot);
  const seasonBiasFormatted = convertTirePressureFromPsi(alignment.seasonBias);

  // Springs and Height Formatting
  const springFrontFormatted = convertSpringRate(springs.front);
  const springRearFormatted = convertSpringRate(springs.rear);
  const heightFrontFormatted = convertHeight(springs.heightF);
  const heightRearFormatted = convertHeight(springs.heightR);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCarParams();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const valueBadgeStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--glass-border)',
    color: 'var(--primary)',
    fontWeight: 700,
    fontSize: '0.9rem',
    padding: '0.3rem 0.6rem',
    borderRadius: '4px',
    textAlign: 'right',
    minWidth: '70px',
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Top Header Banner */}
      <div className="glass-panel p-3 d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <div>
          <h3 className="fs-5 text-primary fw-bold mb-1">
            Step 2: {t('Chassis, suspension & tire recommendations')}
          </h3>
          <span className="text-body-secondary fs-7">
            {t('Calculated based on')}{' '}
            <span className="text-primary fw-semibold">{selectedRaceGoal}</span> {t('profile for')}{' '}
            <strong>
              {settings.units.weight === 'lbs'
                ? Math.round(carParams.weight * 2.20462)
                : Math.round(carParams.weight)}{' '}
              {settings.units.weight} ({carParams.weight_distribution}% F) {drivetrain}
            </strong>{' '}
            ({t('Season')}: {season})
          </span>
        </div>

        <div className="d-flex align-items-center gap-2">
          {savedSuccess && (
            <span className="badge text-bg-success py-1 px-2 fs-8">
              {t('Saved')}
            </span>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="btn btn-primary btn-sm fw-bold px-3"
          >
            {saving ? t('Saving...') : t('Save Setup')}
          </button>
        </div>
      </div>

      {/* Three-Column Unified Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {/* Column 1: Tires & Wheel Alignment */}
        <div className="glass-panel p-3 d-flex flex-column gap-3">
          <div className="border-bottom pb-2 d-flex justify-content-between align-items-center">
            <span className="text-primary fw-bold fs-6">{t('Tires & Wheel Alignment')}</span>
            <span className="badge text-bg-info">{carParams.tireType || 'Stock'}</span>
          </div>

          {/* Tire Pressures */}
          <div className="d-flex flex-column gap-2">
            <div className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>
              {t('Tire Pressures')}
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Front Cold Pressure')}</span>
              <span style={valueBadgeStyle}>
                {pcFFormatted.value.toFixed(2)} {pcFFormatted.label}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Rear Cold Pressure')}</span>
              <span style={valueBadgeStyle}>
                {pcRFormatted.value.toFixed(2)} {pcRFormatted.label}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Target Hot Pressure')}</span>
              <span style={{ ...valueBadgeStyle, color: 'var(--bs-success)' }}>
                {targetHotFormatted.value.toFixed(1)} {targetHotFormatted.label}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Season Pressure Bias')}</span>
              <span style={{ ...valueBadgeStyle, color: 'var(--bs-warning)' }}>
                {seasonBiasFormatted.value >= 0 ? '+' : ''}
                {seasonBiasFormatted.value.toFixed(2)} {seasonBiasFormatted.label}
              </span>
            </div>
          </div>

          <hr className="my-1 opacity-25" />

          {/* Alignment Geometry */}
          <div className="d-flex flex-column gap-2">
            <div className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>
              {t('Wheel Alignment')}
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Camber (Front / Rear)')}</span>
              <span style={valueBadgeStyle}>
                {alignment.camber.front}° / {alignment.camber.rear}°
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Toe (Front / Rear)')}</span>
              <span style={valueBadgeStyle}>
                {alignment.toe.front}° / {alignment.toe.rear}°
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Caster Angle')}</span>
              <span style={valueBadgeStyle}>{alignment.caster}°</span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Sidewall (Front / Rear)')}</span>
              <span className="text-body-secondary fs-8">
                {alignment.hwF} mm / {alignment.hwR} mm
              </span>
            </div>
          </div>

          <div className="mt-auto p-2 rounded bg-body-tertiary border fs-8 text-body-secondary" style={{ lineHeight: '1.4' }}>
            {t('Data Out does not report tire pressure. Apply cold pressure in tuning menu and verify temperature build-up during hot laps.')}
          </div>
        </div>

        {/* Column 2: Suspension Platform */}
        <div className="glass-panel p-3 d-flex flex-column gap-3">
          <div className="border-bottom pb-2 d-flex justify-content-between align-items-center">
            <span className="text-primary fw-bold fs-6">{t('Suspension Platform')}</span>
            <span className="badge text-bg-secondary">{t('ARB & Springs')}</span>
          </div>

          {/* Anti-Roll Bars */}
          <div className="d-flex flex-column gap-2">
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>
                {t('Anti-Roll Bars (ARB)')}
              </span>
              <span className="fs-8 text-body-secondary">1.0 - 65.0</span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Front ARB')}</span>
              <span style={valueBadgeStyle}>{arb.front.toFixed(1)}</span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Rear ARB')}</span>
              <span style={valueBadgeStyle}>{arb.rear.toFixed(1)}</span>
            </div>

            <div className="p-2 rounded bg-body-tertiary border fs-8 text-body-secondary" style={{ lineHeight: '1.3' }}>
              {selectedRaceGoal === 'Drift' &&
                t('Extreme front-soft (10.0) / rear-stiff (50.0) configuration for immediate rotation.')}
              {selectedRaceGoal === 'Road' && drivetrain === 'AWD' &&
                t('AWD 1/65 Meta Strategy applied to minimize mid-corner understeer.')}
              {selectedRaceGoal === 'Rally' &&
                t('Softened by 65% to allow independent wheel travel over terrain bumps.')}
              {selectedRaceGoal === 'Drag' &&
                t('Front unconstrained (1.0) for max weight transfer to rear axles.')}
              {selectedRaceGoal === 'Road' && drivetrain !== 'AWD' &&
                t('Balanced distribution based on front weight percentage to ensure progressive breakaway.')}
            </div>
          </div>

          <hr className="my-1 opacity-25" />

          {/* Springs and Ride Height */}
          <div className="d-flex flex-column gap-2">
            <div className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>
              {t('Springs & Ride Height')}
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Front Spring')}</span>
              <span style={valueBadgeStyle}>
                {springFrontFormatted.value.toFixed(1)} {springFrontFormatted.label}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Rear Spring')}</span>
              <span style={valueBadgeStyle}>
                {springRearFormatted.value.toFixed(1)} {springRearFormatted.label}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Front Ride Height')}</span>
              <span style={valueBadgeStyle}>
                {heightFrontFormatted.value.toFixed(1)} {heightFrontFormatted.label}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Rear Ride Height')}</span>
              <span style={valueBadgeStyle}>
                {heightRearFormatted.value.toFixed(1)} {heightRearFormatted.label}
              </span>
            </div>
          </div>

          <div className="mt-auto p-2 rounded bg-body-tertiary border fs-8 text-body-secondary" style={{ lineHeight: '1.4' }}>
            {t('Recheck ride height after tire compound upgrade. Lower center of gravity reduces lateral load transfer.')}
          </div>
        </div>

        {/* Column 3: Damping & Differential */}
        <div className="glass-panel p-3 d-flex flex-column gap-3">
          <div className="border-bottom pb-2 d-flex justify-content-between align-items-center">
            <span className="text-primary fw-bold fs-6">{t('Damping & Differential')}</span>
            <span className="badge text-bg-warning">{drivetrain}</span>
          </div>

          {/* Damping System */}
          <div className="d-flex flex-column gap-2">
            <div className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>
              {t('Damping System')}
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Front Rebound Damping')}</span>
              <span style={valueBadgeStyle}>{damping.reboundF.toFixed(1)}</span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Rear Rebound Damping')}</span>
              <span style={valueBadgeStyle}>{damping.reboundR.toFixed(1)}</span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Front Bump Damping')}</span>
              <span style={valueBadgeStyle}>{damping.bumpF.toFixed(1)}</span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span className="text-body-secondary fs-7">{t('Rear Bump Damping')}</span>
              <span style={valueBadgeStyle}>{damping.bumpR.toFixed(1)}</span>
            </div>
          </div>

          <hr className="my-1 opacity-25" />

          {/* Differential */}
          <div className="d-flex flex-column gap-2">
            <div className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>
              {t('Differential & Power Split')}
            </div>

            {(drivetrain === 'FWD' || drivetrain === 'AWD') && (
              <>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-body-secondary fs-7">{t('Front Accel Lock')}</span>
                  <span style={valueBadgeStyle}>{diff.accelF}%</span>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-body-secondary fs-7">{t('Front Decel Lock')}</span>
                  <span style={valueBadgeStyle}>{diff.decelF}%</span>
                </div>
              </>
            )}

            {(drivetrain === 'RWD' || drivetrain === 'AWD') && (
              <>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-body-secondary fs-7">{t('Rear Accel Lock')}</span>
                  <span style={valueBadgeStyle}>{diff.accelR}%</span>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-body-secondary fs-7">{t('Rear Decel Lock')}</span>
                  <span style={valueBadgeStyle}>{diff.decelR}%</span>
                </div>
              </>
            )}

            {drivetrain === 'AWD' && (
              <div className="d-flex justify-content-between align-items-center pt-1">
                <span className="text-primary fw-semibold fs-7">{t('Center Rear Split')}</span>
                <span style={{ ...valueBadgeStyle, color: 'var(--primary)' }}>
                  {diff.centerRear}% {t('Rear')}
                </span>
              </div>
            )}
          </div>

          <div className="mt-auto p-2 rounded bg-body-tertiary border fs-8 text-body-secondary" style={{ lineHeight: '1.4' }}>
            {t('Differential locking prevents inside wheel spin on exit. Adjust deceleration lock if entry stability is affected.')}
          </div>
        </div>
      </div>
    </div>
  );
};
