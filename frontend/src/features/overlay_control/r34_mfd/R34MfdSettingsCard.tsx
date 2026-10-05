import { useId } from 'react';
import type { HudConfig } from '../hudConfig';
import { R34_MFD_MODES, type R34MfdMode, type R34Lighting } from './config';
export function R34MfdSettingsCard({ config, onChange, t }: {
  config: HudConfig; onChange: (patch: Partial<HudConfig>) => void; t: (key: string) => string;
}) {
  const id = useId();
  return <div className="border-top pt-2 d-flex flex-column gap-2" role="group" aria-label={t('R34 MFD settings')}>
    <label htmlFor={`${id}-mode`} className="form-label fs-7 text-body-secondary mb-0">{t('R34 MFD mode')}</label>
    <select id={`${id}-mode`} className="form-select form-select-sm" value={config.r34MfdMode ?? 'single'}
      onChange={event => onChange({ r34MfdMode: event.target.value as R34MfdMode })}>
      {R34_MFD_MODES.map(mode => <option key={mode.value} value={mode.value}>{t(mode.label)}</option>)}
    </select>
    <label className="form-check form-switch m-0">
      <input type="checkbox" className="form-check-input" checked={config.r34ShowCluster !== false}
        onChange={event => onChange({ r34ShowCluster: event.target.checked })} />
      <span className="form-check-label fs-7">{t('R34 show instrument cluster')}</span>
    </label>
    <label htmlFor={`${id}-lighting`} className="form-label fs-7 text-body-secondary mb-0">{t('R34 instrument lighting')}</label>
    <select id={`${id}-lighting`} className="form-select form-select-sm" value={config.r34Lighting ?? 'night'}
      onChange={event => onChange({ r34Lighting: event.target.value as R34Lighting })}>
      <option value="night">{t('R34 night lighting')}</option><option value="day">{t('R34 day lighting')}</option>
    </select>
    <p className="small text-body-secondary mb-0">{t('R34 core dials and five NISMO MFD Ver.II pages. Change pages here. Auxiliary gauges show boost and all-four average tire temperature, not coolant. Missing inputs remain N/A.')}</p>
  </div>;
}
