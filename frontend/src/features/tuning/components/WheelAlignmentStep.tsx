import { useSettings } from '../../../context/SettingsContext';
import type { StaticTireAlignResult, ChassisTuningResult } from '../../../utils/tuningMath';

export function WheelAlignmentStep({ alignment, springs }: {
  alignment: StaticTireAlignResult;
  springs: ChassisTuningResult['springs'];
}) {
  const { t, convertHeight } = useSettings();
  const frontHeight = convertHeight(springs.heightF);
  const rearHeight = convertHeight(springs.heightR);
  return <section className="glass-panel p-4 d-flex flex-column gap-3">
    <h3 className="h5 text-primary mb-0">{t('Wheel alignment')}</h3>
    <p className="text-body-secondary mb-0">{t('Check alignment at the chosen ride height. Recheck it after changing springs or ride height; these static estimates do not model suspension geometry changes.')}</p>
    <dl className="row mb-0">
      <dt className="col-sm-6">{t('Camber (Front / Rear)')}</dt><dd className="col-sm-6">{alignment.camber.front}° / {alignment.camber.rear}°</dd>
      <dt className="col-sm-6">{t('Toe (Front / Rear)')}</dt><dd className="col-sm-6">{alignment.toe.front} / {alignment.toe.rear}</dd>
      <dt className="col-sm-6">{t('Caster Angle')}</dt><dd className="col-sm-6">{alignment.caster}°</dd>
      <dt className="col-sm-6">{t('Calculated ride height to verify (front / rear)')}</dt>
      <dd className="col-sm-6">{frontHeight.value.toFixed(1)} / {rearHeight.value.toFixed(1)} {frontHeight.label}</dd>
    </dl>
    <p className="small text-body-secondary mb-0">{t('Compare these values with the game before setup confirmation. Visiting this section does not confirm that they were applied.')}</p>
  </section>;
}
