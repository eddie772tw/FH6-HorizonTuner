import { useId } from 'react';
import type { HudConfig } from '../hudConfig';

interface LfaExpansionSettingsCardProps {
  config: HudConfig;
  onChange: (updates: Partial<HudConfig>) => void;
  t: (key: string) => string;
}

export function LfaExpansionSettingsCard({ config, onChange, t }: LfaExpansionSettingsCardProps) {
  const id = useId();
  return (
    <div className="border-top pt-2" role="group" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} className="fs-7 fw-bold mb-2">{t('LFA Ring Expansion')}</h4>
      <div className="form-check form-switch py-1 m-0">
        <input id={`${id}-manual`} type="checkbox" role="switch" className="form-check-input"
          checked={config.lfaManualExpand === true} aria-describedby={`${id}-manual-help`}
          onChange={event => onChange({ lfaManualExpand: event.target.checked })} />
        <label htmlFor={`${id}-manual`} className="form-check-label fs-7">{t('Manually Expand LFA Ring')}</label>
      </div>
      <p id={`${id}-manual-help`} className="text-body-secondary fs-8 mt-1 mb-2">
        {t('Keeps the ring expanded. When off, automatic race or media detection can still keep it expanded.')}
      </p>
      <div className="form-check form-switch py-1 m-0">
        <input id={`${id}-auto`} type="checkbox" role="switch" className="form-check-input"
          checked={config.lfaAutoExpand === true} aria-describedby={`${id}-auto-help`}
          onChange={event => onChange({ lfaAutoExpand: event.target.checked })} />
        <label htmlFor={`${id}-auto`} className="form-check-label fs-7">{t('Automatically Expand for Races or Media')}</label>
      </div>
      <p id={`${id}-auto-help`} className="text-body-secondary fs-8 mt-1 mb-0">
        {t('Shows lap data during a confirmed race; otherwise shows active system media. Restores when neither is available, unless manual expansion is on.')}
      </p>
    </div>
  );
}
