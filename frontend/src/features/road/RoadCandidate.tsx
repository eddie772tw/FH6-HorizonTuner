import React, { useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { roadExplorationStep } from '../../utils/tuningMath';
import type { RoadSetup } from './roadTypes';
import { candidateParameters, candidateParameterUnits as unitsFor } from './roadPresentation';
import { createRoadCandidateDraft, type RoadCandidateDraft } from './roadValidationState';

interface Props {
  runId: string;
  basis: RoadSetup;
  busy: boolean;
  draft: RoadCandidateDraft | null;
  onDraftChange: (draft: RoadCandidateDraft) => void;
  create: (body: unknown) => Promise<RoadSetup | null>;
  onCreated: (id: string) => void;
}
export function RoadCandidate({ runId, basis, busy, draft: savedDraft, onDraftChange, create, onCreated }: Props) {
  const { t } = useSettings();
  const savedValues = (key: string) => { const field = basis.fields[key]; return { value: field ? String(field.value) : '', minimum: field?.minimum != null ? String(field.minimum) : '', maximum: field?.maximum != null ? String(field.maximum) : '', step: field?.step != null ? String(field.step) : '' }; };
  const parameters = candidateParameters(Object.keys(basis.fields));
  const draft = savedDraft?.runId === runId && savedDraft.basisSetupId === basis.id ? savedDraft : createRoadCandidateDraft(runId, basis);
  useEffect(() => {
    if (savedDraft?.runId !== runId || savedDraft.basisSetupId !== basis.id) onDraftChange(draft);
  }, [basis.id, draft, onDraftChange, runId, savedDraft?.basisSetupId, savedDraft?.runId]);
  const symptoms = ['Front pushes wide on corner entry', 'Front pushes wide in the middle of a corner', 'Rear steps out when accelerating out of a corner', 'Rear feels unstable under braking'];
  const numeric = { value: Number(draft.values.value), minimum: Number(draft.values.minimum), maximum: Number(draft.values.maximum), step: Number(draft.values.step) };
  const candidate = Object.values(draft.values).every(v => v.trim()) ? roadExplorationStep(numeric, draft.direction) : null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.confirmed || candidate === null) return;
    const result = await create({ baselineRunId: runId, parameter: draft.parameter, baseline: { ...numeric, unit: draft.unit, source: 'game-confirmed' },
      candidateValue: candidate, baselineValueUnchanged: true, hypothesis: draft.hypothesis.trim() || 'Compare full-event time and matched local slip with A', source: 'one-game-step-exploration' });
    if (result) onCreated(result.id);
  };
  return <section className="glass-panel p-4">
    <h3 className="h5">{t('Try one reversible change')}</h3>
    <p>{t('No validated direction is available from this observation alone. Choose one exploratory change, or keep A.')}</p>
    <form onSubmit={submit} className="d-flex flex-column gap-3">
      <div className="row g-3">
        <label className="col-md-6">{t('Parameter')}<select className="form-select" value={draft.parameter} onChange={e => {
          const parameter = e.target.value;
          onDraftChange({ ...draft, parameter, unit: basis.fields[parameter]?.unit || unitsFor(parameter)[0] || '', values: savedValues(parameter), confirmed: false });
        }}>
          {parameters.map(p => <option key={p} value={p}>{t(p)}</option>)}
        </select></label>
        <label className="col-md-6">{t('Game unit')}<select className="form-select" value={draft.unit} onChange={e => onDraftChange({ ...draft, unit: e.target.value, values: { value: '', minimum: '', maximum: '', step: '' }, confirmed: false })}>
          {unitsFor(draft.parameter).map(u => <option key={u}>{u}</option>)}
        </select></label>
      </div>
      <div className="row g-3">{(['value', 'minimum', 'maximum', 'step'] as const).map((key, i) => <label className="col-sm-6 col-xl-3" key={key}>{t(['Current game value', 'Game minimum', 'Game maximum', 'One game step'][i])}
        <input className="form-control" type="number" step="any" required value={draft.values[key]} onChange={e => onDraftChange({ ...draft, values: { ...draft.values, [key]: e.target.value }, confirmed: false })} /></label>)}</div>
      <label>{t('Exploration direction')}<select className="form-select" value={draft.direction} onChange={e => onDraftChange({ ...draft, direction: Number(e.target.value) as -1 | 1, confirmed: false })}><option value={1}>{t('Increase one game step')}</option><option value={-1}>{t('Decrease one game step')}</option></select></label>
      <details><summary>{t('Optional test note')}</summary>
        <p className="small mt-2">{t('Understeer: the front pushes wider than intended. Oversteer: the rear steps out. Note when it happens; a symptom alone does not choose an adjustment direction.')}</p>
        <div className="d-flex flex-wrap gap-2 mb-2">{symptoms.map(symptom => <button type="button" className="btn btn-sm btn-outline-secondary" key={symptom} onClick={() => onDraftChange({ ...draft, hypothesis: t(symptom) })}>{t(symptom)}</button>)}</div>
        <label>{t('What will this test check?')}<input className="form-control" maxLength={400} value={draft.hypothesis} onChange={e => onDraftChange({ ...draft, hypothesis: e.target.value })} placeholder={t('Compare full-event time and matched local slip with A')} /></label>
      </details>
      <label className="d-flex gap-2"><input type="checkbox" checked={draft.confirmed} onChange={e => onDraftChange({ ...draft, confirmed: e.target.checked })} />{t('I read these limits and the current value in game, and this value was unchanged throughout baseline A.')}</label>
      <div className="d-flex align-items-center flex-wrap gap-3">
        <span>{t('Frozen A → candidate B')}: {candidate === null ? t('Enter a valid game range and step') : numeric.value + ' → ' + candidate + ' ' + draft.unit}</span>
        <button className="btn btn-primary" type="submit" disabled={busy || !draft.confirmed || candidate === null}>{t('Save B draft')}</button>
      </div>
      <p className="small text-body-secondary mb-0">{t('This is an exploration, not an optimized setting. A remains unchanged. Apply B in game and confirm before collecting another run.')}</p>
    </form>
  </section>;
}
