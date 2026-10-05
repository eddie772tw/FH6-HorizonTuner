import { useId } from 'react';
import type { HudConfig } from '../hudConfig';
import type { HudDisplayUnits } from '../HudUnitSettingsSidebar';
import { readStackSt8100Settings, STACK_ST8100_DIALS, STACK_ST8100_FIELDS,
  type StackSt8100Dial, type StackSt8100Field, type StackSt8100Page,
  type StackSt8100Face, type StackSt8100TemperatureUnit } from './config';
import { resolveStackSt8100DisplayUnits } from './units';
import { StackSt8100ThresholdInput } from './StackSt8100ThresholdInput';
import { StackSt8100AlarmSettings } from './StackSt8100AlarmSettings';

interface StackSt8100SettingsCardProps {
  config: HudConfig;
  appUnits: HudDisplayUnits;
  onChange: (patch: Partial<HudConfig>) => void;
  t: (key: string) => string;
}
const FIELD_SLOTS = [
  { key: 'stackSt8100Field1', label: 'LCD upper left' },
  { key: 'stackSt8100Field2', label: 'LCD upper right' },
  { key: 'stackSt8100Field3', label: 'LCD lower left' },
  { key: 'stackSt8100Field4', label: 'LCD lower right' },
] as const;

export function StackSt8100SettingsCard({ config, appUnits, onChange, t }: StackSt8100SettingsCardProps) {
  const id = useId();
  const settings = readStackSt8100Settings(config);
  const units = resolveStackSt8100DisplayUnits({ ...config, stackSt8100TemperatureUnit: settings.stackSt8100TemperatureUnit }, appUnits);
  return (
    <div role="group" aria-label={t('Stack ST8100 settings')} className="border-top pt-2 d-flex flex-column gap-3">
      <fieldset className="border-0 p-0 m-0">
        <legend className="fs-7 fw-semibold mb-2">{t('Stack ST8100 display')}</legend>
        <div className="row g-2">
          <div className="col-12">
            <label htmlFor={`${id}-dial`} className="form-label fs-7 mb-1">{t('Tachometer range')}</label>
            <select id={`${id}-dial`} className="form-select form-select-sm" value={settings.stackSt8100Dial}
              onChange={event => onChange({ stackSt8100Dial: event.target.value as StackSt8100Dial })}>
              {STACK_ST8100_DIALS.map(dial => <option key={dial} value={dial}>{dial === 'auto' ? t('Auto (engine maximum RPM)') : `${dial} × 1000 RPM`}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label htmlFor={`${id}-face`} className="form-label fs-7 mb-1">{t('Dial face')}</label>
            <select id={`${id}-face`} className="form-select form-select-sm" value={settings.stackSt8100Face}
              onChange={event => onChange({ stackSt8100Face: event.target.value as StackSt8100Face })}>
              <option value="black">{t('Black')}</option><option value="white">{t('White')}</option>
            </select>
          </div>
          <div className="col-6">
            <label htmlFor={`${id}-page`} className="form-label fs-7 mb-1">{t('LCD page')}</label>
            <select id={`${id}-page`} className="form-select form-select-sm" value={settings.stackSt8100Page}
              onChange={event => onChange({ stackSt8100Page: event.target.value as StackSt8100Page })}>
              <option value="live">{t('Live values')}</option><option value="peaks">{t('Peak values')}</option>
            </select>
          </div>
          <div className="col-6">
            <label htmlFor={`${id}-temperature`} className="form-label fs-7 mb-1">{t('Tire temperature unit')}</label>
            <select id={`${id}-temperature`} className="form-select form-select-sm" value={settings.stackSt8100TemperatureUnit}
              onChange={event => onChange({ stackSt8100TemperatureUnit: event.target.value as StackSt8100TemperatureUnit })}>
              <option value="c">°C</option><option value="f">°F</option>
            </select>
          </div>
        </div>
      </fieldset>
      <fieldset className="border-0 p-0 m-0">
        <legend className="fs-7 fw-semibold mb-2">{t('Live LCD fields')}</legend>
        <div className="row g-2">
          {FIELD_SLOTS.map(({ key, label }) => (
            <div className="col-6" key={key}>
              <label htmlFor={`${id}-${key}`} className="form-label fs-7 mb-1">{t(label)}</label>
              <select id={`${id}-${key}`} className="form-select form-select-sm" value={settings[key]}
                onChange={event => onChange({ [key]: event.target.value as StackSt8100Field })}>
                {STACK_ST8100_FIELDS.map(field => <option key={field.value} value={field.value}>{t(field.label)}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="text-body-secondary fs-8 mt-2 mb-0">{t('Speed, boost, power and torque units follow HUD Unit Settings.')}</p>
      </fieldset>
      <fieldset className="border-0 p-0 m-0 d-flex flex-column gap-2">
        <legend className="fs-7 fw-semibold mb-1">{t('Shift light')}</legend>
        <label className="form-check form-switch m-0">
          <input type="checkbox" className="form-check-input" checked={settings.stackSt8100ShiftEnabled}
            onChange={event => onChange({ stackSt8100ShiftEnabled: event.target.checked })} />
          <span className="form-check-label fs-7">{t('Enabled')}</span>
        </label>
        <StackSt8100ThresholdInput id={`${id}-stackSt8100ShiftPercent`} metric="shift_percent" value={settings.stackSt8100ShiftPercent}
          units={units} onChange={stackSt8100ShiftPercent => onChange({ stackSt8100ShiftPercent })} t={t} />
      </fieldset>
      <StackSt8100AlarmSettings id={id} alarms={settings.stackSt8100Alarms} units={units}
        onChange={stackSt8100Alarms => onChange({ stackSt8100Alarms })} t={t} />
    </div>
  );
}
