import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { checkForAppUpdates, isTauriEnvironment, type UpdateInfo } from '../services/updaterService';
import { getAppBuildInfo, formatBuildInfoText, getRemoteReleaseComparison } from '../services/buildInfoService';
import { UpdateModal } from '../components/common/UpdateModal';

export function AppBuildInfo() {
  const { settings, settingsLoaded, t } = useSettings();
  const [buildInfo] = useState(getAppBuildInfo);
  const startupCheck = useRef<Promise<UpdateInfo | null> | null>(null);
  const startupPreference = useRef<boolean | null>(null);
  const [buildText, setBuildText] = useState(() => formatBuildInfoText(buildInfo));
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  useEffect(() => {
    let active = true;
    if (isTauriEnvironment() && settingsLoaded && startupPreference.current === null) {
      startupPreference.current = settings.auto_check_updates !== false;
      if (startupPreference.current) startupCheck.current = checkForAppUpdates();
    }
    startupCheck.current?.then(update => { if (active) setAvailableUpdate(update); })
      .catch(error => { if (active) console.warn('Silent update check failed:', error); });
    if (!isTauriEnvironment() && buildInfo.gitBranch === 'main') {
      getRemoteReleaseComparison('eddie772tw/FH6-HorizonTuner', buildInfo).then(comparison => {
        if (active && comparison) setBuildText(formatBuildInfoText(buildInfo, comparison));
      }).catch(error => console.warn('Release comparison failed:', error));
    }
    return () => { active = false; };
  }, [settingsLoaded, settings.auto_check_updates, buildInfo]);
  return <span id="build-info-badge" className="d-inline-flex align-items-center gap-2 small text-body-secondary">
    {buildText && <span className="badge border text-body-secondary">{buildText}</span>}
    {availableUpdate && <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => setShowUpdate(true)}>{t('Update Available')}: {availableUpdate.version}</button>}
    <UpdateModal updateInfo={availableUpdate} isOpen={showUpdate} onClose={() => setShowUpdate(false)} />
  </span>;
}
