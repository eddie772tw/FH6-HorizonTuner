import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import { DecimalInput } from '../../../components/common/DecimalInput';
import { useTuneSession } from '../TuneSessionProvider';

export function RoadDrivetrainSetup({ profile, onChange }: {
  profile: CarParams; onChange: (value: number | undefined) => void;
}) {
  const { t } = useSettings();
  const { result } = useTuneSession();
  const rearPercent = result?.chassis?.diff.centerRear;
  if (profile.drivetrain === 'FWD') return null;
  if (profile.drivetrain !== 'AWD' || profile.adjustability.diff !== 'Adjustable') return null;
  const overridden = Number.isFinite(profile.roadAwdRearPercent);
  return <div className="border rounded p-2 d-flex flex-column gap-2">
    <div className="form-check">
      <input id="road-awd-override" className="form-check-input" type="checkbox" checked={overridden} disabled={rearPercent === undefined}
        onChange={event => onChange(event.target.checked ? rearPercent : undefined)} />
      <label className="form-check-label small" htmlFor="road-awd-override">{t('Override Road AWD torque split')}</label>
    </div>
    <label className="small" htmlFor="road-awd-rear">{t('Torque to rear wheels (%)')}</label>
    <DecimalInput id="road-awd-rear" value={rearPercent ?? null} min={0} max={100} step={1} precision={0}
      disabled={!overridden} onChange={value => onChange(value ?? undefined)} />
  </div>;
}
