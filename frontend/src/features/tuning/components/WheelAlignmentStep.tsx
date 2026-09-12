import { useSettings } from '../../../context/SettingsContext';
import type { StaticTireAlignResult, ChassisTuningResult } from '../../../utils/tuningMath';

export function WheelAlignmentStep({ result, chassis }: { result: StaticTireAlignResult | null; chassis: ChassisTuningResult | null }) {
  const { t, convertHeight } = useSettings();
  if (!result) return null;
  const height = (cm: number) => { const display = convertHeight(cm); return display.value + ' ' + display.label; };
  return <section className="glass-panel p-4">
    <h3 className="h5">{t('Wheel alignment')}</h3>
    <p>{t('Initial estimates. Recheck alignment after changing ride height.')}</p>
    <table className="table"><thead><tr><th>{t('Parameter')}</th><th>{t('Front')}</th><th>{t('Rear')}</th></tr></thead><tbody>
      <tr><th>Camber</th><td>{result.camber.front}°</td><td>{result.camber.rear}°</td></tr>
      <tr><th>Toe</th><td>{result.toe.front}</td><td>{result.toe.rear}</td></tr>
      <tr><th>Caster</th><td>{result.caster}°</td><td>—</td></tr>
      {chassis && <tr><th>{t('Suggested ride height')}</th><td>{height(chassis.springs.heightF)}</td><td>{height(chassis.springs.heightR)}</td></tr>}
    </tbody></table>
    <p className="small text-body-secondary">{t('Normalized tire slip is an observation, not measured camber, toe or caster.')}</p>
  </section>;
}
