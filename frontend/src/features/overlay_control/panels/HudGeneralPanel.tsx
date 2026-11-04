import { useId } from 'react';
import { DEFAULT_HUD_CONFIG, type HudConfig, type MonitorOption } from '../hudConfig';
import type { HudDisplayUnits } from '../hudDisplayUnits';
import type { HudPanelActions } from '../hudPanelTypes';
import type { HudCapabilitySet } from '../hudCapabilities';
import { HudSettingsSection, HudSwitch } from './HudSettingsControls';
import { HudUnitSettings } from './HudUnitSettings';

export type HudGeneralPanelConfig = Pick<HudConfig, 'selectedMonitorIndex' | 'followAppUnits' | 'units' |
  'useDefaultColors' | 'customColor' | 'audioDeviceId' | 'pauseTelemetryViewWhenActive'>;
export interface HudGeneralPanelProps extends HudPanelActions {
  config: HudGeneralPanelConfig;
  monitors: readonly MonitorOption[];
  appUnits: HudDisplayUnits;
  busy: boolean;
  capabilities: Pick<HudCapabilitySet, 'nativeWindow' | 'monitorSelection' | 'reload'>;
  audioDevices: readonly { id: string; name: string; is_default: boolean }[];
  loadingAudioDevices: boolean;
  onMonitorChange: (index: number) => void;
  onAudioDeviceChange: (deviceId: string) => void;
  onRefreshAudioDevices: () => void;
  onReloadHud: () => void;
  onResetHudConfig: () => void;
}

export function HudGeneralPanel({ config, monitors, appUnits, busy, capabilities, audioDevices, loadingAudioDevices,
  onMonitorChange, onAudioDeviceChange, onRefreshAudioDevices, onReloadHud, onResetHudConfig,
  disabled, onConfigPatch, t }: HudGeneralPanelProps) {
  const id = useId();
  return <fieldset disabled={disabled} className="hud-settings-form">
    <legend className="visually-hidden">{t('General')}</legend>
    <div className="hud-settings-grid">
      <HudSettingsSection title={t('HUD Unit Settings')}>
        <HudUnitSettings followGlobal={config.followAppUnits !== false} units={config.units ?? DEFAULT_HUD_CONFIG.units!}
          globalUnits={appUnits} onConfigPatch={onConfigPatch} t={t} />
      </HudSettingsSection>
      <HudSettingsSection title={t('Shared colors')}>
        <p className="fs-7 text-body-secondary m-0">{t('These colors apply to the main gauge and telemetry cards that support custom colors.')}</p>
        <HudSwitch label={t('Use Default Gauge Colors')} checked={config.useDefaultColors !== false}
          onChange={useDefaultColors => onConfigPatch({ useDefaultColors })} />
        {config.useDefaultColors === false && <label className="d-flex justify-content-between align-items-center gap-2 fs-7">
          {t('Custom Gauge Color')}
          <input type="color" value={config.customColor || DEFAULT_HUD_CONFIG.customColor}
            className="form-control form-control-color" onChange={event => onConfigPatch({ customColor: event.target.value })} />
        </label>}
      </HudSettingsSection>
      <HudSettingsSection title={t('Select Monitor for HUD Overlay')}>
        <label htmlFor={`${id}-monitor`} className="form-label fs-7 m-0">{t('Select Monitor for HUD Overlay')}</label>
        <select id={`${id}-monitor`} className="form-select form-select-sm" value={config.selectedMonitorIndex}
          disabled={busy || capabilities.monitorSelection.status === 'unsupported'}
          title={t(capabilities.monitorSelection.detail)} onChange={event => onMonitorChange(Number(event.target.value))}>
          {monitors.length > 0 ? monitors.map((monitor, index) => <option key={index} value={index}>
            {monitor.name} ({monitor.width}x{monitor.height}) {monitor.is_primary ? `[${t('Primary')}]` : ''}
          </option>) : <option value={0}>{t('Default Primary Display')}</option>}
        </select>
        {capabilities.nativeWindow.status !== 'available' && <p className="fs-7 text-body-secondary m-0">{t(capabilities.nativeWindow.detail)}</p>}
        {capabilities.monitorSelection.status !== 'available' && <p className="fs-7 text-body-secondary m-0">{t(capabilities.monitorSelection.detail)}</p>}
      </HudSettingsSection>
      <HudSettingsSection title={t('Performance & System Options')}>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <label htmlFor={`${id}-source`} className="form-label fs-7 m-0">{t('Audio Capture Source')}</label>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={loadingAudioDevices}
            aria-busy={loadingAudioDevices} onClick={onRefreshAudioDevices}>
            <span className="hud-status-labels">
              <span className={loadingAudioDevices ? 'hud-status-reserved' : ''} aria-hidden={loadingAudioDevices}>{t('Refresh Audio Devices')}</span>
              <span className={loadingAudioDevices ? '' : 'hud-status-reserved'} aria-hidden={!loadingAudioDevices}>{t('Refreshing...')}</span>
            </span>
          </button>
        </div>
        <select id={`${id}-source`} className="form-select form-select-sm" value={config.audioDeviceId || 'default'}
          onChange={event => onAudioDeviceChange(event.target.value)}>
          {audioDevices.length > 0 ? audioDevices.map(device => <option key={device.id} value={device.id}>
            {['System Default Speaker', 'System Default Speaker / 系統預設輸出裝置'].includes(device.name) ? t('System Default Speaker') : device.name}
          </option>) : <option value="default">{t('System Default Speaker')}</option>}
        </select>
        <HudSwitch label={t('Pause Telemetry View when HUD is active')} checked={!!config.pauseTelemetryViewWhenActive}
          onChange={pauseTelemetryViewWhenActive => onConfigPatch({ pauseTelemetryViewWhenActive })} />
        <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy}
          title={t(capabilities.reload.detail)} onClick={onReloadHud}>{t('Refresh HUD List & Reload HTML')}</button>
        <div className="border-top pt-3">
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={onResetHudConfig}>{t('Reset HUD Settings')}</button>
          <p className="text-body-secondary fs-8 mt-2 mb-0">{t('Reset all HUD elements, scaling, colors, and positions to default values.')}</p>
        </div>
      </HudSettingsSection>
    </div>
  </fieldset>;
}
