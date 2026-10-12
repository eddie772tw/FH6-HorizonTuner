import { useId, useState } from 'react';
import type { CvtFoundationResult } from '../../../domain/tuning/transmission';
import type { useCvtEvidenceSession } from '../useCvtEvidenceSession';

const confirmationShape = JSON.stringify({
  identity: { ordinal: null, performanceIndex: null, carClass: null },
  cvtConfiguration: {
    id: null, source: 'unknown', reference: null, installedParts: null,
    ...Object.fromEntries(['finalDrive', 'finalDriveMinimum', 'finalDriveMaximum', 'tireCircumferenceM', 'ratioMinimum', 'ratioMaximum']
      .map(key => [key, { value: null, source: 'unknown', reference: null }])),
  },
}, null, 2);

export function CvtEvidencePanel({ session, result, t }: {
  session: ReturnType<typeof useCvtEvidenceSession>; result?: CvtFoundationResult; t: (key: string) => string;
}) {
  const id = useId();
  const [current, setCurrent] = useState('');
  const provenance = session.selection?.metadata.provenance as Record<string, unknown> | null;
  return <div className="d-flex flex-column gap-3">
    <div className="d-flex flex-wrap align-items-end gap-2">
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <label className="form-label" htmlFor={`${id}-saved`}>{t('Saved CVT evidence')}</label>
        <select id={`${id}-saved`} className="form-select" disabled={session.busy}
          value={session.selection?.evidence.kind === 'saved-cvt' ? session.selection.evidence.evidenceId : ''}
          onChange={event => event.target.value ? void session.selectSaved(event.target.value) : session.clear()}>
          <option value="">{t('Select evidence')}</option>
          {session.items.map(item => <option key={item.evidenceId} value={item.evidenceId}>
            {String(item.capture.carId ?? t('Unknown'))} · {item.evidenceId}
          </option>)}
        </select>
      </div>
      <button className="btn btn-outline-secondary" disabled={session.busy} onClick={() => void session.refresh()}>{t('Refresh evidence')}</button>
      <button className="btn btn-outline-secondary" onClick={session.clear}>{t('Clear evidence selection')}</button>
    </div>
    <div>
      <label className="form-label" htmlFor={`${id}-import`}>{t('Import raw CVT evidence JSON')}</label>
      <input id={`${id}-import`} className="form-control" type="file" accept=".json,application/json" disabled={session.busy}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void session.importFile(file); }} />
      <p className="small text-body-secondary mb-0 mt-1">{t('Import a traceable cvt-capture/v1 file (up to 8 MiB). Original fields and unknown values are preserved.')}</p>
    </div>
    {session.selection && <div>
      <h4 className="workspace-section-heading">{t('Imported evidence sources')}</h4>
      <dl className="small mb-1">
        {(['capturedAt', 'gameBuild', 'recorderVersion'] as const).map(field => <div key={field}>
          <dt>{t({ capturedAt: 'Capture time', gameBuild: 'Game build', recorderVersion: 'Recorder version' }[field])}</dt>
          <dd style={{ overflowWrap: 'anywhere' }}>{String(provenance?.[field] ?? t('Unknown'))}</dd>
        </div>)}
      </dl>
      <p className="small text-body-secondary">{t('Unknown capture time, game build or recorder version needs the original recording source. Missing limits, final drive or tire geometry need traceable game settings or measurement.')}</p>
      <details><summary>{t('View immutable evidence metadata')}</summary>
        <pre className="small mb-0" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(session.selection.metadata, null, 2)}</pre>
      </details>
    </div>}
    <div>
      <label className="form-label" htmlFor={`${id}-current`}>{t('Independent current configuration confirmation')}</label>
      <p className="small text-body-secondary">{t('Enter the current ordinal, PI/Class and sourced cvtConfiguration separately. Imported metadata is not a confirmation. Live identity takes precedence when available; vehicle or setup changes require confirmation again.')}</p>
      <details className="small mb-2"><summary>{t('Current confirmation JSON format')}</summary>
        <p>{t('Replace only independently verified values. Keep unknown values null and source unknown. Sources are game-visible or measurement, with a traceable reference.')}</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{confirmationShape}</pre>
      </details>
      <textarea id={`${id}-current`} className="form-control" rows={6} value={current} spellCheck={false}
        onChange={event => { session.revokeConfirmation(); setCurrent(event.target.value); }} />
      <div className="d-flex flex-wrap gap-2 mt-2">
        <button className="btn btn-outline-secondary" disabled={session.busy || !current.trim()} onClick={() => session.confirm(current)}>{t('Confirm current configuration')}</button>
        <button className="btn btn-primary" disabled={session.busy || !session.confirmed || session.selection?.evidence.kind !== 'cvt-capture' || result?.captureStatus !== 'qualified'}
          onClick={() => void session.save()}>{t('Save immutable CVT evidence')}</button>
      </div>
    </div>
    <p className="small mb-0" role="status">{t(session.error ?? (session.busy ? 'Loading CVT evidence…' : session.confirmed ? 'Current configuration confirmed. Rust evaluates the selected evidence.' : 'Current configuration confirmation required.'))}</p>
  </div>;
}
