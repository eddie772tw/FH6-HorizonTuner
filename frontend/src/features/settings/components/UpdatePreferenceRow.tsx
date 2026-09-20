import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { SettingsSwitch } from './SettingsPrimitives';

export const UpdatePreferenceRow: React.FC<{ onOpenUpdates: () => void }> = ({ onOpenUpdates }) => {
  const { settings, updateSettings, t } = useSettings();
  return (
    <div className="d-flex flex-column gap-3" data-settings-item="updates">
      <SettingsSwitch
        id="chk-auto-check-update"
        label={t('Automatically Check for Updates')}
        description={t('Silently check for new releases when FH6-HorizonTuner launches and notify when a patch is ready.')}
        checked={settings.auto_check_updates !== false}
        onChange={event => void updateSettings({ auto_check_updates: event.target.checked })}
      />
      <div className="d-flex justify-content-between align-items-center gap-3 border-bottom pb-3">
        <div className="form-text">{t('Manual checks and release notes are available in the Updates surface.')}</div>
        <button type="button" className="btn btn-outline-primary btn-sm flex-shrink-0" onClick={onOpenUpdates}>
          {t('Open Updates')}
        </button>
      </div>
    </div>
  );
};
