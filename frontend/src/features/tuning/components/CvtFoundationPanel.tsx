import type { CvtFoundationResult } from '../../../domain/tuning/transmission';
export function CvtFoundationPanel({ result, t }: { result?: CvtFoundationResult; t: (key: string) => string }) {
  return <section className="glass-panel p-3 d-flex flex-column gap-2" aria-label="CVT">
    <h3 className="workspace-section-heading">CVT · {t('Foundation')}</h3>
    <p className="mb-0" role="status">{t('CVT recommendations are unavailable pending real capture and solver validation.')}</p>
    <p className="small text-body-secondary mb-0">{t('Record the vehicle, PI/Class, installed parts and visible final drive settings with a continuous raw telemetry session. Keep unknown values unknown; ratio limits require traceable measurement.')}</p>
    {result && <><span className="badge text-bg-secondary align-self-start">{result.captureStatus}</span>
      <ul className="small mb-0">{result.diagnostics.map(d => <li key={`${d.code}:${d.field}`}>{d.status}: {d.code} ({d.field})</li>)}</ul></>}
  </section>;
}
