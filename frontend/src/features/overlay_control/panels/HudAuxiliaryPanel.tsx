import { useId } from 'react';
import type { HudPanelSharedProps } from '../hudPanelTypes';
import type { HudConfig } from '../hudConfig';
import { HudOffsetInput as OffsetInput } from './HudOffsetInput';
import { GAUGE_VALUE_KEYS, GAUGE_TELEMETRY_FIELDS, normalizeGaugeValueSources } from '../../../../../hud_overlay/shared/gauge-sources.js';

const FACES = [
  ['aem', 'AEM 30-4408 Boost (PSI)'], ['greddy', 'GReddy Trust Oil Pressure (PSI)'],
  ['blitz', 'Blitz Racing Meter Oil Temp (C)'], ['defi', 'Defi Advance Water Temp (C)'],
  ['speedhut', 'Speedhut Boost (BAR)'],
] as const;
const READINGS = { boost: 'Boost', oilPressure: 'Oil Pressure', oilTemperature: 'Oil Temperature', waterTemperature: 'Water Temperature' };
type Props = Pick<HudPanelSharedProps, 'config' | 'disabled' | 'onConfigPatch'> & { t: (key: string) => string };

export function HudAuxiliaryPanel({ config, disabled, onConfigPatch, t }: Props) {
  const id = useId();
  const selected = config.auxGaugeFaces ?? ['aem', 'greddy', 'defi'];
  const sources = normalizeGaugeValueSources(config.gaugeValueSources);
  return (
    <fieldset disabled={disabled} className="border-0 border-top p-0 pt-3 m-0" aria-labelledby={`${id}-title`}>
      <legend id={`${id}-title`} className="fs-6 fw-bold text-primary">{t('Auxiliary Gauges')}</legend>
      <p className="text-body-secondary fs-7 mb-2">{t('Show alongside any speedometer style.')}</p>
      <label className="form-check form-switch mb-3">
        <input type="checkbox" className="form-check-input" checked={config.elements.showAuxiliaryGauges === true}
          onChange={event => onConfigPatch({ elements: { ...config.elements, showAuxiliaryGauges: event.target.checked } })} />
        <span className="form-check-label fs-7">{t('Show Auxiliary Gauges')}</span>
      </label>
      <fieldset className="border-0 p-0 mb-3">
        <legend className="fs-7 text-body-secondary">{t('Visible Gauge Faces')}</legend>
        <div className="row g-2">
          {FACES.map(([face, label]) => <div key={face} className="col-12 col-lg-6"><label className="form-check">
            <input type="checkbox" className="form-check-input" checked={selected.includes(face)} onChange={event =>
              onConfigPatch({ auxGaugeFaces: event.target.checked ? [...selected, face] : selected.filter(item => item !== face) })} />
            <span className="form-check-label fs-7">{t(label)}</span>
          </label></div>)}
        </div>
      </fieldset>
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-count`} className="form-label fs-7">{t('Maximum Gauges Per Row')}</label>
          <select id={`${id}-count`} className="form-select form-select-sm" value={config.auxGaugeMaxPerRow ?? 3}
            onChange={event => onConfigPatch({ auxGaugeMaxPerRow: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count}</option>)}
          </select>
        </div>
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-orientation`} className="form-label fs-7">{t('Gauge Arrangement')}</label>
          <select id={`${id}-orientation`} className="form-select form-select-sm" value={config.auxGaugeOrientation ?? 'horizontal'}
            onChange={event => onConfigPatch({ auxGaugeOrientation: event.target.value as HudConfig['auxGaugeOrientation'] })}>
            <option value="horizontal">{t('Horizontal (rows upward)')}</option>
            <option value="vertical">{t('Vertical (columns upward)')}</option>
          </select>
        </div>
        <div className="col-12">
          <label htmlFor={`${id}-edge`} className="form-label fs-7">{t('Auxiliary Gauges Alignment')}</label>
          <select id={`${id}-edge`} className="form-select form-select-sm" value={config.auxGaugeEdge ?? 'right'}
            onChange={event => onConfigPatch({ auxGaugeEdge: event.target.value as HudConfig['auxGaugeEdge'] })}>
            {(['left', 'right', 'top', 'bottom'] as const).map(edge => <option key={edge} value={edge}>{t(`${edge[0].toUpperCase()}${edge.slice(1)} Edge`)}</option>)}
          </select>
        </div>
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-offset`} className="form-label fs-7">{t('Auxiliary Gauges Edge Offset')} (px)</label>
          <OffsetInput id={`${id}-offset`} min={0} value={config.auxGaugeOffset ?? 0} onCommit={auxGaugeOffset => onConfigPatch({ auxGaugeOffset })} />
          <small className="text-body-secondary">{t('Distance inward from the selected edge.')}</small>
        </div>
        <div className="col-12 col-lg-6">
          <label htmlFor={`${id}-center`} className="form-label fs-7">{t('Auxiliary Gauges Center Offset')} (px)</label>
          <OffsetInput id={`${id}-center`} min={-4000} value={config.auxGaugeCenterOffset ?? 0} onCommit={auxGaugeCenterOffset => onConfigPatch({ auxGaugeCenterOffset })} />
          <small className="text-body-secondary">{t('Along the edge: positive moves down or right; negative moves up or left.')}</small>
        </div>
      </div>
      <fieldset className="border-0 border-top p-0 pt-3 mt-3">
        <legend className="fs-7 fw-bold">{t('Shared Gauge Value Sources')}</legend>
        <p className="text-body-secondary fs-7">{t('Mappings apply to every face reading that value. Source units are converted to the printed gauge units. Native interprets the number as C or PSI.')}</p>
        <p className="text-body-secondary fs-7">{t('Forza does not provide water temperature, oil temperature or oil pressure. Water defaults to average tire temperature; unassigned values show a dash.')}</p>
        {GAUGE_VALUE_KEYS.map(key => <fieldset key={key} className="border-0 p-0 mb-3">
          <legend className="fs-7 text-body-secondary">{t(READINGS[key])}</legend>
          <div className="row g-2">
            <div className="col-12 col-lg-4">
              <label htmlFor={`${id}-${key}-label`} className="form-label fs-7">{t('Value Description')}</label>
              <input id={`${id}-${key}-label`} className="form-control form-control-sm" maxLength={64} value={sources[key].label}
                onChange={event => onConfigPatch({ gaugeValueSources: { ...sources, [key]: { ...sources[key], label: event.target.value } } })} />
            </div>
            <div className="col-12 col-lg-5">
              <label htmlFor={`${id}-${key}-field`} className="form-label fs-7">{t('Telemetry Field')}</label>
              <select id={`${id}-${key}-field`} className="form-select form-select-sm" value={sources[key].field}
                onChange={event => onConfigPatch({ gaugeValueSources: { ...sources, [key]: { ...sources[key], field: event.target.value } } })}>
                {[...new Set([...GAUGE_TELEMETRY_FIELDS, sources[key].field])].map(field => <option key={field} value={field}>{field || t('Unassigned')}</option>)}
              </select>
            </div>
            <div className="col-12 col-lg-3">
              <label htmlFor={`${id}-${key}-unit`} className="form-label fs-7">{t('Source Unit')}</label>
              <select id={`${id}-${key}-unit`} className="form-select form-select-sm" value={sources[key].unit}
                onChange={event => onConfigPatch({ gaugeValueSources: { ...sources, [key]: { ...sources[key], unit: event.target.value as typeof sources[typeof key]['unit'] } } })}>
                {(key.endsWith('Temperature') ? ['native', 'C', 'F'] : ['native', 'psi', 'bar', 'kpa']).map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
          </div>
        </fieldset>)}
      </fieldset>
    </fieldset>
  );
}
