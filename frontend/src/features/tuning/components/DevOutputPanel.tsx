import React from 'react';
import { DevTuningOutput } from '../../../utils/tuningMath_dev';

interface DevOutputPanelProps {
  output: DevTuningOutput;
  currentStep?: number;
  t: (text: string) => string;
}

const ValueRow: React.FC<{ label: string; value: string | number; unit?: string }> = ({ label, value, unit }) => (
  <div className="d-flex justify-content-between align-items-center border-bottom py-2 gap-3">
    <span className="text-body-secondary fs-7">{label}</span>
    <span className="fw-bold text-end">{value}{unit ? ` ${unit}` : ''}</span>
  </div>
);

const DevOutputPanel: React.FC<DevOutputPanelProps> = ({ output, currentStep, t }) => (
  <section className="card h-100">
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
        <h5 className="text-primary fs-6 fw-bold mb-0">{t('Typed Output')}</h5>
        <span className="text-body-secondary fs-7">{t('Step')} {currentStep ?? 1}</span>
      </div>
      <div className="row g-3">
        <div className="col-12 col-md-6">
          <h6 className="fw-bold text-primary">{t('Tire Prior')}</h6>
          <ValueRow label={t('Compound')} value={output.tire.compound} /><ValueRow label="μ longitudinal" value={output.tire.muLongitudinal} /><ValueRow label="μ lateral" value={output.tire.muLateral} /><ValueRow label={t('Peak Slip Ratio')} value={output.tire.peakSlipRatio} /><ValueRow label={t('Peak Slip Angle')} value={output.tire.peakSlipAngleDeg} unit="deg" /><ValueRow label={t('Load Sensitivity')} value={output.tire.loadSensitivity} /><ValueRow label={t('Source')} value={output.tire.source} />
        </div>
        <div className="col-12 col-md-6">
          <h6 className="fw-bold text-primary">{t('Chassis')}</h6>
          <ValueRow label={t('Front Spring')} value={output.chassis.springs.frontKgfMm} unit="kgf/mm" /><ValueRow label={t('Rear Spring')} value={output.chassis.springs.rearKgfMm} unit="kgf/mm" /><ValueRow label={t('Front ARB')} value={output.chassis.arb.front} /><ValueRow label={t('Rear ARB')} value={output.chassis.arb.rear} /><ValueRow label={t('Damping Slider F/R')} value={`${output.chassis.damping.frontSliderValue} / ${output.chassis.damping.rearSliderValue}`} />
        </div>
        <div className="col-12 col-md-6">
          <h6 className="fw-bold text-primary">{t('Alignment')}</h6>
          <ValueRow label={t('Cold Pressure F/R')} value={`${output.alignment.pressureColdFrontPsi} / ${output.alignment.pressureColdRearPsi}`} unit="psi" /><ValueRow label={t('Hot Pressure Target')} value={output.alignment.targetHotPressurePsi} unit="psi" /><ValueRow label={t('Camber F/R')} value={`${output.alignment.camberFrontDeg} / ${output.alignment.camberRearDeg}`} unit="deg" /><ValueRow label={t('Toe F/R')} value={`${output.alignment.toeFrontDeg} / ${output.alignment.toeRearDeg}`} unit="deg" /><ValueRow label={t('Caster')} value={output.alignment.casterDeg} unit="deg" />
        </div>
        <div className="col-12 col-md-6">
          <h6 className="fw-bold text-primary">{t('Gearing')}</h6>
          <ValueRow label={t('Final Drive')} value={output.gearing.finalDrive} /><ValueRow label={t('Peak Power Top Speed')} value={output.gearing.topSpeedAtPeakHpKmh} unit="km/h" /><ValueRow label={t('Tire Circumference')} value={output.gearing.tireCircumferenceM} unit="m" /><ValueRow label={t('Gear Ratios')} value={output.gearing.gears.join(' / ')} />
        </div>
        <div className="col-12 col-md-6">
          <h6 className="fw-bold text-primary">{t('Differential')}</h6>
          <ValueRow label={t('Front Accel / Decel')} value={`${output.differential.frontAccelPercent} / ${output.differential.frontDecelPercent}`} unit="%" /><ValueRow label={t('Rear Accel / Decel')} value={`${output.differential.rearAccelPercent} / ${output.differential.rearDecelPercent}`} unit="%" /><ValueRow label={t('Center to Rear')} value={output.differential.centerToRearPercent} unit="%" />
        </div>
      </div>
    </div>
  </section>
);

export default DevOutputPanel;
