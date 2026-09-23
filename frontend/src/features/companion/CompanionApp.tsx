import { useLayoutEffect, useState } from 'react';
import CompanionTelemetry from './CompanionTelemetry';
import CompanionTuning from './CompanionTuning';
import { useCompanionSession } from './useCompanionSession';
import './companion.css';

type CompanionTab = 'telemetry' | 'tuning';

export default function CompanionApp() {
  const [tab, setTab] = useState<CompanionTab>('telemetry');
  const { state, error, notice, commandBusy, send } = useCompanionSession();

  useLayoutEffect(() => {
    // Some Android WebViews report 100vh as zero after Compose resizes the host.
    // The visual viewport remains correct, including rotation and the keyboard.
    const resize = () => document.documentElement.style.setProperty('--companion-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
    resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); };
  }, []);

  const online = Boolean(state?.hostOnline);
  return (
    <main className="companion-app" aria-label="HorizonTuner Companion">
      <header className="companion-header">
        <div>
          <div className="companion-kicker">FH6 HORIZON TUNER</div>
          <h1 className="companion-title">Companion</h1>
        </div>
        <span className={`badge rounded-pill ${online ? 'text-bg-success' : 'text-bg-danger'}`}>
          {online ? 'PC ONLINE' : 'PC OFFLINE'}
        </span>
      </header>

      {(error || notice) && <div className={`companion-message ${error ? 'is-error' : 'is-success'}`} role="status">{error || notice}</div>}
      <nav className="companion-tabs nav nav-pills" aria-label="Companion sections">
        {(['telemetry', 'tuning'] as const).map((item) => (
          <button key={item} className={`nav-link ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)} type="button">
            {item === 'telemetry' ? 'Telemetry' : 'Tuning'}
          </button>
        ))}
      </nav>

      <section className="companion-content">
        {tab === 'telemetry' && <CompanionTelemetry />}
        {tab === 'tuning' && <CompanionTuning state={state} disabled={!online || commandBusy} onCommand={send} />}
      </section>
    </main>
  );
}
