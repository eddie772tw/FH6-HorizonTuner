import React from 'react';
import { CarParams } from '../../../context/CarParamsContext';
import { DevRaceGoal, DevSurface } from '../../../utils/tuningMath_dev';

export const goalSurfaces: Record<DevRaceGoal, DevSurface[]> = {
  Road: ['tarmac'],
  Rally: ['gravel', 'snow'],
  Drag: ['dragStrip', 'tarmac'],
  Drift: ['tarmac', 'gravel']
};

interface DevInputPanelProps {
  carName: string;
  carParams: CarParams;
  raceGoal: DevRaceGoal;
  surface: DevSurface;
  targetTopSpeedKmh: number;
  targetRideFrequencyFrontHz: number;
  targetRideFrequencyRearHz: number;
  dampingRatioFront: number;
  dampingRatioRear: number;
  t: (text: string) => string;
  onRaceGoalChange: (goal: DevRaceGoal) => void;
  onSurfaceChange: (surface: DevSurface) => void;
  onTargetTopSpeedChange: (value: number) => void;
  onFrontFrequencyChange: (value: number) => void;
  onRearFrequencyChange: (value: number) => void;
  onFrontDampingChange: (value: number) => void;
  onRearDampingChange: (value: number) => void;
}

const ValueRow: React.FC<{ label: string; value: string | number; unit?: string }> = ({ label, value, unit }) => (
  <div className="d-flex justify-content-between align-items-center border-bottom py-2 gap-3">
    <span className="text-body-secondary fs-7">{label}</span>
    <span className="fw-bold text-end">{value}{unit ? ` ${unit}` : ''}</span>
  </div>
);

const numberInput = (id: string, value: number, onChange: (value: number) => void, min: number, max: number, step: number) => (
  <input id={id} className="form-control form-control-sm" type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
);

const formatNumber = (value: number, digits = 2): string => value.toFixed(digits);

const DevInputPanel: React.FC<DevInputPanelProps> = (props) => {
  const { carName, carParams, raceGoal, surface, targetTopSpeedKmh, targetRideFrequencyFrontHz, targetRideFrequencyRearHz, dampingRatioFront, dampingRatioRear, t } = props;
  return (
    <section className="card h-100">
      <div className="card-body d-flex flex-column gap-3">
        <div className="d-flex justify-content-between align-items-center border-bottom pb-2">
          <h5 className="text-primary fs-6 fw-bold mb-0">{t('Typed Input')}</h5>
          <span className="text-body-secondary fs-7">{carName}</span>
        </div>
        <div className="row g-2">
          <div className="col-6">
            <label className="form-label fs-7" htmlFor="dev-race-goal">{t('Race Goal')}</label>
            <select id="dev-race-goal" className="form-select form-select-sm" value={raceGoal} onChange={(event) => props.onRaceGoalChange(event.target.value as DevRaceGoal)}>
              <option value="Road">Road</option><option value="Rally">Rally</option><option value="Drag">Drag</option><option value="Drift">Drift</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label fs-7" htmlFor="dev-surface">{t('Surface')}</label>
            <select id="dev-surface" className="form-select form-select-sm" value={surface} onChange={(event) => props.onSurfaceChange(event.target.value as DevSurface)}>
              {goalSurfaces[raceGoal].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label fs-7" htmlFor="dev-target-speed">{t('Target Top Speed')}</label>
            {numberInput('dev-target-speed', targetTopSpeedKmh, props.onTargetTopSpeedChange, 80, 450, 1)}
            <div className="form-text fs-7">km/h</div>
          </div>
          <div className="col-6">
            <label className="form-label fs-7" htmlFor="dev-front-frequency">{t('Front Ride Frequency')}</label>
            {numberInput('dev-front-frequency', targetRideFrequencyFrontHz, props.onFrontFrequencyChange, 1, 4.5, 0.05)}
            <div className="form-text fs-7">Hz</div>
          </div>
          <div className="col-6">
            <label className="form-label fs-7" htmlFor="dev-rear-frequency">{t('Rear Ride Frequency')}</label>
            {numberInput('dev-rear-frequency', targetRideFrequencyRearHz, props.onRearFrequencyChange, 1, 4.5, 0.05)}
            <div className="form-text fs-7">Hz</div>
          </div>
          <div className="col-6">
            <label className="form-label fs-7" htmlFor="dev-front-damping">{t('Front Damping Ratio')}</label>
            {numberInput('dev-front-damping', dampingRatioFront, props.onFrontDampingChange, 0.3, 1.2, 0.01)}
          </div>
          <div className="col-6">
            <label className="form-label fs-7" htmlFor="dev-rear-damping">{t('Rear Damping Ratio')}</label>
            {numberInput('dev-rear-damping', dampingRatioRear, props.onRearDampingChange, 0.3, 1.2, 0.01)}
          </div>
        </div>
        <div className="border-top pt-2">
          <div className="text-body-secondary fs-7 mb-1">{t('Car parameter snapshot')}</div>
          <ValueRow label={t('Weight')} value={formatNumber(carParams.weight, 0)} unit="kg" />
          <ValueRow label={t('Front Weight Distribution')} value={formatNumber(carParams.weight_distribution, 1)} unit="%" />
          <ValueRow label={t('Drivetrain')} value={carParams.drivetrain} />
          <ValueRow label={t('Maximum Power')} value={formatNumber(carParams.maxHp, 0)} unit="hp" />
          <ValueRow label={t('Available Gears')} value={carParams.adjustability.gears} />
        </div>
      </div>
    </section>
  );
};

export default DevInputPanel;
