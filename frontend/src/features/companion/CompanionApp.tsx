import { useEffect, useLayoutEffect, useState } from 'react';
import CompanionTelemetry from './CompanionTelemetry';
import CompanionTuning from './CompanionTuning';
import { useCompanionSession } from './useCompanionSession';
import { getAggregateConnectionStatus } from './connectionStatus';
import { getConnectionDiagnostics } from './connectionDiagnostics';
import './companion.css';

type CompanionTab = 'telemetry' | 'tuning' | 'connection';
type NativeConnectionState = { state: 'DISCONNECTED' | 'LOADING' | 'CONNECTED' | 'ERROR'; host: string; port: string; error: string | null; mode?: 'LAN' | 'USB'; paired?: boolean };

declare global {
  interface Window {
    HorizonTunerCompanion?: {
      connectionStatus: () => string;
      setMode?: (mode: 'LAN' | 'USB') => void;
      pairLan?: (host: string, port: string, token: string) => void;
      connectLan?: () => void;
      scanLanQr?: () => void;
      connect: (host: string, port: string) => void;
      disconnect: () => void;
      updateDesktopStatus?: (online: boolean) => void;
      updateBackendStatus?: (online: boolean) => void;
    };
  }
}

function readNativeStatus(): NativeConnectionState {
  try {
    const raw = window.HorizonTunerCompanion?.connectionStatus();
    if (raw) return JSON.parse(raw) as NativeConnectionState;
  } catch { /* The native bridge may be unavailable while the WebView starts. */ }
  return { state: 'DISCONNECTED', host: '127.0.0.1', port: '8001', error: null };
}

export default function CompanionApp() {
  const [tab, setTab] = useState<CompanionTab>('telemetry');
  const [nativeStatus, setNativeStatus] = useState<NativeConnectionState>(readNativeStatus);
  const [host, setHost] = useState(nativeStatus.host);
  const [port, setPort] = useState(nativeStatus.port);
  const [token, setToken] = useState('');
  const { state, backendOnline, error, notice, commandBusy, send } = useCompanionSession();
  const [noticeVisible, setNoticeVisible] = useState(false);
  const nativeAvailable = Boolean(window.HorizonTunerCompanion);

  useEffect(() => {
    if (!notice) { setNoticeVisible(false); return; }
    setNoticeVisible(true);
    const timeout = window.setTimeout(() => setNoticeVisible(false), 2500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useLayoutEffect(() => {
    // Some Android WebViews report 100vh as zero after Compose resizes the host.
    // The visual viewport remains correct, including rotation and the keyboard.
    const resize = () => document.documentElement.style.setProperty('--companion-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
    resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); };
  }, []);

  useLayoutEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<NativeConnectionState>).detail;
      if (!detail) return;
      setNativeStatus(detail);
      setHost(detail.host);
      setPort(detail.port);
    };
    window.addEventListener('companion-native-connection', update);
    // onPageFinished can publish before React mounts; read the bridge after subscribing.
    const current = readNativeStatus();
    setNativeStatus(current);
    setHost(current.host);
    setPort(current.port);
    return () => window.removeEventListener('companion-native-connection', update);
  }, []);

  const online = Boolean(state?.hostOnline);
  useEffect(() => {
    if (!nativeAvailable) return;
    const handleNativeTab = (event: Event) => {
      const tab = (event as CustomEvent<unknown>).detail;
      if (tab === 'telemetry' || tab === 'tuning') setTab(tab);
    };
    window.addEventListener('companion-native-tab', handleNativeTab);
    return () => window.removeEventListener('companion-native-tab', handleNativeTab);
  }, [nativeAvailable]);

  useEffect(() => {
    if (nativeAvailable) window.HorizonTunerCompanion?.updateDesktopStatus?.(online);
  }, [nativeAvailable, online]);

  useEffect(() => {
    if (nativeAvailable) window.HorizonTunerCompanion?.updateBackendStatus?.(backendOnline);
  }, [nativeAvailable, backendOnline]);

  const connectionStatus = getAggregateConnectionStatus(online, nativeStatus.state === 'CONNECTED');
  const diagnostics = getConnectionDiagnostics({
    mode: nativeStatus.mode,
    host: nativeStatus.host,
    port: nativeStatus.port,
    nativeAvailable,
    nativeState: nativeStatus.state,
    nativeError: nativeStatus.error,
    desktopOnline: online,
    desktopError: error,
    pairingCode: token,
  });
  return (
    <main className="companion-app" aria-label="HorizonTuner Companion">
      {(error || (noticeVisible && notice)) && <div className={`companion-message ${error ? 'is-error' : 'is-success is-toast'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
      {!nativeAvailable && <nav className="companion-tabs nav nav-pills" aria-label="Companion sections">
        {(['telemetry', 'tuning', 'connection'] as const).map((item) => (
          <button key={item} className={`nav-link ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)} type="button" aria-label={item === 'connection' ? `Connection, ${connectionStatus.accessibleLabel}` : undefined}>
            {item === 'telemetry' ? 'Telemetry' : item === 'tuning' ? 'Tuning' : <>
              Connection <span className={`companion-status-dot is-${connectionStatus.color}`} aria-hidden="true" />
            </>}
          </button>
        ))}
      </nav>}

      <section className="companion-content">
        {tab === 'telemetry' && <CompanionTelemetry />}
        {tab === 'tuning' && <CompanionTuning state={state} disabled={!online || commandBusy} onCommand={send} />}
        {tab === 'connection' && !nativeAvailable && (
          <section className="companion-stack companion-connection-stack" aria-label="Connection settings">
            <article className="companion-panel companion-connection-panel">
              <h2>Connection</h2>
              <p className="companion-connection-copy">選擇一般使用的區域網路，或選擇 USB 除錯連線。</p>
                <div className="companion-mode-switch" role="group" aria-label="Connection mode">
                  {(['LAN', 'USB'] as const).map((mode) => <button key={mode} type="button" className={`btn ${nativeStatus.mode === mode || (!nativeStatus.mode && mode === 'LAN') ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={nativeStatus.mode === mode || (!nativeStatus.mode && mode === 'LAN')} onClick={() => { window.HorizonTunerCompanion?.setMode?.(mode); setNativeStatus((current) => ({ ...current, mode })); }}>{mode === 'LAN' ? 'Local network' : 'USB debugging'}</button>)}
                </div>
                <div className="companion-connection-status" role="status">
                  <span className={`badge rounded-pill text-bg-${connectionStatus.color}`} aria-label={connectionStatus.accessibleLabel}>{connectionStatus.label}</span>
                  <span>{diagnostics.address}</span>
                </div>
                {nativeStatus.mode === 'USB' ? <>
                  <div className="companion-form-grid companion-connection-form">
                    <label className="companion-field">USB forwarded host
                      <input className="form-control" autoCapitalize="none" autoCorrect="off" value={host} onChange={(event) => setHost(event.target.value)} placeholder="127.0.0.1" />
                    </label>
                    <label className="companion-field">Port
                      <input className="form-control" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="8001" />
                    </label>
                  </div>
                  <div className="companion-connection-actions">
                    <button className="btn btn-primary" type="button" disabled={nativeStatus.state === 'LOADING'} onClick={() => window.HorizonTunerCompanion?.connect(host.trim(), port)}>{nativeStatus.state === 'ERROR' ? 'Retry USB connection' : 'Connect over USB'}</button>
                    <button className="btn btn-outline-secondary" type="button" disabled={nativeStatus.state === 'DISCONNECTED'} onClick={() => window.HorizonTunerCompanion?.disconnect()}>Disconnect</button>
                  </div>
                </> : <>
                  <div className="companion-lan-primary">
                    <button className="btn btn-primary companion-scan-button" type="button" disabled={!window.HorizonTunerCompanion?.scanLanQr} onClick={() => window.HorizonTunerCompanion?.scanLanQr?.()}>Scan pairing QR</button>
                    <p>Scan the pairing QR code shown in the desktop app to connect over your local network.</p>
                    <div className="companion-connection-actions">
                      <button className="btn btn-primary" type="button" disabled={nativeStatus.state === 'LOADING' || !nativeStatus.paired || !window.HorizonTunerCompanion?.connectLan} onClick={() => window.HorizonTunerCompanion?.connectLan?.()}>{nativeStatus.state === 'ERROR' ? 'Reconnect LAN' : 'Connect over LAN'}</button>
                      <button className="btn btn-outline-secondary" type="button" disabled={nativeStatus.state === 'DISCONNECTED'} onClick={() => window.HorizonTunerCompanion?.disconnect()}>Disconnect</button>
                    </div>
                  </div>
                  <details className="companion-advanced-connection">
                    <summary>Advanced options · manual connection</summary>
                    <div className="companion-advanced-body">
                      <div className="companion-form-grid companion-connection-form">
                        <label className="companion-field">PC local network address
                          <input className="form-control" autoCapitalize="none" autoCorrect="off" value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.20" />
                        </label>
                        <label className="companion-field">Port
                          <input className="form-control" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="8001" />
                        </label>
                      </div>
                      <label className="companion-field companion-token-field">Pairing code
                        <input className="form-control" autoCapitalize="characters" autoCorrect="off" value={token} onChange={(event) => setToken(event.target.value.trim().toUpperCase())} placeholder="Enter code shown on PC" />
                      </label>
                      <button className="btn btn-outline-secondary" type="button" disabled={!host.trim() || !token || !window.HorizonTunerCompanion?.pairLan} onClick={() => window.HorizonTunerCompanion?.pairLan?.(host.trim(), port, token)}>{nativeStatus.paired ? 'Update pairing' : 'Pair with PC'}</button>
                    </div>
                  </details>
                </>}
                <section className="companion-diagnostics" aria-labelledby="companion-diagnostics-title">
                  <h3 id="companion-diagnostics-title">Connection diagnostics</h3>
                  <dl>
                    <div><dt>Mode</dt><dd>{diagnostics.mode}</dd></div>
                    <div><dt>Address</dt><dd>{diagnostics.address}</dd></div>
                    <div><dt>Companion app</dt><dd>{diagnostics.appState}</dd></div>
                    <div><dt>Desktop frontend</dt><dd>{diagnostics.desktopState}</dd></div>
                    {diagnostics.appError && <div className="is-error"><dt>App error</dt><dd>{diagnostics.appError}</dd></div>}
                    {diagnostics.desktopError && <div className="is-error"><dt>Frontend error</dt><dd>{diagnostics.desktopError}</dd></div>}
                  </dl>
                </section>
            </article>
          </section>
        )}
      </section>
    </main>
  );
}
