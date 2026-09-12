import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';
import { Season } from '../../../utils/tuningMath';
import { DecimalInput } from '../../../components/common/DecimalInput';
import { RallyProfileSetup } from './RallyProfileSetup';

interface Step1GoalSetupProps {
  measuredEngineInputs?: boolean;
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

export const Step1GoalSetup: React.FC<Step1GoalSetupProps> = ({
  measuredEngineInputs = false,
  selectedRaceGoal,
  setSelectedRaceGoal,
  season,
  setSeason,
  carParams,
  updateParam,
  hasCoreParams,
  onOpenUnitSettings,
  onProceed,
}) => {
  const {
    settings,
    convertSpringRate,
    convertSpringRateToKgfmm,
    convertHeight,
    convertHeightToCm,
    convertForce,
    convertForceToKgf,
    convertPower,
    convertTorque,
    convertTirePressureFromPsi,
    t,
  } = useSettings();

  const displayPower = (hp: number) => convertPower(hp * 745.7);
  const powerToHp = (value: number) =>
    settings.units.power === 'kw'
      ? value / 0.7457
      : settings.units.power === 'ps'
      ? value / 1.01387
      : value;
  const torqueToNm = (value: number) =>
    settings.units.torque === 'lbft' ? value / 0.73756 : value;
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

  const isFrontAutoAero = (carParams?.aero_downforce_front ?? 0) <= 0;
  const isRearAutoAero = (carParams?.aero_downforce_rear ?? 0) <= 0;

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    fontSize: '0.85rem',
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Top Banner Toolbar */}
      <div className="glass-panel p-3 d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <div>
          <h3 className="fs-5 text-primary fw-bold mb-1">
            Step 1: {t('Define tuning goals & check parameters')}
          </h3>
          <span className="text-body-secondary fs-7">
            {t('Configure tuning objective, core powertrain specifications, and chassis geometry boundaries')}
          </span>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <button type="button" className="btn btn-outline-secondary btn-sm fw-semibold" onClick={onOpenUnitSettings}>
            {t('Workflow Units')}
          </button>
          <span
            title={!hasCoreParams ? t('Please set basic vehicle parameters in Step 1 to proceed.') : undefined}
            tabIndex={!hasCoreParams ? 0 : undefined}
            role={!hasCoreParams ? 'group' : undefined}
            aria-label={!hasCoreParams ? t('Please set basic vehicle parameters in Step 1 to proceed.') : undefined}
            style={{ display: 'inline-block', cursor: !hasCoreParams ? 'not-allowed' : 'auto' }}
          >
            <button
              type="button"
              className="btn btn-primary btn-sm fw-bold"
              disabled={!hasCoreParams}
              style={{ pointerEvents: !hasCoreParams ? 'none' : 'auto' }}
              onClick={() => void onProceed()}
            >
              {t('Save & Proceed')} &gt;
            </button>
          </span>
        </div>
      </div>

      {!hasCoreParams && (
        <div className="alert alert-warning py-2 px-3 mb-0 fs-7" role="alert">
          {t('Tuning calculator requires valid vehicle weight and weight distribution parameters. Please fill them out below to unlock tuning wizard.')}
        </div>
      )}

      {/* Three-Column Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {/* Column 1: Goal & Environment */}
        <div className="glass-panel p-3 d-flex flex-column gap-3">
          <div className="border-bottom pb-2 d-flex justify-content-between align-items-center">
            <span className="text-primary fw-bold fs-6">{t('Goal & Environment')}</span>
            <span className="badge text-bg-primary">{t('Setup Prior')}</span>
          </div>

          <div className="d-flex flex-column gap-2">
            <label className="text-body-secondary fs-7 fw-semibold">{t('Select Race / Tuning Goal:')}</label>
            <select
              value={selectedRaceGoal}
              onChange={(e) => setSelectedRaceGoal(e.target.value)}
              className="form-select form-select-sm"
              style={selectStyle}
            >
              <option value="Road">{t('Road / Circuit')}</option>
              <option value="Drift">{t('Drift')}</option>
              <option value="Rally">{t('Rally / Off-Road')}</option>
              <option value="Drag">{t('Drag')}</option>
            </select>
            <div className="p-2 rounded bg-body-tertiary border fs-8 text-body-secondary" style={{ lineHeight: '1.4' }}>
              {selectedRaceGoal === 'Road' &&
                t('Road / Circuit setting optimizes chassis roll stability, aerodynamic downforce compensation, and gear ratio continuity.')}
              {selectedRaceGoal === 'Drift' &&
                t('Drift mode configures extreme front-soft rear-stiff anti-roll bars, softened springs, and wheelspin-focused differential.')}
              {selectedRaceGoal === 'Rally' &&
                t('Rally mode softens anti-roll bars and springs for max suspension travel, and increases ride height for off-road landings.')}
              {selectedRaceGoal === 'Drag' &&
                t('Drag setting sets rake angle ride height, diagonal extreme damping, and 100% differential lock for maximum launch traction.')}
            </div>
            {selectedRaceGoal === 'Rally' && <RallyProfileSetup value={carParams?.rallyProfile} onChange={value => updateParam('rallyProfile', value)} />}
          </div>

          <div className="d-flex flex-column gap-2">
            <label className="text-body-secondary fs-7 fw-semibold">{t('Current Season:')}</label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value as Season)}
              className="form-select form-select-sm"
              style={selectStyle}
            >
              <option value="Summer">{t('Summer')} (-{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
              <option value="Autumn">{t('Autumn')} (-{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
              <option value="Spring">{t('Spring')} (+{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
              <option value="Winter">{t('Winter')} (+{seasonalPressure.value.toFixed(2)} {seasonalPressure.label})</option>
            </select>
            <div className="p-2 rounded bg-body-tertiary border fs-8 text-body-secondary" style={{ lineHeight: '1.4' }}>
              {t(
                measuredEngineInputs
                  ? 'Seasonal pressure adjustments are estimates for the tire baseline. Confirm actual cold and hot pressures in game.'
                  : 'Game season directly affects ambient temperatures and tire pressure fermentation offsets, fitting into Step 2 static setup recommendations.'
              )}
            </div>
          </div>

          {selectedRaceGoal === 'Road' && (
            <div className="p-2 rounded border bg-body-tertiary d-flex justify-content-between align-items-center">
              <div>
                <div className="fs-7 fw-semibold text-primary">{t('Aero Efficiency (E)')}</div>
                <div className="fs-8 text-body-secondary">{t('(Circuit top speed aero drag scaling)')}</div>
              </div>
              <div style={{ width: '90px' }}>
                <DecimalInput
                  value={carParams?.aeroEfficiency ?? 0.5}
                  onChange={(val) => updateParam('aeroEfficiency', val ?? 0.5)}
                  precision={2}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                />
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Powertrain & Drivetrain */}
        <div className="glass-panel p-3 d-flex flex-column gap-3">
          <div className="border-bottom pb-2 d-flex justify-content-between align-items-center">
            <span className="text-primary fw-bold fs-6">{t('Core Physics & Drivetrain')}</span>
            <span className="badge text-bg-secondary">{t('Vehicle Specs')}</span>
          </div>

          <div className="d-flex flex-column gap-2">
            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-7 mb-0">{t('Weight')} ({settings.units.weight})</label>
              <div style={{ width: '130px' }}>
                <DecimalInput
                  value={carParams?.weight ? (settings.units.weight === 'lbs' ? carParams.weight * 2.20462 : carParams.weight) : undefined}
                  onChange={(val) => updateParam('weight', val !== undefined ? (settings.units.weight === 'lbs' ? val / 2.20462 : val) : 0)}
                  precision={0}
                  min={200}
                  max={10000}
                  placeholder="e.g. 1350"
                />
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-7 mb-0">{t('Weight Distribution')} (%)</label>
              <div style={{ width: '130px' }}>
                <DecimalInput
                  value={carParams?.weight_distribution}
                  onChange={(val) => updateParam('weight_distribution', val ?? 50)}
                  precision={1}
                  min={1}
                  max={99}
                  placeholder="e.g. 52.0"
                />
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-7 mb-0">{t('Drivetrain')}</label>
              <div style={{ width: '130px' }}>
                <select
                  value={carParams?.drivetrain || 'RWD'}
                  onChange={(e) => updateParam('drivetrain', e.target.value)}
                  className="form-select form-select-sm"
                  style={selectStyle}
                >
                  <option value="FWD">{t('FWD')}</option>
                  <option value="RWD">{t('RWD')}</option>
                  <option value="AWD">{t('AWD')}</option>
                </select>
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-7 mb-0">{t('Gears Count')}</label>
              <div style={{ width: '130px' }}>
                <DecimalInput
                  value={carParams?.adjustability?.gears || 6}
                  onChange={(val) => updateParam('adjustability', { ...carParams?.adjustability, gears: val ? Math.round(val) : 6 })}
                  precision={0}
                  min={4}
                  max={10}
                />
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-7 mb-0">{t('Induction Type')}</label>
              <div style={{ width: '130px' }}>
                <select
                  value={carParams?.induction || 'NA'}
                  onChange={(e) => updateParam('induction', e.target.value)}
                  className="form-select form-select-sm"
                  style={selectStyle}
                >
                  <option value="NA">{t('NA')}</option>
                  <option value="Supercharger">{t('Supercharger')}</option>
                  <option value="Turbo">{t('Single Turbo')}</option>
                  <option value="TwinTurbo">{t('Twin Turbo')}</option>
                </select>
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-7 mb-0">{t('Max Power')} ({displayPower(0).label})</label>
              <div style={{ width: '130px' }}>
                <DecimalInput
                  value={carParams?.maxHp ? displayPower(carParams.maxHp).value : undefined}
                  onChange={(val) => updateParam('maxHp', val !== undefined ? powerToHp(val) : 0)}
                  precision={0}
                  min={10}
                  max={3000}
                  placeholder="e.g. 450"
                />
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-7 mb-0">{t('Max Torque')} ({convertTorque(0).label})</label>
              <div style={{ width: '130px' }}>
                <DecimalInput
                  value={carParams?.maxTorque ? convertTorque(carParams.maxTorque).value : undefined}
                  onChange={(val) => updateParam('maxTorque', val !== undefined ? torqueToNm(val) : 0)}
                  precision={0}
                  min={10}
                  max={3000}
                  placeholder="e.g. 520"
                />
              </div>
            </div>

            {!measuredEngineInputs && (
              <>
                <div className="d-flex justify-content-between align-items-center">
                  <label className="text-body-secondary fs-7 mb-0">{t('Max HP RPM (rpm)')}</label>
                  <div style={{ width: '130px' }}>
                    <DecimalInput
                      value={carParams?.maxHpRpm || 0}
                      onChange={(val) => updateParam('maxHpRpm', val ? Math.round(val) : 0)}
                      precision={0}
                      step={100}
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center">
                  <label className="text-body-secondary fs-7 mb-0">{t('Max Torque RPM (rpm)')}</label>
                  <div style={{ width: '130px' }}>
                    <DecimalInput
                      value={carParams?.maxTorqueRpm || 0}
                      onChange={(val) => updateParam('maxTorqueRpm', val ? Math.round(val) : 0)}
                      precision={0}
                      step={100}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {measuredEngineInputs && (
            <div className="mt-auto p-2 rounded bg-body-tertiary border fs-8 text-body-secondary" style={{ lineHeight: '1.4' }}>
              {t('Engine limit and peak output RPM will be collected via live telemetry in Step 3. Enter only the power and torque shown in game here.')}
            </div>
          )}
        </div>

        {/* Column 3: Chassis Limits & Tires */}
        <div className="glass-panel p-3 d-flex flex-column gap-3">
          <div className="border-bottom pb-2 d-flex justify-content-between align-items-center">
            <span className="text-primary fw-bold fs-6">{t('Suspension & Tires')}</span>
            <button
              type="button"
              onClick={applyDefaultLimits}
              className="btn btn-outline-primary btn-sm py-0 px-2 fw-semibold fs-8"
            >
              {t('Apply Race Defaults')}
            </button>
          </div>

          <div className="d-flex flex-column gap-2">
            {/* Front Spring Range */}
            <div>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="text-body-secondary fs-8 mb-0">{t('Front Spring Range')} ({convertSpringRate(1).label})</label>
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.spring_front_min !== undefined ? convertSpringRate(carParams.spring_front_min).value : undefined}
                    onChange={(val) => updateParam('spring_front_min', val !== undefined ? convertSpringRateToKgfmm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Min')}
                  />
                </div>
                <span className="text-body-secondary fs-7">-</span>
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.spring_front_max !== undefined ? convertSpringRate(carParams.spring_front_max).value : undefined}
                    onChange={(val) => updateParam('spring_front_max', val !== undefined ? convertSpringRateToKgfmm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Max')}
                  />
                </div>
              </div>
            </div>

            {/* Rear Spring Range */}
            <div>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="text-body-secondary fs-8 mb-0">{t('Rear Spring Range')} ({convertSpringRate(1).label})</label>
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.spring_rear_min !== undefined ? convertSpringRate(carParams.spring_rear_min).value : undefined}
                    onChange={(val) => updateParam('spring_rear_min', val !== undefined ? convertSpringRateToKgfmm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Min')}
                  />
                </div>
                <span className="text-body-secondary fs-7">-</span>
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.spring_rear_max !== undefined ? convertSpringRate(carParams.spring_rear_max).value : undefined}
                    onChange={(val) => updateParam('spring_rear_max', val !== undefined ? convertSpringRateToKgfmm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Max')}
                  />
                </div>
              </div>
            </div>

            {/* Front Height Range */}
            <div>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="text-body-secondary fs-8 mb-0">{t('Front Height Range')} ({convertHeight(1).label})</label>
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.height_front_min !== undefined ? convertHeight(carParams.height_front_min).value : undefined}
                    onChange={(val) => updateParam('height_front_min', val !== undefined ? convertHeightToCm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Min')}
                  />
                </div>
                <span className="text-body-secondary fs-7">-</span>
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.height_front_max !== undefined ? convertHeight(carParams.height_front_max).value : undefined}
                    onChange={(val) => updateParam('height_front_max', val !== undefined ? convertHeightToCm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Max')}
                  />
                </div>
              </div>
            </div>

            {/* Rear Height Range */}
            <div>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="text-body-secondary fs-8 mb-0">{t('Rear Height Range')} ({convertHeight(1).label})</label>
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.height_rear_min !== undefined ? convertHeight(carParams.height_rear_min).value : undefined}
                    onChange={(val) => updateParam('height_rear_min', val !== undefined ? convertHeightToCm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Min')}
                  />
                </div>
                <span className="text-body-secondary fs-7">-</span>
                <div className="flex-grow-1">
                  <DecimalInput
                    value={carParams?.height_rear_max !== undefined ? convertHeight(carParams.height_rear_max).value : undefined}
                    onChange={(val) => updateParam('height_rear_max', val !== undefined ? convertHeightToCm(val) : undefined)}
                    precision={1}
                    min={0.1}
                    placeholder={t('Max')}
                  />
                </div>
              </div>
            </div>

            {/* Downforce */}
            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-8 mb-0">{t('Front Downforce')} ({convertForce(0).label})</label>
              <div className="d-flex gap-2 align-items-center">
                <div style={{ width: '90px' }}>
                  <DecimalInput
                    disabled={isFrontAutoAero}
                    value={isFrontAutoAero ? 0 : Number(convertForce(carParams?.aero_downforce_front || 0).value.toFixed(1))}
                    onChange={(val) => updateParam('aero_downforce_front', Math.max(0, convertForceToKgf(val || 0)))}
                    precision={1}
                  />
                </div>
                <label className="form-check-label fs-8 text-body-secondary d-flex align-items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked={isFrontAutoAero}
                    onChange={(e) => updateParam('aero_downforce_front', e.target.checked ? 0 : 50)}
                  />
                  {t('Auto')}
                </label>
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-8 mb-0">{t('Rear Downforce')} ({convertForce(0).label})</label>
              <div className="d-flex gap-2 align-items-center">
                <div style={{ width: '90px' }}>
                  <DecimalInput
                    disabled={isRearAutoAero}
                    value={isRearAutoAero ? 0 : Number(convertForce(carParams?.aero_downforce_rear || 0).value.toFixed(1))}
                    onChange={(val) => updateParam('aero_downforce_rear', Math.max(0, convertForceToKgf(val || 0)))}
                    precision={1}
                  />
                </div>
                <label className="form-check-label fs-8 text-body-secondary d-flex align-items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked={isRearAutoAero}
                    onChange={(e) => updateParam('aero_downforce_rear', e.target.checked ? 0 : 50)}
                  />
                  {t('Auto')}
                </label>
              </div>
            </div>

            {/* Tire Compound */}
            <div className="d-flex justify-content-between align-items-center">
              <label className="text-body-secondary fs-8 mb-0">{t('Tire Compound')}</label>
              <div style={{ width: '130px' }}>
                <select
                  value={carParams?.tireType || 'Stock'}
                  onChange={(e) => updateParam('tireType', e.target.value)}
                  className="form-select form-select-sm"
                  style={selectStyle}
                >
                  <option value="Stock">{t('Stock')}</option>
                  <option value="Street">{t('Street')}</option>
                  <option value="Sport">{t('Sport')}</option>
                  <option value="Semi-Slick">{t('Semi-Slick')}</option>
                  <option value="Slick">{t('Slick')}</option>
                  <option value="Rally">{t('Rally')}</option>
                  <option value="Off-Road">{t('Off-Road')}</option>
                  <option value="Snow">{t('Snow')}</option>
                  <option value="Drag">{t('Drag')}</option>
                  <option value="Drift">{t('Drift')}</option>
                </select>
              </div>
            </div>

            {/* Front Tire Specs */}
            <div>
              <label className="text-body-secondary fs-8 mb-1 d-block">{t('Front Tire (Width mm / % R in)')}</label>
              <div className="d-flex align-items-center gap-1">
                <div style={{ width: '80px' }}>
                  <DecimalInput
                    value={carParams?.frontTireWidth || 245}
                    onChange={(val) => updateParam('frontTireWidth', val ? Math.round(val) : 245)}
                    precision={0}
                    placeholder="245"
                  />
                </div>
                <span className="text-body-secondary fs-7">/</span>
                <div style={{ width: '60px' }}>
                  <DecimalInput
                    value={carParams?.frontTireAspect || 40}
                    onChange={(val) => updateParam('frontTireAspect', val ? Math.round(val) : 40)}
                    precision={0}
                    placeholder="40"
                  />
                </div>
                <span className="text-body-secondary fs-7">R</span>
                <div style={{ width: '60px' }}>
                  <DecimalInput
                    value={carParams?.frontTireRim || 18}
                    onChange={(val) => updateParam('frontTireRim', val ? Math.round(val) : 18)}
                    precision={0}
                    placeholder="18"
                  />
                </div>
              </div>
            </div>

            {/* Rear Tire Specs */}
            <div>
              <label className="text-body-secondary fs-8 mb-1 d-block">{t('Rear Tire (Width mm / % R in)')}</label>
              <div className="d-flex align-items-center gap-1">
                <div style={{ width: '80px' }}>
                  <DecimalInput
                    value={carParams?.rearTireWidth || 245}
                    onChange={(val) => updateParam('rearTireWidth', val ? Math.round(val) : 245)}
                    precision={0}
                    placeholder="245"
                  />
                </div>
                <span className="text-body-secondary fs-7">/</span>
                <div style={{ width: '60px' }}>
                  <DecimalInput
                    value={carParams?.rearTireAspect || 40}
                    onChange={(val) => updateParam('rearTireAspect', val ? Math.round(val) : 40)}
                    precision={0}
                    placeholder="40"
                  />
                </div>
                <span className="text-body-secondary fs-7">R</span>
                <div style={{ width: '60px' }}>
                  <DecimalInput
                    value={carParams?.rearTireRim || 18}
                    onChange={(val) => updateParam('rearTireRim', val ? Math.round(val) : 18)}
                    precision={0}
                    placeholder="18"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
