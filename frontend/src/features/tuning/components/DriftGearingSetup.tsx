import { DecimalInput } from '../../../components/common/DecimalInput';
import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { DriftWorkingTarget } from '../aegoTypes';

export function DriftGearingSetup({ profile, onChange }: {
  profile: CarParams | null;
  onChange: (field: keyof CarParams, value: unknown) => void;
}) {
  const { t } = useSettings();
  const target = profile?.driftWorkingTarget;
  const edit = (field: keyof Omit<DriftWorkingTarget, 'source'>, value: number | undefined) =>
    onChange('driftWorkingTarget', { ...target, source: 'user-target', [field]: value });
  return <section id="aego-drift-target" className="p-2 rounded border bg-body-tertiary d-flex flex-column gap-2" aria-labelledby="aego-drift-title">
    <h4 id="aego-drift-title" className="fs-7 fw-semibold mb-0">{t('Drift operating target')}</h4>
    <p className="small text-body-secondary mb-0">{t('Enter all three targets. Wheel speed is not ground speed during slip. No drift speed or usable power band is inferred from peak RPM alone.')}</p>
    <label htmlFor="aego-drift-main-gear" className="small">{t('Main working gear')}</label>
    <select id="aego-drift-main-gear" className="form-select form-select-sm" value={target?.mainGear ?? ''}
      onChange={event=>edit('mainGear',event.target.value ? Number(event.target.value) : undefined)}>
      <option value="">{t('Required')}</option>
      {Array.from({length:Math.min(10,Math.max(0,profile?.adjustability.gears ?? 0))},(_,index)=>
        <option key={index+1} value={index+1}>{index+1}</option>)}
    </select>
    <label htmlFor="aego-drift-target-rpm" className="small">{t('Target operating RPM')}</label>
    <DecimalInput id="aego-drift-target-rpm" value={target?.targetRpm} precision={0} min={1}
      onChange={value => edit('targetRpm', value)} placeholder={t('Required')} />
    <label htmlFor="aego-drift-wheel-speed" className="small">{t('Target wheel speed (km/h)')}</label>
    <DecimalInput id="aego-drift-wheel-speed" value={target?.wheelSpeedKmh} precision={1} min={0.1}
      onChange={value => edit('wheelSpeedKmh', value)} placeholder={t('Required')} />
    <p className="small text-body-secondary mb-0">{t('These are user targets, not measured performance. Rust checks the qualified usable RPM limit and rounded ratios before offering a recommendation.')}</p>
  </section>;
}
