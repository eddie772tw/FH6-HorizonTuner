import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { fetchRuntimeInfo, getRuntimeCapabilities, type RuntimeInfo } from '../../services/runtimeCapabilities';
import { dataOutDestinations } from './dataOutAddresses';

export function DataOutDestination() {
  const { settings, t } = useSettings();
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setInfo(null); setFailed(false);
    void fetchRuntimeInfo(controller.signal).then(value => {
      if (!controller.signal.aborted) setInfo(value);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [settings.telemetry_port]);
  const destinations = dataOutDestinations(info);
  return <section className="border rounded p-3 mb-3" aria-label={t('Data Out destination')}>
    <p className="mb-2">{t('On the device running FH6, send Data Out to this computer on the same local network.')}</p>
    {info ? <>
      <div>{destinations.length > 0 ? destinations.map(destination =>
        <code key={destination} className="d-block">{destination}</code>)
        : <span role="status">{t('No LAN receiver address is available. Connect this computer to the local network and restart the app.')}</span>}</div>
      {getRuntimeCapabilities().hudOverlay && info.telemetry.port && <p className="small mt-2 mb-0">
        {t('When Forza runs on this PC, use destination IP')} <code>127.0.0.1</code>{' '}
        {t('and UDP port')} <code>{info.telemetry.port}</code>.
      </p>}
      {info.telemetry.error && <p className="small text-danger mb-0" role="status">{info.telemetry.error}</p>}
    </> : <span role="status">{t(failed ? 'Receiver addresses are unavailable.' : 'Loading receiver addresses…')}</span>}
    <p className="small text-secondary mt-2 mb-0">{t('Choose the address on the game device’s network. Allow incoming UDP on the displayed port; after changing networks, restart the app.')}</p>
  </section>;
}
