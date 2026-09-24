import { useId } from 'react';
import type { HudPanelSharedProps } from '../hudPanelTypes';
import type { HudCapabilitySet } from '../hudCapabilities';
import type { MonitorOption } from '../hudConfig';
import {
  formatHudDropdownOptions,
  HUD_DISPLAY_NAMES,
  type HudAuthorInfo,
} from '../hudStyleScanner';

/** Page/controller owns reads, normalization, native actions and the units portal. */
export interface HudSetupPanelProps extends HudPanelSharedProps {
  t: (key: string) => string;
  monitors: readonly MonitorOption[];
  author: HudAuthorInfo | null;
  metadataLoading: boolean;
  includeWip: boolean;
  busy: boolean;
  capabilities: Pick<HudCapabilitySet, 'nativeWindow' | 'monitorSelection' | 'reload'>;
  onToggleHud: (enabled: boolean) => void;
  onStyleChange: (style: string) => void;
  onMonitorChange: (index: number) => void;
  onReloadHud: () => void;
  onOpenUnitSettings: () => void;
}

export function HudSetupPanel({
  config, styles, disabled = false, onConfigPatch, t, monitors, author,
  metadataLoading, includeWip, busy, capabilities,
  onToggleHud, onStyleChange, onMonitorChange, onReloadHud, onOpenUnitSettings,
}: HudSetupPanelProps) {
  const id = useId();
  const authorDescription = metadataLoading
    ? t('Loading author metadata...')
    : !author ? t('Author metadata unavailable.')
      : ['Loading author metadata...', 'Author metadata unavailable.', 'No description provided.'].includes(author.description)
        ? t(author.description) : author.description;

  return (
    <section className="d-flex flex-column gap-3" aria-label={t('Setup')}>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 border-bottom pb-2">
        <div>
          <p className="text-body-secondary fs-7 mb-0">
            {t('Full-screen borderless transparent HUD overlay for Forza Horizon 6')}
          </p>
        </div>
        <div className="d-flex align-items-center flex-wrap gap-2">
          <button
            type="button"
            className={`hud-window-action btn btn-sm fw-bold ${config.enabled ? 'btn-outline-danger' : 'btn-primary'}`}
            disabled={disabled || busy || capabilities.nativeWindow.status === 'unsupported'}
            title={busy ? t('Please wait, HUD is currently launching or closing...') : capabilities.nativeWindow.detail}
            aria-busy={busy}
            onClick={() => onToggleHud(!config.enabled)}
          >
            <span className={`hud-window-action-icon${busy ? ' spinner-border spinner-border-sm' : ''}`} aria-hidden="true" />
            <span className="hud-status-labels">
              <span className={config.enabled ? 'hud-status-reserved' : ''} aria-hidden={config.enabled}>{t('Launch HUD Overlay')}</span>
              <span className={config.enabled ? '' : 'hud-status-reserved'} aria-hidden={!config.enabled}>{t('Close HUD Overlay')}</span>
            </span>
          </button>
        </div>
      </div>
      {capabilities.nativeWindow.status !== 'available' && (
        <p className="text-body-secondary fs-7 mb-0" role="status">{capabilities.nativeWindow.detail}</p>
      )}

      <fieldset disabled={disabled} className="border-0 p-0 m-0 row g-3" style={{ minWidth: 0 }}>
        <legend className="visually-hidden">{t('Speedometer Settings')}</legend>
        <div className="col-12 col-lg-6 d-flex flex-column gap-3">
          <div>
            <label htmlFor={`${id}-style`} className="form-label fs-7 text-body-secondary">{t('Speedometer Settings')}</label>
            <select id={`${id}-style`} className="form-select form-select-sm fw-bold" value={config.hudStyle}
              disabled={config.elements.showGauge === false} onChange={event => onStyleChange(event.target.value)}>
              {formatHudDropdownOptions(styles, HUD_DISPLAY_NAMES, { includeWip, currentStyle: config.hudStyle }).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-outline-primary btn-sm fw-bold py-2" disabled={busy}
            title={capabilities.reload.detail} onClick={onReloadHud}>
            {t('Refresh HUD List & Reload HTML')}
          </button>
          <div className="hud-author-details p-2 rounded" aria-busy={metadataLoading}>
            <div className="fs-7 text-body-secondary mb-1">
              {t('Author')}: <strong className="text-primary">{!author || author.author === 'Author' ? t('Author') : author.author}</strong>
            </div>
            <div className="fs-7 text-body-secondary">{authorDescription}</div>
          </div>
        </div>
        <div className="col-12 col-lg-6 d-flex flex-column gap-3">
          <div>
            <label htmlFor={`${id}-monitor`} className="form-label fs-7 text-body-secondary">{t('Select Monitor for HUD Overlay')}:</label>
            <select id={`${id}-monitor`} className="form-select form-select-sm" value={config.selectedMonitorIndex}
              disabled={busy || capabilities.monitorSelection.status === 'unsupported'}
              title={capabilities.monitorSelection.detail} onChange={event => onMonitorChange(Number(event.target.value))}>
              {monitors.length > 0 ? monitors.map((monitor, index) => (
                <option key={index} value={index}>
                  {monitor.name} ({monitor.width}x{monitor.height}) {monitor.is_primary ? `[${t('Primary')}]` : ''}
                </option>
              )) : <option value={0}>{t('Default Primary Display')}</option>}
            </select>
            {capabilities.monitorSelection.status !== 'available' && (
              <span className="d-block text-body-secondary fs-7 mt-1">{capabilities.monitorSelection.detail}</span>
            )}
          </div>
          <div>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label htmlFor={`${id}-scale`} className="fs-7 text-body-secondary">{t('Overall HUD Scale')}:</label>
              <span className="text-primary fw-bold fs-7">{Math.round(config.scale * 100)}%</span>
            </div>
            <input id={`${id}-scale`} type="range" className="form-range" min={0.5} max={2} step={0.05} value={config.scale}
              onChange={event => onConfigPatch({ scale: Math.max(0.5, Math.min(2, Number(event.target.value))) })} />
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onOpenUnitSettings}>
            {t('HUD Unit Settings')}
          </button>
        </div>
      </fieldset>
    </section>
  );
}

export default HudSetupPanel;
