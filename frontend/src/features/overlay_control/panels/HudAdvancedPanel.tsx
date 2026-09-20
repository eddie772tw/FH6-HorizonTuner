import { useId } from 'react';
import { DEFAULT_HUD_CONFIG, type HudElements } from '../hudConfig';
import type { HudPanelSharedProps } from '../hudPanelTypes';
import { CLASSIC_JDM_STYLE_ID } from '../classic_jdm/config';
import { ClassicJdmSettingsCard } from '../classic_jdm/ClassicJdmSettingsCard';
import { S650_HMI_STYLE_ID, S650_HMI_THEMES, S650_CENTER_WIDGETS, type S650HmiTheme, type S650CenterWidget } from '../s650/config';

export interface HudAdvancedPanelProps extends HudPanelSharedProps {
  t: (key: string) => string;
  audioDevices: readonly { id: string; name: string; is_default: boolean }[];
  loadingAudioDevices: boolean;
  audioError?: string | null;
  isWipActive: boolean;
  wipForced: boolean;
  /** Owner persists audioDeviceId AND posts /api/audio/device. */
  onAudioDeviceChange: (deviceId: string) => void;
  onRefreshAudioDevices: () => void;
  onShowWipChange: (checked: boolean) => void;
  onElementToggle: (key: keyof HudElements) => void;
  /** Owner restores drive + showCenterInfo when the current widget is disable. */
  onS650CenterInfoToggle: () => void;
  /** Owner confirms, preserves enabled, replaces defaults, reloads and reads back. */
  onResetHudConfig: () => void;
}

function ColorSettings({ config, onConfigPatch, onElementToggle, t }: HudAdvancedPanelProps) {
  const id = useId();
  const changeGlow = (value: number) => onConfigPatch({ glowIntensity: Math.max(0, Math.min(2, value)) });
  return (
    <section className="col-12 col-lg-4 d-flex flex-column gap-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">{t('HUD Style Settings')}</h3>
      <div>
        <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
          <label htmlFor={`${id}-glow`} className="fs-7 text-body-secondary">{t('Glow Intensity')}:</label>
          <div className="d-flex align-items-center gap-1">
            <input type="number" min={0} max={200} value={Math.round((config.glowIntensity ?? 1) * 100)}
              aria-label={t('Glow Intensity')} className="form-control form-control-sm text-center fw-bold text-primary"
              style={{ width: '65px' }} onChange={event => changeGlow(Number(event.target.value) / 100)} />
            <span className="text-primary fw-bold fs-7">%</span>
          </div>
        </div>
        <input id={`${id}-glow`} type="range" className="form-range" min={0} max={2} step={0.05}
          value={config.glowIntensity ?? 1} onChange={event => changeGlow(Number(event.target.value))} />
      </div>
      <label className="form-check form-switch py-1 m-0">
        <input type="checkbox" className="form-check-input" checked={config.useDefaultColors !== false}
          onChange={() => onConfigPatch({ useDefaultColors: !(config.useDefaultColors !== false) })} />
        <span className="form-check-label fs-7">{t('Use Default Gauge Colors')}</span>
      </label>
      {config.useDefaultColors === false && (
        <label className="d-flex justify-content-between align-items-center gap-2 fs-7 text-body-secondary">
          {t('Custom Gauge Color')}:
          <input type="color" value={config.customColor || DEFAULT_HUD_CONFIG.customColor}
            className="form-control form-control-color" style={{ width: '45px', height: '28px' }}
            onChange={event => onConfigPatch({ customColor: event.target.value })} />
        </label>
      )}
      <label className="form-check form-switch py-1 m-0">
        <input type="checkbox" className="form-check-input" checked={config.elements.showMotionEffect !== false}
          onChange={() => onElementToggle('showMotionEffect')} />
        <span className="form-check-label fs-7">{t('Motion Effect')}</span>
      </label>
    </section>
  );
}

function StyleSettings({ config, onConfigPatch, isWipActive, wipForced, onShowWipChange, onS650CenterInfoToggle, t }: HudAdvancedPanelProps) {
  const id = useId();
  const centerEnabled = config.s650CenterWidget !== 'disable' && config.elements.showCenterInfo !== false;
  return (
    <section className="col-12 col-lg-4 d-flex flex-column gap-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">{t('Speedometer Settings')}</h3>
      <label className="form-check form-switch py-1 m-0">
        <input type="checkbox" className="form-check-input" checked={isWipActive} disabled={wipForced}
          onChange={event => onShowWipChange(event.target.checked)} />
        <span className="form-check-label fs-7 text-body-secondary">
          {t('Show WIP Gauges')}{wipForced && <span className="badge text-bg-secondary ms-1 fs-8">{t('Dev Mode')}</span>}
        </span>
      </label>
      {config.hudStyle === S650_HMI_STYLE_ID && (
        <div className="border-top pt-2">
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
      {config.hudStyle === CLASSIC_JDM_STYLE_ID && <ClassicJdmSettingsCard config={config} onChange={onConfigPatch} t={t} />}
      {config.hudStyle === 'vfd' && (
        <div className="border-top pt-2 d-flex flex-column gap-3">
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
    </section>
  );
}

function SystemSettings({ config, onConfigPatch, audioDevices, loadingAudioDevices, audioError, onAudioDeviceChange, onRefreshAudioDevices, onResetHudConfig, t }: HudAdvancedPanelProps) {
  const id = useId();
  return (
    <section className="col-12 col-lg-4 d-flex flex-column gap-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">{t('Performance & System Options')}</h3>
      <div className="border-bottom pb-3">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-1">
          <label htmlFor={`${id}-source`} className="form-label fs-7 text-body-secondary mb-0">{t('Audio Capture Source')}:</label>
          <button type="button" className="btn btn-outline-secondary btn-sm py-0 px-2 fs-8" disabled={loadingAudioDevices}
            aria-busy={loadingAudioDevices} onClick={onRefreshAudioDevices}>
            {loadingAudioDevices ? <><span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />{t('Refreshing...')}</> : t('Refresh Audio Devices')}
          </button>
        </div>
        <select id={`${id}-source`} className="form-select form-select-sm" value={config.audioDeviceId || 'default'}
          onChange={event => onAudioDeviceChange(event.target.value)}>
          {audioDevices.length > 0 ? audioDevices.map(device => (
            <option key={device.id} value={device.id}>{device.name === 'System Default Speaker / 系統預設輸出裝置' ? t('System Default Speaker') : device.name}</option>
          )) : <option value="default">{t('System Default Speaker')}</option>}
        </select>
        <span className="text-danger fs-7" role="alert">{audioError}</span>
      </div>
      <label className="form-check form-switch py-1 m-0">
        <input type="checkbox" className="form-check-input" checked={!!config.pauseTelemetryViewWhenActive}
          onChange={event => onConfigPatch({ pauseTelemetryViewWhenActive: event.target.checked })} />
        <span className="form-check-label fs-7">{t('Pause Telemetry View when HUD is active')}</span>
      </label>
      <div className="pt-3 border-top mt-auto">
        <button type="button" className="btn btn-outline-danger btn-sm w-100 fw-bold py-2" onClick={onResetHudConfig}>{t('Reset HUD Settings')}</button>
        <span className="d-block text-body-secondary fs-8 mt-1 text-center">{t('Reset all HUD elements, scaling, colors, and positions to default values.')}</span>
      </div>
    </section>
  );
}

export function HudAdvancedPanel(props: HudAdvancedPanelProps) {
  return (
    <fieldset disabled={props.disabled} className="border-0 p-0 m-0 row g-4" style={{ minWidth: 0 }}>
      <legend className="visually-hidden">{props.t('Performance & System Options')}</legend>
      <ColorSettings {...props} /><StyleSettings {...props} /><SystemSettings {...props} />
    </fieldset>
  );
}

export default HudAdvancedPanel;
