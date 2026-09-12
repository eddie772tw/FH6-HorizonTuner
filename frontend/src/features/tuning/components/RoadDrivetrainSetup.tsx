import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import { DecimalInput } from '../../../components/common/DecimalInput';
import { getRoadAwdRearPercent } from '../../../utils/tuningMath';

export function RoadDrivetrainSetup({ profile, onChange }: {
  profile: CarParams; onChange: (value: number | undefined) => void;
}) {
  const { t } = useSettings();
  if (profile.drivetrain === 'FWD') return <p className="small text-body-secondary mb-0">
    {t('FWD baseline keeps the front compliant and lengthens launch gearing as front axle load falls. Validate corner exit and wheelspin in game.')}
  </p>;
  if (profile.drivetrain !== 'AWD' || profile.adjustability.diff !== 'Adjustable') return null;
  const overridden = Number.isFinite(profile.roadAwdRearPercent);
  return <div className="border rounded p-2 d-flex flex-column gap-2">
    <div className="form-check">
      <input id="road-awd-override" className="form-check-input" type="checkbox" checked={overridden}
        onChange={event => onChange(event.target.checked ? getRoadAwdRearPercent(profile) : undefined)} />
      <label className="form-check-label small" htmlFor="road-awd-override">{t('Override Road AWD torque split')}</label>
    </div>
    <label className="small" htmlFor="road-awd-rear">{t('Torque to rear wheels (%)')}</label>
    <DecimalInput id="road-awd-rear" value={getRoadAwdRearPercent(profile)} min={0} max={100} step={1} precision={0}
      disabled={!overridden} onChange={value => onChange(value ?? undefined)} />
    <p className="small text-body-secondary mb-0">{t('Default keeps the rear-biased baseline. Copy your intended in-game center setting to override it; this also changes the launch gearing estimate. Turning this off restores the default.')}</p>
  </div>;
}
