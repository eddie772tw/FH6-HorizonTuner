import type { HudCapability } from './hudCapabilities';

export function HudWindowAction({ enabled, busy, disabled, capability, onToggle, t }: {
  enabled: boolean; busy: boolean; disabled: boolean; capability: HudCapability;
  onToggle: (enabled: boolean) => void; t: (key: string) => string;
}) {
  return <span className="d-inline-flex" title={busy ? t('Please wait, HUD is currently launching or closing...') : t(capability.detail)}>
    <button type="button" className={`hud-window-action btn btn-sm fw-bold ${enabled ? 'btn-outline-danger' : 'btn-primary'}`}
      disabled={disabled || busy || capability.status === 'unsupported'} aria-busy={busy} onClick={() => onToggle(!enabled)}>
      <span className={`hud-window-action-icon${busy ? ' spinner-border spinner-border-sm' : ''}`} aria-hidden="true" />
      <span className="hud-status-labels">
        <span className={enabled ? 'hud-status-reserved' : ''} aria-hidden={enabled}>{t('Launch HUD Overlay')}</span>
        <span className={enabled ? '' : 'hud-status-reserved'} aria-hidden={!enabled}>{t('Close HUD Overlay')}</span>
      </span>
    </button>
  </span>;
}
