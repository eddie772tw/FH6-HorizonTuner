import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { backendFetch } from '../../../services/backend';

interface UsbDevice { serial: string; state: 'device' | 'unauthorized' | 'offline'; model?: string; product?: string; transport_id?: string }
interface UsbResponse { devices: UsbDevice[] }
interface ConnectResponse { serial: string; backend_port: number; reverse_local: string; reverse_remote: string; launched: boolean }

export default function CompanionUsbControls() {
  const { t } = useSettings();
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
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

  useEffect(() => { void scan(); }, [scan]);

  const selectedDevice = devices.find((device) => device.serial === selected);
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
    <div className="d-flex justify-content-between align-items-center gap-2"><h4 className="h6 text-primary mb-0">{t('USB device connection')}</h4><button type="button" className="btn btn-sm btn-outline-secondary" disabled={scanning || busy} onClick={() => void scan()}>{scanning ? t('Scanning…') : t('Refresh devices')}</button></div>
    <p className="small text-body-secondary mb-1">{t('Install the Companion APK, enable USB debugging and accept the Android authorization dialog before connecting.')}</p>
    {!devices.length && !scanning && <p className="small text-body-secondary mb-1">{t('No USB devices found. Connect the cable and try Refresh devices.')}</p>}
    {devices.length > 0 && <select className="form-select" value={selected} disabled={busy || scanning} onChange={(event) => { setSelected(event.target.value); setForwarded(null); }} aria-label={t('USB device')}>
      <option value="">{t('Choose a USB device')}</option>
      {devices.map((device) => <option key={device.serial} value={device.serial}>{device.model || device.product || t('Android device')} · {device.serial} · {device.state}</option>)}
    </select>}
    {selectedDevice?.state === 'unauthorized' && <p className="small text-warning mb-0">{t('Unlock the Android device and allow USB debugging for this PC, then refresh devices.')}</p>}
    {selectedDevice?.state === 'offline' && <p className="small text-warning mb-0">{t('Reconnect the USB cable or wake the Android device, then refresh devices.')}</p>}
    <button type="button" className="btn btn-primary w-100" disabled={busy || scanning || selectedDevice?.state !== 'device'} onClick={() => void connect()}>{busy ? t('Connecting…') : t('Connect USB device')}</button>
    {error && <div className="companion-message is-error mb-0" role="alert">{error}</div>}
    {forwarded && <div className="companion-message is-success mb-0" role="status">{t('USB forwarding is active and the Companion app was launched.')} <span className="d-block small">{t('Waiting for active connection…')} ({forwarded.reverse_local} → {forwarded.reverse_remote})</span></div>}
  </div>;
}
