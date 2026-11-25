import { useEffect, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { backendFetch } from '../../../services/backend';
import * as QRCode from 'qrcode';
import { pairingQrContent, type PairingResponse } from './companionPairingQr';
import './CompanionLanControls.css';

const formatTimer = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export default function CompanionLanControls() {
  const { t } = useSettings();
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pairing) return;
    const deadline = Date.now() + pairing.expires_in_secs * 1000;
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const generate = async () => {
    setBusy(true); setError(null); setPairing(null); setQrDataUrl(null); setQrError(false);
    try {
      const response = await backendFetch('/api/companion/lan/pairing', { method: 'POST' });
      const payload = await response.json() as PairingResponse | { detail?: string };
      if (!response.ok) throw new Error('detail' in payload ? payload.detail || t('LAN pairing code could not be created.') : t('LAN pairing code could not be created.'));
      const next = payload as PairingResponse;
      setPairing(next);
      try {
        setQrDataUrl(await QRCode.toDataURL(pairingQrContent(next), { errorCorrectionLevel: 'M', margin: 2, width: 300 }));
      } catch {
        setQrError(true);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('LAN pairing code could not be created.')); }
    finally { setBusy(false); }
  };

  const remainingLabel = formatTimer(remaining);
  const initialDurationLabel = pairing ? formatTimer(pairing.expires_in_secs) : '';

  return <div className="glass-panel p-3 d-flex flex-column gap-2 companion-lan-controls">
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2"><h4 className="h6 text-primary mb-0">{t('Local network pairing')}</h4><span className="d-inline-flex" title={busy ? t('Creating…') : undefined} style={busy ? { cursor: 'not-allowed' } : undefined}><button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center" disabled={busy} aria-busy={busy} style={busy ? { pointerEvents: 'none' } : undefined} onClick={() => void generate()}>{busy && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}{busy ? t('Creating…') : t('Generate pairing code')}</button></span></div>
    <p className="small text-body-secondary mb-0">{t('Use the same trusted local network on the PC and Android device. Scan the QR code in the Companion app, or enter the address and pairing code manually.')}</p>
    <span className="visually-hidden" role="status" aria-live="polite">{pairing && remaining > 0 ? `${t('Pairing code: {code}', { code: pairing.token })} · ${t('Expires in {time}', { time: initialDurationLabel })}` : ''}</span>
    {pairing && remaining > 0 && <div className="companion-lan-pairing">
      <div className="companion-lan-pairing-heading"><span className="small text-body-secondary">{pairing.host_name}</span><span className="badge text-bg-secondary" role="timer" aria-live="off">{t('Expires in {time}', { time: remainingLabel })}</span></div>
      <strong className="companion-lan-token" aria-label={t('Pairing code: {code}', { code: pairing.token })}>{pairing.token}</strong>
      {qrDataUrl && <img className="companion-lan-qr" src={qrDataUrl} alt={t('Scan to pair the Companion app over the local network')} />}
      {qrError && <span className="small text-warning-emphasis" role="status">{t('QR code could not be created. Enter the pairing code and address manually.')}</span>}
      <span className="small text-body-secondary">{pairing.lan_ips.map((ip) => `${ip}:${pairing.port}`).join(' · ')}</span>
    </div>}
    {pairing && remaining === 0 && <p className="small text-warning-emphasis mb-0" role="status">{t('Pairing code expired. Generate a new code to pair another device.')}</p>}
    {error && <div className="companion-message is-error mb-0" role="alert">{error}</div>}
  </div>;
}
