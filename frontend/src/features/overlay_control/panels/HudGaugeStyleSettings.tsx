import { useId } from 'react';
import { R34MfdSettingsCard } from '../r34_mfd/R34MfdSettingsCard';
import type { HudDisplayUnits } from '../hudDisplayUnits';
import { STACK_ST8100_STYLE_ID } from '../stack_st8100/config';
import { StackSt8100SettingsCard } from '../stack_st8100/StackSt8100SettingsCard';
import type { HudConfig, HudElements } from '../hudConfig';
import type { HudPanelActions } from '../hudPanelTypes';
import { CLASSIC_JDM_STYLE_ID } from '../classic_jdm/config';
import { ClassicJdmSettingsCard } from '../classic_jdm/ClassicJdmSettingsCard';
import { LFA_CENTER_RING_STYLE_ID } from '../lfa_center_ring/config';
import { LfaExpansionSettingsCard } from '../lfa_center_ring/LfaExpansionSettingsCard';
import { S650_HMI_STYLE_ID, S650_HMI_THEMES, S650_CENTER_WIDGETS, type S650HmiTheme, type S650CenterWidget } from '../s650/config';

export type HudGaugeStyleConfig = Pick<HudConfig,
  'hudStyle' | 'followAppUnits' | 'units' | 's650Theme' | 's650CenterWidget' |
  'classicJdmTachStyle' | 'classicJdmShowTriple' | 'classicJdmAux1' | 'classicJdmAux2' | 'classicJdmDefiTheme' |
  'r34MfdMode' | 'r34ShowCluster' | 'r34ShowMfd' | 'r34Lighting' | 'lfaManualExpand' | 'lfaAutoExpand' |
  'vfdVuOffset' | 'vfdAudioOffset' | 'nfsu2Face' | keyof import('../stack_st8100/config').StackSt8100Settings
> & { elements: Pick<HudElements, 'showCenterInfo'> };
interface HudGaugeStyleSettingsProps extends HudPanelActions {
  config: HudGaugeStyleConfig;
  appUnits: HudDisplayUnits;
  onS650CenterInfoToggle: () => void;
}

export function HudGaugeStyleSettings({ config, appUnits, onConfigPatch, onS650CenterInfoToggle, t }: HudGaugeStyleSettingsProps) {
  const id = useId();
  const centerEnabled = config.s650CenterWidget !== 'disable' && config.elements.showCenterInfo !== false;
  return (
    <div className="d-flex flex-column gap-3">
      {![S650_HMI_STYLE_ID, STACK_ST8100_STYLE_ID, CLASSIC_JDM_STYLE_ID, LFA_CENTER_RING_STYLE_ID, 'r34_mfd', 'vfd', 'nfsu2'].includes(config.hudStyle) &&
        <p className="fs-7 text-body-secondary m-0">{t('This style has no additional settings.')}</p>}
      {config.hudStyle === S650_HMI_STYLE_ID && (
        <div>
          <label htmlFor={`${id}-theme`} className="form-label fs-7 text-body-secondary mb-1">{t('S650 HMI Mode')}:</label>
          <select id={`${id}-theme`} className="form-select form-select-sm fw-bold" value={config.s650Theme ?? 'heritage67'}
            onChange={event => onConfigPatch({ hudStyle: S650_HMI_STYLE_ID, s650Theme: event.target.value as S650HmiTheme })}>
            {S650_HMI_THEMES.map(theme => <option key={theme.value} value={theme.value}>{t(theme.label)}</option>)}
          </select>
          <div className="d-flex justify-content-between align-items-center gap-2 mt-2 mb-1">
            <label htmlFor={`${id}-center`} className="form-label fs-7 text-body-secondary mb-0">{t('S650 center information')}:</label>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={t('S650 center information')}
              aria-pressed={centerEnabled} onClick={onS650CenterInfoToggle}>{t(centerEnabled ? 'Enabled' : 'Disabled')}</button>
          </div>
          <select id={`${id}-center`} className="form-select form-select-sm fw-bold" value={config.s650CenterWidget ?? 'drive'}
            onChange={event => onConfigPatch({ hudStyle: S650_HMI_STYLE_ID, s650CenterWidget: event.target.value as S650CenterWidget })}>
            {S650_CENTER_WIDGETS.map(widget => <option key={widget.value} value={widget.value}>{t(widget.label)}</option>)}
          </select>
        </div>
      )}
      {config.hudStyle === STACK_ST8100_STYLE_ID && <StackSt8100SettingsCard config={config} appUnits={appUnits} onChange={onConfigPatch} t={t} />}
      {config.hudStyle === CLASSIC_JDM_STYLE_ID && <ClassicJdmSettingsCard config={config} onChange={onConfigPatch} t={t} />}
      {config.hudStyle === LFA_CENTER_RING_STYLE_ID && <LfaExpansionSettingsCard config={config} onChange={onConfigPatch} t={t} />}
      {config.hudStyle === 'r34_mfd' && <R34MfdSettingsCard config={config} onChange={onConfigPatch} t={t} />}
      {config.hudStyle === 'nfsu2' && (
        <div>
          <label htmlFor={`${id}-nfsu2-face`} className="form-label fs-7 text-body-secondary mb-1">{t('NFSU2 Custom Faceplate')}:</label>
          <select id={`${id}-nfsu2-face`} className="form-select form-select-sm fw-bold" value={config.nfsu2Face ?? 3}
            onChange={event => onConfigPatch({ hudStyle: 'nfsu2', nfsu2Face: Number(event.target.value) })}>
            <option value={3}>{t('Tabby Cat (Ice Blue)')}</option>
            <option value={0}>{t('Stock OEM (Ice Blue)')}</option>
            <option value={1}>{t('Hot Rod Flames (Orange)')}</option>
            <option value={2}>{t('Street Tribal (Cyan)')}</option>
            <option value={4}>{t('Biohazard Skull (Lime)')}</option>
            <option value={5}>{t('Redline Classic (Crimson)')}</option>
            <option value={6}>{t('Gold Chrono (Gold)')}</option>
            <option value={7}>{t('Techno Arc (Aqua)')}</option>
            <option value={8}>{t('Speed Pulse (Indigo)')}</option>
            <option value={9}>{t('Circuit Board (Emerald)')}</option>
            <option value={10}>{t('Bling Edition (Gold)')}</option>
          </select>
        </div>
      )}
      {/* TODO(subsystems): restore minimap controls only after module evaluation. */}
      {config.hudStyle === 'vfd' && (
        <div className="d-flex flex-column gap-3">
          <div>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label htmlFor={`${id}-vu`} className="fs-7 text-body-secondary">{t('VU Offset:')}</label>
              <span className="text-primary fw-bold fs-7">{config.vfdVuOffset ?? 0}</span>
            </div>
            <input id={`${id}-vu`} type="range" className="form-range" min={-5} max={5} step={1} aria-label={t('VU Offset')}
              value={config.vfdVuOffset ?? 0} onChange={event => onConfigPatch({ vfdVuOffset: Math.max(-5, Math.min(5, Number(event.target.value))) })} />
          </div>
          <div>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label htmlFor={`${id}-audio`} className="fs-7 text-body-secondary">{t('Audio Visualizer Offset:')}</label>
              <span className="text-primary fw-bold fs-7">{config.vfdAudioOffset ?? 0}</span>
            </div>
            <input id={`${id}-audio`} type="range" className="form-range" min={-5} max={5} step={1} aria-label={t('Audio Visualizer Offset')}
              value={config.vfdAudioOffset ?? 0} onChange={event => onConfigPatch({ vfdAudioOffset: Math.max(-5, Math.min(5, Number(event.target.value))) })} />
          </div>
        </div>
      )}
    </div>
  );
}
