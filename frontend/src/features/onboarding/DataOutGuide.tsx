import { useEffect, useRef } from 'react';
import type { TelemetryHealth } from './telemetryHealth';
import { saveDataOutGuideChoice } from './telemetryHealth';
import { ModalPortal } from '../../components/common/ModalPortal';

interface DataOutGuideProps {
  health: TelemetryHealth;
  open: boolean;
  onClose: () => void;
}

const badgeClass: Record<TelemetryHealth['state'], string> = {
  active: 'text-bg-success',
  stale: 'text-bg-warning',
  waiting: 'text-bg-warning',
  invalid: 'text-bg-danger',
  unavailable: 'text-bg-secondary',
};

export default function DataOutGuide({ health, open, onClose }: DataOutGuideProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (open && event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;

  const finish = (choice: 'completed' | 'skipped') => {
    saveDataOutGuideChoice(window.localStorage, choice);
    onClose();
  };
  const lastPacket = health.lastPacketAt ? new Date(health.lastPacketAt * 1000).toLocaleString() : 'Not received';

  return (
    <ModalPortal>
      <div
        className="modal-backdrop fade show"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 1050,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="modal show d-block"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="data-out-guide-title"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 1055,
          overflowX: 'hidden',
          overflowY: 'auto',
          pointerEvents: 'none',
        }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg" style={{ pointerEvents: 'auto' }}>
          <div className="modal-content glass-panel border border-primary border-opacity-25 shadow-lg">
            <div className="modal-header border-bottom border-secondary border-opacity-25 pb-3">
              <div>
                <h2 id="data-out-guide-title" className="modal-title fs-5 fw-bold text-primary mb-1">Set up Forza Data Out</h2>
                <p className="mb-0 small text-secondary">A local setup guide. It does not establish or verify a game connection.</p>
              </div>
              <button ref={closeButton} type="button" className="btn-close" aria-label="Close Data Out guide" onClick={onClose} />
            </div>
            <div className="modal-body py-3">
              <ol className="mb-4 ps-3 text-body">
                <li className="mb-1">In Forza Horizon 6, open Settings, then HUD and Gameplay.</li>
                <li className="mb-1">When Forza runs on this PC, use destination IP <code>127.0.0.1</code> and UDP port <code>8000</code>.</li>
                <li>Return here and drive briefly. The health status below reflects packets seen by the local diagnostics endpoint.</li>
              </ol>
              <section aria-labelledby="data-out-health-title" className="border rounded p-3" style={{ borderColor: 'var(--divider)', background: 'var(--surface-1)' }}>
                <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                  <div><h3 id="data-out-health-title" className="fs-6 mb-1 fw-bold">Data Out health</h3><p className="mb-0 small text-secondary">{health.detail}</p></div>
                  <span className={`badge ${badgeClass[health.state]} px-2 py-1`}>{health.label}</span>
                </div>
                <dl className="row small mb-0 mt-3">
                  <dt className="col-sm-4 text-secondary">Destination</dt><dd className="col-sm-8"><code>127.0.0.1:8000</code> (same-PC setup)</dd>
                  <dt className="col-sm-4 text-secondary">First packet</dt><dd className="col-sm-8">{health.hasObservedPacket ? 'Observed' : 'Not received'}</dd>
                  <dt className="col-sm-4 text-secondary">Latest packet observed</dt><dd className="col-sm-8">{lastPacket}</dd>
                  <dt className="col-sm-4 text-secondary">Datagrams / valid frames</dt><dd className="col-sm-8">{health.datagramsReceived} / {health.validFrames}</dd>
                </dl>
                {health.errors.length > 0 && <p className="small mb-0 text-danger mt-2" role="status">Reported error: {health.errors.join(', ')}</p>}
              </section>
            </div>
            <div className="modal-footer border-top border-secondary border-opacity-25 pt-3 d-flex justify-content-between">
              <button type="button" className="btn btn-outline-secondary" onClick={() => finish('skipped')}>Skip for now</button>
              <button type="button" className="btn btn-primary fw-bold" onClick={() => finish('completed')}>I&apos;ve reviewed this</button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
