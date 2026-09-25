import { useEffect, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { backendFetch } from '../../../services/backend';
import { SettingsSection } from './SettingsPrimitives';
import CompanionUsbControls from './CompanionUsbControls';
import CompanionLanControls from './CompanionLanControls';

interface CompanionStatus { active_connections: number; port: number }

export function CompanionSettingsCard() {
  const { t } = useSettings();
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await backendFetch('/api/companion/status', { signal: controller.signal });
        if (!response.ok) throw new Error('Status unavailable');
        const next = await response.json() as CompanionStatus;
        if (active) { setStatus(next); setError(false); }
      } catch { if (active) setError(true); }
      finally { if (active) timer = setTimeout(refresh, 2000); }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);
  const count = error ? 0 : status?.active_connections ?? 0;
  return <SettingsSection title={t('Companion APP (Android)')} headerAside={
    <span className={`badge ${count ? 'text-bg-success' : 'text-bg-secondary'}`}>
      {error ? t('Status unavailable') : `${count} ${t('DEVICE(S) CONNECTED')}`}
    </span>
  }>
    <div className="companion-settings-content gap-3 w-100">
      <div className="companion-settings-intro glass-panel p-3">
        <h4 className="h6 text-primary mb-1">{t('USB tablet connection')}</h4>
        <p className="small text-body-secondary mb-0">{t('Keep HorizonTuner open to synchronize vehicle parameters, tuning results and engine measurements.')}</p>
      </div>
      <CompanionUsbControls />
      <CompanionLanControls />
      <ol className="companion-settings-steps list-group list-group-numbered w-100 gap-2">
        <li className="list-group-item d-flex flex-column align-items-start gap-1 glass-panel border rounded p-3">
          <span className="fw-semibold">{t('Install the Companion APK')}</span>
          <span className="small text-body-secondary">{t('Use an Android 13 or newer device.')}</span>
        </li>
        <li className="list-group-item d-flex flex-column align-items-start gap-1 glass-panel border rounded p-3">
          <span className="fw-semibold">{t('Connect and authorize USB debugging')}</span>
          <span className="small text-body-secondary">{t('Connect the USB cable, enable USB debugging and allow this PC on the tablet.')}</span>
        </li>
        <li className="list-group-item d-flex flex-column align-items-start gap-1 glass-panel border rounded p-3">
          <span className="fw-semibold">{t('Select the USB device and connect')}</span>
          <span className="small text-body-secondary">{t('Choose the tablet above and press Connect USB device. The app opens and connects automatically.')}</span>
        </li>
      </ol>
      <div className="companion-settings-preview glass-panel p-3">
        <h4 className="h6 text-primary mb-1">{t('Available in this preview')}</h4>
        <p className="small text-body-secondary mb-2">{t('Live telemetry cards and remote tuning workflow over USB. Android HUD display is deferred.')}</p>
        <p className="small text-body-secondary mb-0">{t('Pair over your local network with a short-lived code, or use USB debugging for a direct development connection.')}</p>
      </div>
    </div>
  </SettingsSection>;
}
