import { useCallback, useId, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { backendFetch } from '../../../services/backend';
import { SettingsSwitch } from './SettingsPrimitives';

interface UsbDevice { serial: string; state: 'device' | 'unauthorized' | 'offline'; model?: string; product?: string; transport_id?: string }
interface UsbResponse { devices: UsbDevice[] }
interface ConnectResponse { serial: string; backend_port: number; reverse_local: string; reverse_remote: string; launched: boolean }

const USB_DEVICE_STATE_KEYS: Record<UsbDevice['state'], string> = {
  device: 'Ready',
  unauthorized: 'Unauthorized',
  offline: 'Offline',
};

export default function CompanionUsbControls() {
  const { settings, updateSettings, t } = useSettings();
  const usbEnabled = !!settings.companion_usb_enabled;
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forwarded, setForwarded] = useState<ConnectResponse | null>(null);

  const scan = useCallback(async () => {
    setScanning(true); setError(null);
    try {
      const response = await backendFetch('/api/companion/usb/devices');
      const payload = await response.json() as UsbResponse | { detail?: string };
      if (!response.ok) throw new Error('detail' in payload ? payload.detail || t('USB device scan unavailable.') : t('USB device scan unavailable.'));
      const next = (payload as UsbResponse).devices || [];
      setDevices(next);
      setSelected((current) => next.some((device) => device.serial === current) ? current : next.length === 1 ? next[0].serial : '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('USB device scan unavailable.')); }
    finally { setScanning(false); }
  }, [t]);

  const stopAdb = async () => {
    setStopping(true); setError(null);
    try {
      const response = await backendFetch('/api/companion/usb/kill', { method: 'POST' });
      if (!response.ok) throw new Error(t('Failed to stop ADB daemon.'));
      setDevices([]);
      setSelected('');
      setForwarded(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Failed to stop ADB daemon.'));
    } finally {
      setStopping(false);
    }
  };

  const id = useId();
  const usbSelectId = `${id}-device`;
  const usbNoticeId = `${id}-notice`;
  const anyBusy = scanning || busy || stopping;
  const busyReason = scanning ? t('Scanning…') : stopping ? t('Stopping…') : busy ? t('Connecting…') : undefined;
  const selectedDevice = devices.find((device) => device.serial === selected);
  const usbNoticeVisible = selectedDevice?.state === 'unauthorized' || selectedDevice?.state === 'offline';
  const connectDisabled = anyBusy || selectedDevice?.state !== 'device';
  const connectReason = busyReason ?? (!selectedDevice ? t('Choose a USB device') : selectedDevice.state !== 'device' ? t('Device not ready') : undefined);
  const connect = async () => {
    if (!selectedDevice || selectedDevice.state !== 'device' || busy) return;
    setBusy(true); setError(null); setForwarded(null);
    try {
      const response = await backendFetch('/api/companion/usb/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial: selectedDevice.serial }) });
      const payload = await response.json() as ConnectResponse | { detail?: string };
      if (!response.ok) throw new Error('detail' in payload ? payload.detail || t('USB forwarding failed.') : t('USB forwarding failed.'));
      setForwarded(payload as ConnectResponse);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('USB forwarding failed.')); }
    finally { setBusy(false); }
  };

  return <div className="glass-panel p-3 d-flex flex-column gap-2">
    <div className="d-flex justify-content-between align-items-center gap-2">
      <h4 className="h6 text-primary mb-0">{t('USB device connection')}</h4>
    </div>
    <SettingsSwitch
      id="chk-companion-usb-enabled"
      label={t('Enable USB connection (ADB)')}
      description={t('Allows connecting Android devices over USB using ADB. Requires USB debugging on the device.')}
      checked={usbEnabled}
      onChange={async (event) => {
        const next = event.target.checked;
        await updateSettings({ companion_usb_enabled: next });
        if (!next) {
          setDevices([]);
          setSelected('');
          setForwarded(null);
        }
      }}
    />
    <p className="small text-body-secondary mb-1">{t('Install the Companion APK, enable USB debugging and accept the Android authorization dialog before connecting.')}</p>
    {!usbEnabled ? (
      <p className="small text-body-secondary mb-0">{t('USB connection is disabled. Enable it above to scan for Android devices.')}</p>
    ) : (
      <>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-1">
          <span className="small text-body-secondary">{t('Manage USB devices and background daemon')}</span>
          <div className="d-flex flex-wrap gap-2">
            <span className="d-inline-flex" title={busyReason} style={anyBusy ? { cursor: 'not-allowed' } : undefined}>
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center" disabled={anyBusy} aria-busy={scanning} style={anyBusy ? { pointerEvents: 'none' } : undefined} onClick={() => void scan()}>
                {scanning && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                {scanning ? t('Scanning…') : t('Refresh devices')}
              </button>
            </span>
            <span className="d-inline-flex" title={busyReason ?? t('Terminate background ADB process to release ports and resources')} style={anyBusy ? { cursor: 'not-allowed' } : undefined}>
              <button type="button" className="btn btn-sm btn-outline-danger d-inline-flex align-items-center" disabled={anyBusy} aria-busy={stopping} style={anyBusy ? { pointerEvents: 'none' } : undefined} onClick={() => void stopAdb()}>
                {stopping && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                {stopping ? t('Stopping…') : t('Stop ADB daemon')}
              </button>
            </span>
          </div>
        </div>
        {!devices.length && !scanning && <p className="small text-body-secondary mb-1">{t('No USB devices found. Connect the cable and try Refresh devices.')}</p>}
        {devices.length > 0 && <><label htmlFor={usbSelectId} className="visually-hidden">{t('USB device')}</label><select id={usbSelectId} className="form-select" value={selected} disabled={anyBusy} onChange={(event) => { setSelected(event.target.value); setForwarded(null); }} aria-label={t('USB device')} aria-describedby={usbNoticeVisible ? usbNoticeId : undefined}>
          <option value="">{t('Choose a USB device')}</option>
          {devices.map((device) => <option key={device.serial} value={device.serial}>{device.model || device.product || t('Android device')} · {device.serial} · {t(USB_DEVICE_STATE_KEYS[device.state] ?? device.state)}</option>)}
        </select></>}
        {selectedDevice?.state === 'unauthorized' && <p id={usbNoticeId} className="small text-warning-emphasis mb-0" role="status">{t('Unlock the Android device and allow USB debugging for this PC, then refresh devices.')}</p>}
        {selectedDevice?.state === 'offline' && <p id={usbNoticeId} className="small text-warning-emphasis mb-0" role="status">{t('Reconnect the USB cable or wake the Android device, then refresh devices.')}</p>}
        <span className="d-flex w-100" title={connectReason} style={connectDisabled ? { cursor: 'not-allowed' } : undefined}>
          <button type="button" className="btn btn-primary w-100 d-inline-flex justify-content-center align-items-center" disabled={connectDisabled} aria-busy={busy} style={connectDisabled ? { pointerEvents: 'none' } : undefined} onClick={() => void connect()}>
            {busy && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
            {busy ? t('Connecting…') : t('Connect USB device')}
          </button>
        </span>
      </>
    )}
    {error && <div className="companion-message is-error mb-0" role="alert">{error}</div>}
    {forwarded && <div className="companion-message is-success mb-0" role="status">{t('USB forwarding is active and the Companion app was launched.')} <span className="d-block small">{t('Waiting for active connection…')} ({forwarded.reverse_local} → {forwarded.reverse_remote})</span></div>}
  </div>;
}
