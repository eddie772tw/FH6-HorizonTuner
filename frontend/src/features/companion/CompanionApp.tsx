import { useEffect, useLayoutEffect, useState } from 'react';
import CompanionTelemetry from './CompanionTelemetry';
import CompanionTuning from './CompanionTuning';
import { useCompanionSession } from './useCompanionSession';
import './companion.css';

type CompanionTab = 'telemetry' | 'tuning' | 'connection';
type NativeConnectionState = { state: 'DISCONNECTED' | 'LOADING' | 'CONNECTED' | 'ERROR'; host: string; port: string; error: string | null };

declare global {
  interface Window {
    HorizonTunerCompanion?: {
      connectionStatus: () => string;
      connect: (host: string, port: string) => void;
      disconnect: () => void;
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
  const { state, error, notice, commandBusy, send } = useCompanionSession();
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
  return (
    <main className="companion-app" aria-label="HorizonTuner Companion">
      {(error || (noticeVisible && notice)) && <div className={`companion-message ${error ? 'is-error' : 'is-success is-toast'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
      <nav className="companion-tabs nav nav-pills" aria-label="Companion sections">
        {(['telemetry', 'tuning', 'connection'] as const).map((item) => (
          <button key={item} className={`nav-link ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)} type="button" aria-label={item === 'connection' ? `Connection, PC ${online ? 'online' : 'offline'}` : undefined}>
            {item === 'telemetry' ? 'Telemetry' : item === 'tuning' ? 'Tuning' : <>
              Connection <span className={`companion-status-dot ${online ? 'is-online' : 'is-offline'}`} aria-hidden="true" />
            </>}
          </button>
        ))}
      </nav>

      <section className="companion-content">
        {tab === 'telemetry' && <CompanionTelemetry />}
        {tab === 'tuning' && <CompanionTuning state={state} disabled={!online || commandBusy} onCommand={send} />}
        {tab === 'connection' && (
          <section className="companion-stack" aria-label="Connection settings">
            <article className="companion-panel">
              <h2>Connection</h2>
              <p className="companion-connection-copy">
                {nativeAvailable ? '連線到執行 PC Companion 的電腦。USB ADB 連線會由桌面端自動設定。' : 'Android 連線設定會在 Companion App 中顯示。'}
              </p>
              {nativeAvailable && <>
                <div className="companion-connection-status" role="status">
                  <span className={`badge rounded-pill ${online ? 'text-bg-success' : 'text-bg-danger'}`}>{online ? 'PC ONLINE' : 'PC OFFLINE'}</span>
                  <span className={`badge rounded-pill ${nativeStatus.state === 'CONNECTED' ? 'text-bg-success' : nativeStatus.state === 'ERROR' ? 'text-bg-danger' : 'text-bg-secondary'}`}>
                    {nativeStatus.state === 'CONNECTED' ? 'CONNECTED' : nativeStatus.state === 'LOADING' ? 'CONNECTING' : nativeStatus.state === 'ERROR' ? 'CONNECTION ERROR' : 'DISCONNECTED'}
                  </span>
                  <span>{nativeStatus.host}:{nativeStatus.port}</span>
                </div>
                <div className="companion-form-grid companion-connection-form">
                  <label className="companion-field">Host or HTTP(S) URL
                    <input className="form-control" autoCapitalize="none" autoCorrect="off" value={host} onChange={(event) => setHost(event.target.value)} placeholder="127.0.0.1" />
                  </label>
                  <label className="companion-field">Port
                    <input className="form-control" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="8001" />
                  </label>
                </div>
                {nativeStatus.error && <p className="companion-message is-error" role="alert">{nativeStatus.error}</p>}
                <div className="companion-connection-actions">
                  <button className="btn btn-primary" type="button" disabled={nativeStatus.state === 'LOADING'} onClick={() => window.HorizonTunerCompanion?.connect(host.trim(), port)}>
                    {nativeStatus.state === 'ERROR' ? 'Retry' : 'Connect'}
                  </button>
                  <button className="btn btn-outline-secondary" type="button" disabled={nativeStatus.state === 'DISCONNECTED'} onClick={() => window.HorizonTunerCompanion?.disconnect()}>
                    Disconnect
                  </button>
                </div>
              </>}
            </article>
          </section>
        )}
      </section>
    </main>
  );
}
