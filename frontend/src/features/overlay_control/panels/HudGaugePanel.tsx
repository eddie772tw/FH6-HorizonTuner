import { useId } from 'react';
import type { HudConfig, HudElements } from '../hudConfig';
import type { HudDisplayUnits } from '../hudDisplayUnits';
import type { HudPanelActions } from '../hudPanelTypes';
import { formatHudDropdownOptions, HUD_DISPLAY_NAMES, type HudAuthorInfo, type HudStyleEntry } from '../hudStyleScanner';
import { HudGaugeStyleSettings, type HudGaugeStyleConfig } from './HudGaugeStyleSettings';
import { HudRange, HudSettingsSection, HudSwitch } from './HudSettingsControls';

export type HudGaugePanelConfig = HudGaugeStyleConfig & Pick<HudConfig, 'scale' | 'glowIntensity'> & {
  elements: Pick<HudElements, 'showGauge' | 'showMotionEffect' | 'showCenterInfo'>;
};

export interface HudGaugePanelProps extends HudPanelActions {
  config: HudGaugePanelConfig;
  styles: HudStyleEntry[];
  author: HudAuthorInfo | null;
  metadataLoading: boolean;
  includeWip: boolean;
  wipForced: boolean;
  appUnits: HudDisplayUnits;
  onShowWipChange: (checked: boolean) => void;
  onS650CenterInfoToggle: () => void;
}

export function HudGaugePanel({ config, styles, author, metadataLoading, includeWip, wipForced,
  appUnits, onShowWipChange, onS650CenterInfoToggle, disabled, onConfigPatch, t }: HudGaugePanelProps) {
  const id = useId();
  const description = metadataLoading ? t('Loading author metadata...')
    : !author ? t('Author metadata unavailable.')
      : ['Loading author metadata...', 'Author metadata unavailable.', 'No description provided.'].includes(author.description)
        ? t(author.description) : author.description;
  return <fieldset disabled={disabled} className="hud-settings-form">
    <legend className="visually-hidden">{t('Main gauge')}</legend>
    <div className="hud-settings-grid">
      <HudSettingsSection title={t('Main gauge')}>
        <HudSwitch label={t('Show main gauge')} checked={config.elements.showGauge !== false}
          onChange={showGauge => onConfigPatch({ elements: { showGauge } })} />
        <p className="fs-7 text-body-secondary m-0">{t('Hidden elements can still be configured. Changes apply when you show them again.')}</p>
        <div>
          <label htmlFor={`${id}-style`} className="form-label fs-7">{t('Speedometer Settings')}</label>
          <select id={`${id}-style`} className="form-select form-select-sm" value={config.hudStyle}
            onChange={event => onConfigPatch({ hudStyle: event.target.value })}>
            {formatHudDropdownOptions(styles, HUD_DISPLAY_NAMES, { includeWip, currentStyle: config.hudStyle }).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <HudSwitch label={`${t('Show WIP Gauges')}${wipForced ? ` (${t('Dev Mode')})` : ''}`}
          checked={includeWip} disabled={wipForced} onChange={onShowWipChange} />
        <div className="hud-author-details p-2 rounded fs-7 text-body-secondary" aria-busy={metadataLoading}>
          <div className="mb-1">{t('Author')}: <strong>{!author || author.author === 'Author' ? t('Author') : author.author}</strong></div>
          <div>{description}</div>
        </div>
        <HudRange label={t('Main gauge scale')} value={config.scale} min={0.5} max={2} step={0.05}
          percent onChange={scale => onConfigPatch({ scale })} />
        <HudRange label={t('Glow Intensity')} value={config.glowIntensity ?? 1} min={0} max={2} step={0.05}
          percent numericInput onChange={glowIntensity => onConfigPatch({ glowIntensity })} />
        <HudSwitch label={t('Motion Effect')} checked={config.elements.showMotionEffect !== false}
          onChange={showMotionEffect => onConfigPatch({ elements: { showMotionEffect } })} />
      </HudSettingsSection>
      <HudSettingsSection title={t('Style-specific settings')}>
        <HudGaugeStyleSettings config={config} appUnits={appUnits} onConfigPatch={onConfigPatch}
          onS650CenterInfoToggle={onS650CenterInfoToggle} t={t} />
      </HudSettingsSection>
    </div>
  </fieldset>;
}
