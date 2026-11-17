import { useEffect, useId, useRef, useState } from 'react';
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
  onResetHudConfig: () => Promise<boolean>;
}

export function HudGeneralPanel({ config, monitors, appUnits, busy, capabilities, audioDevices, loadingAudioDevices,
  onMonitorChange, onAudioDeviceChange, onRefreshAudioDevices, onReloadHud, onResetHudConfig,
  disabled, onConfigPatch, t }: HudGeneralPanelProps) {
  const id = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [resetting, setResetting] = useState(false);
  const resetInFlight = useRef(false);
  const formRef = useRef<HTMLFieldSetElement>(null);
  const resetBtnRef = useRef<HTMLButtonElement>(null);
  const cancelResetBtnRef = useRef<HTMLButtonElement>(null);
  const hadConfirmation = useRef(false);
  const nativeUnavailable = capabilities.nativeWindow.status !== 'available';
  const monitorUnavailable = capabilities.monitorSelection.status !== 'available';
  const monitorDescribedBy = [
    nativeUnavailable ? `${id}-native-detail` : '',
    monitorUnavailable ? `${id}-monitor-detail` : '',
  ].filter(Boolean).join(' ') || undefined;
  const cancelReset = () => {
    setConfirmReset(false);
  };
  useEffect(() => { if (disabled) setConfirmReset(false); }, [disabled]);
  useEffect(() => {
    const active = document.activeElement;
    const ownsFocus = active === document.body || formRef.current?.contains(active);
    if (!disabled && !resetting && ownsFocus) {
      if (confirmReset) cancelResetBtnRef.current?.focus();
      else if (hadConfirmation.current) resetBtnRef.current?.focus();
    }
    hadConfirmation.current = confirmReset;
  }, [confirmReset, disabled, resetting]);
  const confirmResetAction = async () => {
    if (disabled || resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    setResetStatus('');
    try {
      if (await onResetHudConfig()) {
        setConfirmReset(false);
        setResetStatus(t('HUD settings synchronized'));
      }
    } catch {
      setResetStatus(t('Needs attention'));
    } finally {
      resetInFlight.current = false;
      setResetting(false);
    }
  };
  return <fieldset ref={formRef} disabled={disabled || resetting} className="hud-settings-form" aria-busy={resetting}>
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
          aria-describedby={monitorDescribedBy}
          title={t(capabilities.monitorSelection.detail)} onChange={event => onMonitorChange(Number(event.target.value))}>
          {monitors.length > 0 ? monitors.map((monitor, index) => <option key={index} value={index}>
            {monitor.name} ({monitor.width}x{monitor.height}) {monitor.is_primary ? `[${t('Primary')}]` : ''}
          </option>) : <option value={0}>{t('Default Primary Display')}</option>}
        </select>
        {nativeUnavailable && <p id={`${id}-native-detail`} className="fs-7 text-body-secondary m-0">{t(capabilities.nativeWindow.detail)}</p>}
        {monitorUnavailable && <p id={`${id}-monitor-detail`} className="fs-7 text-body-secondary m-0">{t(capabilities.monitorSelection.detail)}</p>}
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
          <div className="visually-hidden" role="status" aria-live="polite">{resetStatus}</div>
          {confirmReset ? (
            <div className="d-flex flex-column gap-2" role="group" aria-labelledby={`${id}-reset-confirm-label`}
              onKeyDownCapture={event => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                if (!resetInFlight.current) cancelReset();
              }}>
              <p id={`${id}-reset-confirm-label`} className="fs-7 fw-semibold mb-0" style={{ color: 'var(--bs-danger-text-emphasis)' }}>
                {t('Are you sure you want to reset all HUD settings?')}
              </p>
              <div className="d-flex flex-wrap gap-2">
                <button ref={cancelResetBtnRef} type="button" className="btn btn-outline-secondary btn-sm" onClick={cancelReset}>{t('Cancel')}</button>
                <button type="button" className="btn btn-danger btn-sm fw-bold" onClick={confirmResetAction}>{t('Reset HUD Settings')}</button>
              </div>
            </div>
          ) : (
            <>
              <button ref={resetBtnRef} type="button" className="btn btn-outline-danger btn-sm"
                aria-describedby={`${id}-reset-help`}
                onClick={() => { setResetStatus(''); setConfirmReset(true); }}>{t('Reset HUD Settings')}</button>
              <p id={`${id}-reset-help`} className="text-body-secondary fs-8 mt-2 mb-0">{t('Reset all HUD elements, scaling, colors, and positions to default values.')}</p>
            </>
          )}
        </div>
      </HudSettingsSection>
    </div>
  </fieldset>;
}
