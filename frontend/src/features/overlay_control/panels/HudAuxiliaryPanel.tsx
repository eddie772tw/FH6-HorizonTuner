import { useId } from 'react';
import type { HudPanelActions } from '../hudPanelTypes';
import type { HudConfig, HudElements } from '../hudConfig';
import { HudRange, HudSettingsSection, HudSwitch } from './HudSettingsControls';
import { HudGaugeSourcesPanel } from './HudGaugeSourcesPanel';

const FACES = [
  ['aem', 'AEM 30-4408 Boost (PSI)'], ['greddy', 'GReddy Trust Oil Pressure (PSI)'],
  ['blitz', 'Blitz Racing Meter Oil Temp (C)'], ['defi', 'Defi Advance Water Temp (C)'],
  ['speedhut', 'Speedhut Boost (BAR)'],
] as const;

type Props = HudPanelActions & {
  config: Pick<HudConfig, 'auxGaugeFaces' | 'auxGaugeMaxPerRow' | 'auxGaugeOrientation' | 'auxGaugeEdge'
    | 'auxGaugeOffset' | 'auxGaugeCenterOffset' | 'gaugeValueSources'> & {
      elements: Pick<HudElements, 'showAuxiliaryGauges'>;
    };
};

export function HudAuxiliaryPanel({ config, disabled, onConfigPatch, t }: Props) {
  const id = useId();
  const selected = config.auxGaugeFaces ?? ['aem', 'greddy', 'defi'];
  return <fieldset disabled={disabled} className="hud-settings-form">
    <legend className="visually-hidden">{t('Auxiliary Gauges')}</legend>
    <div className="hud-settings-grid">
      <HudSettingsSection title={t('Auxiliary Gauges')}>
        <HudSwitch label={t('Show Auxiliary Gauges')} checked={config.elements.showAuxiliaryGauges === true}
          onChange={showAuxiliaryGauges => onConfigPatch({ elements: { showAuxiliaryGauges } })} />
        <p className="text-body-secondary fs-7 m-0">{t('Show alongside any speedometer style.')}</p>
        <fieldset className="border-0 p-0 m-0">
          <legend className="fs-7 text-body-secondary">{t('Visible Gauge Faces')}</legend>
          <div className="d-flex flex-column gap-2">
            {FACES.map(([face, label]) => <label key={face} className="form-check m-0">
              <input type="checkbox" className="form-check-input" checked={selected.includes(face)} onChange={event =>
                onConfigPatch({ auxGaugeFaces: event.target.checked ? [...selected, face] : selected.filter(item => item !== face) })} />
              <span className="form-check-label fs-7">{t(label)}</span>
            </label>)}
          </div>
        </fieldset>
        <p className="text-body-secondary fs-7 m-0">{t('Hidden elements can still be configured. Changes apply when you show them again.')}</p>
      </HudSettingsSection>
      <HudSettingsSection title={t('Gauge Arrangement')}>
        <div>
          <label htmlFor={`${id}-orientation`} className="form-label fs-7 text-body-secondary">{t('Gauge Arrangement')}</label>
          <select id={`${id}-orientation`} className="form-select form-select-sm" value={config.auxGaugeOrientation ?? 'horizontal'}
            onChange={event => onConfigPatch({ auxGaugeOrientation: event.target.value as HudConfig['auxGaugeOrientation'] })}>
            <option value="horizontal">{t('Horizontal')}</option><option value="vertical">{t('Vertical')}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-count`} className="form-label fs-7 text-body-secondary">{t(config.auxGaugeOrientation === 'vertical' ? 'Maximum Gauges Per Column' : 'Maximum Gauges Per Row')}</label>
          <select id={`${id}-count`} className="form-select form-select-sm" value={config.auxGaugeMaxPerRow ?? 3}
            onChange={event => onConfigPatch({ auxGaugeMaxPerRow: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-edge`} className="form-label fs-7 text-body-secondary">{t('Auxiliary Gauges Alignment')}</label>
          <select id={`${id}-edge`} className="form-select form-select-sm" value={config.auxGaugeEdge ?? 'right'}
            onChange={event => onConfigPatch({ auxGaugeEdge: event.target.value as HudConfig['auxGaugeEdge'] })}>
            {(['left', 'right', 'top', 'bottom'] as const).map(edge => <option key={edge} value={edge}>{t(`${edge[0].toUpperCase()}${edge.slice(1)} Edge`)}</option>)}
          </select>
        </div>
        <HudRange label={t('Auxiliary Gauges Edge Offset')} value={config.auxGaugeOffset ?? 0} min={0} max={4000} step={1} numericInput
          onChange={auxGaugeOffset => onConfigPatch({ auxGaugeOffset })} />
        <p className="text-body-secondary fs-7 m-0">{t('Distance inward from the selected edge.')}</p>
        <HudRange label={t('Auxiliary Gauges Center Offset')} value={config.auxGaugeCenterOffset ?? 0} min={-4000} max={4000} step={1} numericInput
          onChange={auxGaugeCenterOffset => onConfigPatch({ auxGaugeCenterOffset })} />
        <p className="text-body-secondary fs-7 m-0">{t('Along the edge: positive moves down or right; negative moves up or left.')}</p>
      </HudSettingsSection>
      <HudGaugeSourcesPanel sources={config.gaugeValueSources} onConfigPatch={onConfigPatch} t={t} />
    </div>
  </fieldset>;
}
