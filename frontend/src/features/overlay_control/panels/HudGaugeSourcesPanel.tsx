import { useId } from 'react';
import type { HudPanelActions } from '../hudPanelTypes';
import { HudTextInput } from './HudTextInput';
import { HudSettingsSection } from './HudSettingsControls';
import { GAUGE_VALUE_KEYS, GAUGE_TELEMETRY_FIELDS, normalizeGaugeValueSources, type GaugeValueSources } from '../../../../../hud_overlay/shared/gauge-sources.js';

const READINGS = { boost: 'Boost', oilPressure: 'Oil Pressure', oilTemperature: 'Oil Temperature', waterTemperature: 'Water Temperature' };

export function HudGaugeSourcesPanel({ sources: input, onConfigPatch, t }: Pick<HudPanelActions, 't' | 'onConfigPatch'> & { sources?: GaugeValueSources }) {
  const id = useId();
  const sources = normalizeGaugeValueSources(input);
  return <HudSettingsSection title={t('Shared Gauge Value Sources')}>
    <p className="text-body-secondary fs-7 m-0">{t('Mappings apply to every face reading that value. Source units are converted to the printed gauge units. Native interprets the number as C or PSI.')}</p>
    <p className="text-body-secondary fs-7 m-0">{t('Oil pressure defaults to a damped engine-load estimate. Oil and water temperature default to average tire temperature. These are substitutes for unavailable engine sensors; custom sources take priority.')}</p>
    {GAUGE_VALUE_KEYS.map(key => <fieldset key={key} className="border-0 p-0 m-0">
      <legend className="fs-7 fw-bold">{t(READINGS[key])}</legend>
      <div className="d-flex flex-column gap-2">
        <div>
          <label htmlFor={`${id}-${key}-label`} className="form-label fs-7 text-body-secondary">{t('Value Description')}</label>
          <HudTextInput id={`${id}-${key}-label`} value={sources[key].label}
            onCommit={label => onConfigPatch({ gaugeValueSources: { [key]: { label } } })} />
        </div>
        <div>
          <label htmlFor={`${id}-${key}-field`} className="form-label fs-7 text-body-secondary">{t('Telemetry Field')}</label>
          <select id={`${id}-${key}-field`} className="form-select form-select-sm" value={sources[key].field}
            onChange={event => onConfigPatch({ gaugeValueSources: { [key]: { field: event.target.value } } })}>
            {[...new Set([...GAUGE_TELEMETRY_FIELDS, sources[key].field])].map(field => <option key={field} value={field}>{field || t('Unassigned')}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-${key}-unit`} className="form-label fs-7 text-body-secondary">{t('Source Unit')}</label>
          <select id={`${id}-${key}-unit`} className="form-select form-select-sm" value={sources[key].unit}
            onChange={event => onConfigPatch({ gaugeValueSources: { [key]: { unit: event.target.value as GaugeValueSources[typeof key]['unit'] } } })}>
            {(key.endsWith('Temperature') ? ['native', 'C', 'F'] : ['native', 'psi', 'bar', 'kpa']).map(unit => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </div>
      </div>
    </fieldset>)}
  </HudSettingsSection>;
}
