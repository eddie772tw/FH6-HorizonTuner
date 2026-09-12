import { useSettings } from '../../../context/SettingsContext';
import type { StaticTireAlignResult } from '../../../utils/tuningMath';

export function TireBaselineStep({ result }: { result: StaticTireAlignResult | null }) {
  const { t, convertTirePressureFromPsi } = useSettings();
  if (!result) return null;
  const pressure = (psi: number) => { const display = convertTirePressureFromPsi(psi); return display.value + ' ' + display.label; };
  return <section className="glass-panel p-4">
    <h3 className="h5">{t('Tire baseline')}</h3>
    <p>{t('Initial estimates from the current vehicle profile. Confirm the actual pressures in game.')}</p>
    <table className="table"><tbody>
      <tr><th>{t('Front cold pressure')}</th><td>{pressure(result.pcF)}</td></tr>
      <tr><th>{t('Rear cold pressure')}</th><td>{pressure(result.pcR)}</td></tr>
      <tr><th>{t('Estimated hot pressure target')}</th><td>{pressure(result.targetPhot)}</td></tr>
    </tbody></table>
    <p className="small text-body-secondary">{t('Data Out does not report tire pressure or inner/middle/outer tire temperatures. These values require game readback; telemetry cannot confirm them.')}</p>
  </section>;
}
