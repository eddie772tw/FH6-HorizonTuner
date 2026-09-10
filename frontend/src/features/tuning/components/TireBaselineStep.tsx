import { useSettings } from '../../../context/SettingsContext';
import type { WorkflowTuningResult } from '../../../utils/tuningMath';

export function TireBaselineStep({ tires }: { tires: WorkflowTuningResult['tires'] }) {
  const { t, convertTirePressureFromPsi } = useSettings();
  const pressure = (psi: number) => {
    const display = convertTirePressureFromPsi(psi);
    return `${display.value.toFixed(2)} ${display.label}`;
  };
  return <section className="glass-panel p-4 d-flex flex-column gap-3">
    <h3 className="h5 text-primary mb-0">{t('Tire baseline')}</h3>
    <p className="text-body-secondary mb-0">{t('Establish tire dimensions and starting pressures before evaluating chassis changes. These are initial estimates to verify on track.')}</p>
    <dl className="row mb-0">
      <dt className="col-sm-6">{t('Front Cold Pressure')}</dt><dd className="col-sm-6">{pressure(tires.pcF)}</dd>
      <dt className="col-sm-6">{t('Rear Cold Pressure')}</dt><dd className="col-sm-6">{pressure(tires.pcR)}</dd>
      <dt className="col-sm-6">{t('Target Hot Pressure')}</dt><dd className="col-sm-6">{pressure(tires.targetPhot)}</dd>
      <dt className="col-sm-6">{t('Front Sidewall Height')}</dt><dd className="col-sm-6">{tires.hwF} mm</dd>
      <dt className="col-sm-6">{t('Rear Sidewall Height')}</dt><dd className="col-sm-6">{tires.hwR} mm</dd>
      <dt className="col-sm-6">{t('Nominal gearing tire radius')}</dt><dd className="col-sm-6">{(tires.gearingRadiusM * 1000).toFixed(1)} mm</dd>
    </dl>
    <p className="small text-body-secondary mb-0">{t('The gearing radius comes from the driven-tire dimensions, not from estimated pressure or camber. AWD uses the existing rear-tire convention.')}</p>
  </section>;
}
