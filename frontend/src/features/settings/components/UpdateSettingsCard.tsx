import React, { useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { useToast } from '../../../context/ToastContext';
import { checkForAppUpdates, UpdateInfo, isTauriEnvironment } from '../../../services/updaterService';
import { UpdateModal } from '../../../components/common/UpdateModal';
import { SettingsSection, SettingsSwitch } from './SettingsPrimitives';

export const UpdateSettingsCard: React.FC = () => {
  const { settings, updateSettings, t } = useSettings();
  const { addToast } = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

  const autoCheck = settings.auto_check_updates !== false;

  const handleCheckUpdate = async () => {
    if (!isTauriEnvironment()) {
      addToast({
        type: 'info',
        title: t('Browser / Dev Mode'),
        message: t('OTA updates are only active in the compiled desktop application.'),
        duration: 4000,
      });
      setLastChecked(new Date().toLocaleTimeString());
      return;
    }

    try {
      setIsChecking(true);
      const update = await checkForAppUpdates();
      setLastChecked(new Date().toLocaleTimeString());

      if (update) {
        setAvailableUpdate(update);
        setShowModal(true);
        addToast({
          type: 'success',
          title: t('Update Available'),
          message: `${t('New version')} ${update.version} ${t('is ready for download.')}`,
          duration: 5000,
        });
      } else {
        setAvailableUpdate(null);
        addToast({
          type: 'info',
          title: t('Up to Date'),
          message: t('You are running the latest version of FH6-HorizonTuner.'),
          duration: 3500,
        });
      }
    } catch (err: any) {
      console.error('[UpdateSettingsCard] Update check failed:', err);
      addToast({
        type: 'danger',
        title: t('Check Failed'),
        message: err?.message || t('Failed to connect to the update server. Please check internet connection.'),
        duration: 5000,
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
      <SettingsSection
        title={t('Software Updates (OTA)')}
        headerAside={(
          <div className="d-flex align-items-center flex-wrap gap-2">
            <span
              className={`badge ${
                availableUpdate ? 'text-bg-warning' : 'text-bg-success'
              } fs-8 fw-semibold`}
            >
              {availableUpdate ? t('UPDATE AVAILABLE') : t('UP TO DATE')}
            </span>
            {lastChecked && (
              <span className="fs-7 text-secondary">
                {t('Last Checked')}: <span className="text-body fw-bold">{lastChecked}</span>
              </span>
            )}
          </div>
        )}
      >
        <SettingsSwitch
          id="chk-auto-check-update"
          label={t('Automatically Check for Updates')}
          description={t('Silently check for new releases when FH6-HorizonTuner launches and notify when a patch is ready.')}
          checked={autoCheck}
          onChange={(event) => updateSettings({ auto_check_updates: event.target.checked })}
        />

        {/* Manual Action & Release Notes Trigger */}
        <div className="settings-row d-flex justify-content-between align-items-center pt-1">
          <div className="d-flex flex-column min-width-0">
            <span className="fs-7 text-body-secondary">
              {t('Endpoint')}: <code className="fs-7 text-primary">GitHub Releases (Ed25519 Signed)</code>
            </span>
            {availableUpdate && (
              <span className="fs-7 text-warning fw-bold mt-1">
                {t('Version')} {availableUpdate.version} {t('is available!')}
              </span>
            )}
          </div>
          <div className="d-flex flex-wrap justify-content-end gap-2 flex-shrink-0">
            {availableUpdate && (
              <button
                type="button"
                className="btn btn-warning btn-sm px-3 fw-bold"
                onClick={() => setShowModal(true)}
              >
                {t('View Update')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm px-3 fw-bold d-flex align-items-center gap-2"
              onClick={handleCheckUpdate}
              disabled={isChecking}
            >
              {isChecking && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />}
              <span>{isChecking ? t('Checking...') : t('Check for Updates')}</span>
            </button>
          </div>
        </div>

      </SettingsSection>

      {/* Glassmorphism Update Modal */}
      <UpdateModal
        updateInfo={availableUpdate}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
};
