import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { checkForAppUpdates, isTauriEnvironment, type UpdateInfo } from '../services/updaterService';
import { getAppBuildInfo, formatBuildInfoText, getRemoteReleaseComparison } from '../services/buildInfoService';
import { UpdateModal } from '../components/common/UpdateModal';

export function AppBuildInfo() {
  const { settings, t } = useSettings();
  const buildInfo = getAppBuildInfo();
  const [buildText, setBuildText] = useState(() => formatBuildInfoText(buildInfo));
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  useEffect(() => {
    let active = true;
    if (isTauriEnvironment() && settings.auto_check_updates !== false) {
      checkForAppUpdates().then(update => { if (active) setAvailableUpdate(update); }).catch(error => console.warn('Silent update check failed:', error));
    }
    if (!isTauriEnvironment() && buildInfo.gitBranch === 'main') {
      getRemoteReleaseComparison('eddie772tw/FH6-HorizonTuner', buildInfo).then(comparison => {
        if (active && comparison) setBuildText(formatBuildInfoText(buildInfo, comparison));
      }).catch(error => console.warn('Release comparison failed:', error));
    }
    return () => { active = false; };
  }, [settings.auto_check_updates, buildInfo]);
  return <span id="build-info-badge" className="d-inline-flex align-items-center gap-2 small text-body-secondary">
    {buildText && <span className="badge border text-body-secondary">{buildText}</span>}
    {availableUpdate && <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => setShowUpdate(true)}>{t('Update Available')}: {availableUpdate.version}</button>}
    <UpdateModal updateInfo={availableUpdate} isOpen={showUpdate} onClose={() => setShowUpdate(false)} />
  </span>;
}
