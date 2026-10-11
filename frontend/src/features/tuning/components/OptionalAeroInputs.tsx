import { DecimalInput } from '../../../components/common/DecimalInput';
import { useSettings } from '../../../context/SettingsContext';
import type { CarParams } from '../../../context/CarParamsContext';

type AeroFields = Pick<CarParams, 'aero_downforce_front' | 'aero_downforce_rear' | 'aeroBalance'>;
export function OptionalAeroInputs({ value, onChange }: {
  value: AeroFields | null;
  onChange: (field: keyof AeroFields, value: number | null) => void;
}) {
  const { t, convertForce, convertForceToKgf } = useSettings();
  // Presence only controls which editor is visible; qualification/inference belongs to Rust.
  const single = (value?.aero_downforce_front != null) !== (value?.aero_downforce_rear != null);
  return <fieldset className="border rounded p-2 d-flex flex-column gap-2">
    <legend className="fs-7 mb-0">{t('Optional downforce')}</legend>
    <p className="small text-body-secondary mb-0">{t('Leave both loads blank to skip downforce correction. Enter one load and front aero balance, or enter both loads directly.')}</p>
    {(['front', 'rear'] as const).map(axle => {
      const key = `aero_downforce_${axle}` as const;
      const raw = value?.[key];
      const label = t(axle === 'front' ? 'Front Downforce' : 'Rear Downforce');
      return <div className="d-flex align-items-center justify-content-between gap-2" key={axle}>
        <label className="small" htmlFor={`optional-aero-${axle}`}>{label} ({convertForce(0).label})</label>
        <DecimalInput id={`optional-aero-${axle}`} aria-label={label} value={raw == null ? undefined : convertForce(raw).value}
          onChange={input => onChange(key, input == null ? null : convertForceToKgf(input))} precision={1}
          placeholder={t('Not provided')} style={{ width: '110px' }} />
      </div>;
    })}
    {single && <div className="d-flex align-items-center justify-content-between gap-2">
      <label className="small" htmlFor="optional-aero-balance">{t('Front aero balance (%)')}</label>
      <DecimalInput id="optional-aero-balance" aria-label={t('Front aero balance (%)')}
        value={value?.aeroBalance == null ? undefined : value.aeroBalance * 100}
        onChange={input => onChange('aeroBalance', input == null ? null : input / 100)} precision={1}
        placeholder={t('Required for one load')} style={{ width: '110px' }} />
    </div>}
  </fieldset>;
}
