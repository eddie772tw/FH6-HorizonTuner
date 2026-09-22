import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { backendFetch } from '../../../services/backend';
import { SettingsItem, SettingsSection } from './SettingsPrimitives';
import { generateQrSvg } from '../../../utils/qrCode';

interface CompanionStatus {
  active_connections: number;
  paired_devices_count: number;
  lan_ips: string[];
  port: number;
}

interface QrPayload {
  token: string;
  lan_ips: string[];
  port: number;
  expires_in_secs: number;
  host_name: string;
}

interface PairedDevice {
  id: string;
  name: string;
  platform: string;
  paired_at: string;
  last_connected_at?: string;
}

export const CompanionSettingsCard: React.FC = () => {
  const { t } = useSettings();
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [qrPayload, setQrPayload] = useState<QrPayload | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [loadingQr, setLoadingQr] = useState<boolean>(false);

  const fetchStatusAndDevices = useCallback(async () => {
    try {
      const [statusRes, devicesRes] = await Promise.all([
        backendFetch('/api/companion/status'),
        backendFetch('/api/companion/devices'),
      ]);

      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as CompanionStatus;
        setStatus(statusData);
      }
      if (devicesRes.ok) {
        const devicesData = (await devicesRes.json()) as { devices: PairedDevice[] };
        setDevices(devicesData.devices || []);
      }
    } catch {
      // Ignored if backend status is unreachable
    }
  }, []);

  useEffect(() => {
    void fetchStatusAndDevices();
    const interval = setInterval(fetchStatusAndDevices, 5000);
    return () => clearInterval(interval);
  }, [fetchStatusAndDevices]);

  // QR Code Countdown
  useEffect(() => {
    if (countdown <= 0) {
      if (qrPayload) setQrPayload(null);
      return;
    }
    const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, qrPayload]);

  const handleGenerateQr = async () => {
    setLoadingQr(true);
    try {
      const res = await backendFetch('/api/companion/qr');
      if (res.ok) {
        const data = (await res.json()) as QrPayload;
        setQrPayload(data);
        setCountdown(data.expires_in_secs || 300);
      }
    } catch {
      // Error handling
    } finally {
      setLoadingQr(false);
    }
  };

  const handleRemoveDevice = async (id: string) => {
    try {
      const res = await backendFetch(`/api/companion/devices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        void fetchStatusAndDevices();
      }
    } catch {
      // Error handling
    }
  };

  const activeCount = status?.active_connections || 0;
  const qrString = qrPayload ? JSON.stringify(qrPayload) : '';

  return (
    <SettingsSection
      title={t('Companion APP (Android)')}
      headerAside={(
        <div className="d-flex align-items-center gap-2">
          <span
            className={`badge ${
              activeCount > 0 ? 'text-bg-success' : 'text-bg-secondary'
            } fs-8 fw-semibold`}
          >
            {activeCount > 0
              ? `${activeCount} ${t('DEVICE(S) CONNECTED')}`
              : t('NO ACTIVE CONNECTION')}
          </span>
        </div>
      )}
    >
      <div className="d-flex flex-column gap-3">
        {/* Pairing Section */}
        <SettingsItem
          label={t('Device Pairing')}
          description={t(
            'Connect your Android device via LAN Wi-Fi using an instant QR Code, or connect via USB with zero setup.'
          )}
        >
          <div className="d-flex flex-column gap-2">
            {!qrPayload ? (
              <button
                type="button"
                className="btn btn-sm btn-primary align-self-start"
                onClick={handleGenerateQr}
                disabled={loadingQr}
              >
                {loadingQr ? t('Generating...') : t('Pair New Device (QR Code)')}
              </button>
            ) : (
              <div className="d-flex flex-column align-items-center p-3 rounded bg-dark-subtle border border-secondary-subtle gap-2 text-center">
                <div
                  className="shadow-sm"
                  dangerouslySetInnerHTML={{ __html: generateQrSvg(qrString, 220) }}
                />
                <div className="fs-7 text-muted">
                  {t('Scan this QR code in the HorizonTuner Companion APP.')}
                </div>
                <div className="badge text-bg-warning fs-8">
                  {t('Expires in')}: {Math.floor(countdown / 60)}m {countdown % 60}s
                </div>
                <div className="fs-8 text-secondary font-monospace mt-1">
                  {t('LAN Host')}: {qrPayload.lan_ips.join(', ')}:{qrPayload.port}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary mt-2"
                  onClick={() => setQrPayload(null)}
                >
                  {t('Dismiss QR Code')}
                </button>
              </div>
            )}
          </div>
        </SettingsItem>

        {/* USB Connection Info */}
        <SettingsItem
          label={t('USB Wired Connection (Zero-Config)')}
          description={t(
            'For near-zero latency (<1ms) and jitter-free telemetry without Wi-Fi.'
          )}
        >
          <div className="alert alert-info py-2 px-3 mb-0 fs-8">
            <span className="fw-semibold">{t('How to use USB mode:')}</span>{' '}
            {t(
              'Connect your Android device via USB cable and enable "USB Debugging". When HorizonTuner is running, ADB will automatically forward port 8001, allowing the Companion APP to connect instantly.'
            )}
          </div>
        </SettingsItem>

        {/* Paired Devices List */}
        <SettingsItem
          label={t('Paired Devices')}
          description={t('Manage authorized mobile devices and their session status.')}
        >
          {devices.length === 0 ? (
            <div className="text-secondary fs-8 italic">{t('No devices paired yet.')}</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-dark table-hover mb-0 fs-8 align-middle">
                <thead>
                  <tr>
                    <th>{t('Device Name')}</th>
                    <th>{t('Platform')}</th>
                    <th>{t('Paired At')}</th>
                    <th className="text-end">{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(dev => (
                    <tr key={dev.id}>
                      <td className="fw-semibold text-primary">{dev.name}</td>
                      <td>{dev.platform}</td>
                      <td className="text-secondary">
                        {new Date(dev.paired_at).toLocaleString()}
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-xs btn-outline-danger"
                          onClick={() => handleRemoveDevice(dev.id)}
                          title={t('Unpair this device')}
                        >
                          {t('Unpair')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SettingsItem>
      </div>
    </SettingsSection>
  );
};
