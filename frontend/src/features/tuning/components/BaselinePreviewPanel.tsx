import { useMemo } from 'react';
import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import type { Season } from '../../../domain/tuning/types';
import type { useBaselineDraft } from '../useBaselineDraft';
import { useWorkflowCalculation } from '../useWorkflowCalculation';

export function BaselinePreviewPanel({ carId, profile, season, draft, showTargetSelector = true }: {
  carId: string; profile: CarParams | null; season: Season; draft: ReturnType<typeof useBaselineDraft>; showTargetSelector?: boolean;
}) {
  const { t, convertSpringRate, convertHeight, convertTirePressureFromPsi } = useSettings();
  const snapshot = useMemo(() => ({ carId, baselineCurrent: draft.fields }), [carId, draft.fields]);
  // The same Rust workflow owns this mechanical preview, without inventing engine evidence.
  const request = useWorkflowCalculation(carId, draft.goal, season, profile, null, null, snapshot);
  const preview = request.result?.baselinePreview;
  const display = (value: number | null, unit: string) => {
    if (value == null) return t('Unknown');
    const converted = unit === 'kgf/mm' ? convertSpringRate(value) : unit === 'cm' ? convertHeight(value)
      : unit === 'psi' ? convertTirePressureFromPsi(value) : { value, label: unit };
    return `${Number(converted.value.toFixed(3))} ${converted.label}`;
  };
  return <section className="glass-panel p-3" aria-label={t('Neutral baseline preview')} style={{ minWidth: 0 }}>
    <h3 className="workspace-section-heading workspace-panel-header">{t('Neutral baseline preview')}</h3>
    <div className="d-flex flex-wrap gap-3 align-items-end">
      {showTargetSelector ? <label>{t('Draft target')}<select className="form-select" value={draft.goal} onChange={event => draft.setDraftGoal(event.target.value)}>
        {['Road', 'Rally', 'Drift', 'Drag'].map(goal => <option key={goal} value={goal}>{t(goal)}</option>)}
      </select></label> : <span>{t('Draft target')}: {t(draft.goal)}</span>}
      <span>{t('Stiffness')}: {t('Neutral')} · {t('Balance')}: {t('Neutral')}</span>
    </div>
    <p className="small text-body-secondary mt-2">{t('Other stiffness and balance preferences are unavailable until a calibrated Rust contract exists.')}</p>
    <p className="small">{t('Current values are the local applied baseline; unconfirmed game settings remain unknown. Apply keeps a local baseline only. Confirm values manually in game.')}</p>
    <p role="status">{t(draft.phase === 'cancelled' ? 'Draft cancelled. Current baseline retained.' : draft.phase === 'applied' ? 'Local baseline applied.' : 'Draft — current baseline retained.')}</p>
    {request.status !== 'ready' && <p role="status">{t(request.status === 'error' ? 'Tuning calculation is unavailable. Retrying…' : 'Calculating tuning results…')}</p>}
    {preview && <>
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
            {field.reason && <div className="text-body-secondary">{t(field.reason)}</div>}
          </div>)}
        </div>
      </details>
    </>}
    <div className="d-flex flex-wrap gap-2 mt-3">
      <button type="button" className="btn btn-outline-secondary" onClick={draft.begin}>{t('Preview baseline')}</button>
      <button type="button" className="btn btn-outline-secondary" onClick={draft.cancel} disabled={draft.phase !== 'draft'}>{t('Cancel draft')}</button>
      <button type="button" className="btn btn-primary" disabled={draft.phase !== 'draft' || request.status !== 'ready' || !preview?.canApply}
        onClick={() => preview && draft.apply(preview)}>{t('Apply local baseline')}</button>
    </div>
  </section>;
}
