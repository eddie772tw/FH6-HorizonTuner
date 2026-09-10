import { useSettings } from '../../../context/SettingsContext';

export interface AppliedGearing {
  finalDrive: number;
  gears: number[];
}

export function AppliedGearingTable({ value, onChange }: {
  value: AppliedGearing;
  onChange: (value: AppliedGearing) => void;
}) {
  const { t } = useSettings();
  return <fieldset className="glass-panel p-3">
    <legend className="fs-6">{t('Verify in-game gearing')}</legend>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
      <label className="form-label">{t('Final Drive')}
        <input className="form-control" type="number" step="0.01" min="0.01"
          value={Number.isFinite(value.finalDrive) ? value.finalDrive : ''}
          onChange={e => onChange({ ...value, finalDrive: e.target.valueAsNumber })} />
      </label>
      {value.gears.map((ratio, index) => <label className="form-label" key={index}>
        {t('Gear')} {index + 1}
        <input className="form-control" type="number" step="0.01" min="0.01"
          value={Number.isFinite(ratio) ? ratio : ''}
          onChange={e => onChange({ ...value, gears: value.gears.map((v, i) => i === index ? e.target.valueAsNumber : v) })} />
      </label>)}
    </div>
  </fieldset>;
}

export function isAppliedGearingValid(value: AppliedGearing): boolean {
  return Number.isFinite(value.finalDrive) && value.finalDrive > 0 &&
    value.gears.length > 0 && value.gears.every(v => Number.isFinite(v) && v > 0);
}
