import { useEffect, useId, useState } from 'react';
import type { HudConfig } from '../hudConfig';
import type { HudDisplayUnits } from '../HudUnitSettingsSidebar';
import {
  readStackSt8100Settings, STACK_ST8100_DIALS, STACK_ST8100_FIELDS, STACK_ST8100_LIMITS,
  type StackSt8100Dial, type StackSt8100Field, type StackSt8100Page,
  type StackSt8100Settings, type StackSt8100TemperatureUnit,
} from './config';
import {
  resolveStackSt8100BoostUnit, stackSt8100ThresholdToDisplay, parseStackSt8100ThresholdDraft,
  type StackSt8100DisplayUnits,
} from './units';

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
const WARNINGS = [
  { enabled: 'stackSt8100ShiftEnabled', threshold: 'stackSt8100ShiftPercent', label: 'Shift light', unit: '% max RPM' },
  { enabled: 'stackSt8100FuelWarningEnabled', threshold: 'stackSt8100FuelWarningPercent', label: 'Low fuel warning', unit: '%' },
  { enabled: 'stackSt8100TireWarningEnabled', threshold: 'stackSt8100TireWarningC', label: 'High tire temperature warning', unit: 'temperature' },
  { enabled: 'stackSt8100BoostWarningEnabled', threshold: 'stackSt8100BoostWarningBar', label: 'High boost warning', unit: 'boostPressure' },
] as const;

function ThresholdRow({ warning, settings, units, id, onChange, t }: {
  warning: (typeof WARNINGS)[number];
  settings: StackSt8100Settings;
  units: StackSt8100DisplayUnits;
  id: string;
  onChange: StackSt8100SettingsCardProps['onChange'];
  t: StackSt8100SettingsCardProps['t'];
}) {
  const { enabled, threshold, label } = warning;
  const limits = STACK_ST8100_LIMITS[threshold];
  const display = (value: number) => stackSt8100ThresholdToDisplay(threshold, value, units);
  const unit = warning.unit === 'temperature' ? (units.temperature === 'f' ? '°F' : '°C')
    : warning.unit === 'boostPressure' ? (units.boostPressure === 'kpa' ? 'kPa' : units.boostPressure) : t(warning.unit);
  const displayed = String(Number(display(settings[threshold]).toFixed(2)));
  const [draft, setDraft] = useState(displayed);
  useEffect(() => { setDraft(displayed); }, [displayed]);
  const commit = () => {
    // An untouched rounded PSI display must not alter the stored bar value.
    if (draft === displayed) return;
    const canonical = parseStackSt8100ThresholdDraft(threshold, draft, units);
    if (canonical === null) { setDraft(displayed); return; }
    setDraft(String(Number(display(canonical).toFixed(2))));
    if (canonical !== settings[threshold]) onChange({ [threshold]: canonical });
  };
  return (
    <div className="row g-2 align-items-center">
      <div className="col-12 col-sm-6">
        <label className="form-check form-switch m-0">
          <input type="checkbox" className="form-check-input" checked={settings[enabled]}
            onChange={event => onChange({ [enabled]: event.target.checked })} />
          <span className="form-check-label fs-7">{t(label)}</span>
        </label>
      </div>
      <div className="col-12 col-sm-6">
        <label htmlFor={`${id}-${threshold}`} className="visually-hidden">{t(label)} {t('Threshold')} ({unit})</label>
        <div className="input-group input-group-sm">
          <input id={`${id}-${threshold}`} type="text" inputMode="decimal" className="form-control" disabled={!settings[enabled]}
            aria-describedby={`${id}-${threshold}-range`} value={draft}
            onChange={event => setDraft(event.currentTarget.value)} onBlur={commit}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
              if (event.key === 'Escape') { event.preventDefault(); setDraft(displayed); }
            }} />
          <span className="input-group-text fs-8">{unit}</span>
        </div>
        <span id={`${id}-${threshold}-range`} className="visually-hidden">{t('Range')}: {Number(display(limits.min).toFixed(2))}–{Number(display(limits.max).toFixed(2))} {unit}</span>
      </div>
    </div>
  );
}

export function StackSt8100SettingsCard({ config, appUnits, onChange, t }: StackSt8100SettingsCardProps) {
  const id = useId();
  const settings = readStackSt8100Settings(config);
  const units: StackSt8100DisplayUnits = {
    temperature: settings.stackSt8100TemperatureUnit,
    boostPressure: resolveStackSt8100BoostUnit(config, appUnits),
  };
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
        <p className="text-body-secondary fs-8 mt-2 mb-0">{t('Speed and boost units follow HUD Unit Settings.')}</p>
      </fieldset>
      <fieldset className="border-0 p-0 m-0 d-flex flex-column gap-2">
        <legend className="fs-7 fw-semibold mb-1">{t('Shift light and warnings')}</legend>
        {WARNINGS.map(warning => <ThresholdRow key={warning.enabled} warning={warning} settings={settings}
          units={units} id={id} onChange={onChange} t={t} />)}
        <p className="text-body-secondary fs-8 m-0">{t('Warning thresholds are illustrative and disabled by default. Choose values for your vehicle; these are not tuning recommendations.')}</p>
      </fieldset>
    </div>
  );
}
