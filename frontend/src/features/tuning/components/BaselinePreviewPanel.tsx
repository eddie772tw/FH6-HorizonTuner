import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { Season } from '../../../domain/tuning/types';
import type { useBaselineDraft } from '../useBaselineDraft';
import { useWorkflowCalculation } from '../useWorkflowCalculation';
import { ChassisCalculationStatus, chassisReasonText } from './ChassisCalculationStatus';

export function BaselinePreviewPanel({ carId, profile, season, draft, showTargetSelector = true, busy = false }: {
  carId: string; profile: CarParams | null; season: Season; draft: ReturnType<typeof useBaselineDraft>; showTargetSelector?: boolean; busy?: boolean;
}) {
  const { t, convertSpringRate, convertHeight, convertTirePressureFromPsi } = useSettings();
  const snapshot = useMemo(() => ({ carId, baselineCurrent: draft.fields, baselineContext: draft.context }), [carId, draft.fields, draft.context]);
  // The same Rust workflow owns this mechanical preview, without inventing engine evidence.
  const request = useWorkflowCalculation(carId, draft.goal, season, profile, null, null, snapshot);
  // Reserve only geometry during refresh; stale values never remain in the DOM.
  const scope = JSON.stringify([carId, draft.goal]);
  const content = useRef<HTMLDivElement>(null);
  const [reserved, setReserved] = useState({ scope, height: 0 });
  const preview = request.result?.baselinePreview;
  const current = request.status === 'ready' && request.result !== null;
  useLayoutEffect(() => {
    if (!current || !content.current) return;
    const element = content.current;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      setReserved(previous => previous.scope === scope && previous.height === height ? previous : { scope, height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [current, scope]);
  const display = (value: number | null, unit: string) => {
    if (value == null) return t('Unknown');
    const converted = unit === 'kgf/mm' ? convertSpringRate(value) : unit === 'cm' ? convertHeight(value)
      : unit === 'psi' ? convertTirePressureFromPsi(value) : { value, label: unit };
    return `${Number(converted.value.toFixed(3))} ${converted.label}`;
  };
  return <section className="glass-panel p-3" aria-label={t('Neutral baseline preview')} style={{ minWidth: 0 }}>
    <h3 className="workspace-section-heading workspace-panel-header">{t('Neutral baseline preview')}</h3>
    <div className="d-flex flex-wrap gap-3 align-items-end">
      {showTargetSelector ? <label>{t('Draft target')}<select className="form-select" disabled={busy} value={draft.goal} onChange={event => draft.setDraftGoal(event.target.value)}>
        {['Road', 'Rally', 'Drift', 'Drag'].map(goal => <option key={goal} value={goal}>{t(goal)}</option>)}
      </select></label> : <span>{t('Draft target')}: {t(draft.goal)}</span>}
      <span>{t('Stiffness')}: {t('Neutral')} · {t('Balance')}: {t('Neutral')}</span>
    </div>
    <p role="status">{t(draft.phase === 'cancelled' ? 'Draft cancelled. Current baseline retained.' : draft.phase === 'applied' ? 'Local baseline applied.' : 'Draft — current baseline retained.')}</p>
    <p role="status" style={{ minHeight: '1.5em' }}>{request.status !== 'ready' ? t(request.status === 'error' ? 'Tuning calculation is unavailable. Retrying…' : 'Calculating tuning results…') : '\u00a0'}</p>
    <div ref={content} aria-busy={!current} style={{ display: 'flow-root', minHeight: !current && reserved.scope === scope ? reserved.height : undefined }}>
    {preview && <>
      <ChassisCalculationStatus diagnostics={request.result?.chassisDiagnostics} />
      <p className="small" style={{ overflowWrap: 'anywhere' }}>{t('Model version')}: {preview.modelVersion} · {t('Draft target')}: {t(preview.goal)}</p>
      {preview.missingInputs.length > 0 && <p>{t('Missing inputs')}: {preview.missingInputs.map(reason => t(reason)).join(' · ')}</p>}
      <p className="small">{t('Affected fields')}: {preview.affectedFields.length ? preview.affectedFields.map(key => t(key)).join(' · ') : t('None')}</p>
      <details><summary>{t('Current / suggested / difference')}</summary>
        <div className="d-grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
          {preview.fields.map(field => <div key={field.key} className="border rounded p-2 small" style={{ overflowWrap: 'anywhere' }}>
            <strong>{t(field.key)}</strong> <span className="badge text-bg-secondary">{t(field.status)}</span>
            <div>{t('Current')}: {display(field.current, field.unit)}</div>
            <div>{t('Suggested')}: {field.recommended == null ? t('Unavailable') : display(field.recommended, field.unit)}</div>
            <div>{t('Difference')}: {display(field.delta, field.unit)}</div>
            {field.reason && <div className="text-body-secondary">{chassisReasonText(field.reason, t)}</div>}
          </div>)}
        </div>
      </details>
    </>}
    </div>
    <div className="d-flex flex-wrap gap-2 mt-3">
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={draft.begin}>{t('Preview baseline')}</button>
      <button type="button" className="btn btn-outline-secondary" onClick={draft.cancel} disabled={busy || draft.phase !== 'draft'}>{t('Cancel draft')}</button>
      <button type="button" className="btn btn-outline-primary" disabled={busy || draft.phase !== 'draft' || request.status !== 'ready' || !preview?.canApply}
        onClick={() => preview && draft.apply(preview, snapshot.baselineContext)}>{t('Apply local baseline')}</button>
    </div>
  </section>;
}
