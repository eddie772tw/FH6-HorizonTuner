import { useEffect, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import type { CompanionCommand, CompanionState } from './companionProtocol';
import { canOpenTuningStep } from '../tuning/tuningWorkflow';
import CompanionResults from './CompanionResults';
import CompanionMeasurement from './CompanionMeasurement';

type Props = { state: CompanionState | null; disabled: boolean; onCommand: (command: Omit<CompanionCommand, 'id' | 'carId' | 'profileKey'>) => Promise<boolean> };
type Draft = Record<string, string>;

const fields: Array<{ key: keyof CarParams; label: string; type?: 'number' | 'select'; options?: string[] }> = [
  { key: 'weight', label: 'Weight (kg)' }, { key: 'weight_distribution', label: 'Front distribution (%)' },
  { key: 'drivetrain', label: 'Drivetrain', type: 'select', options: ['FWD', 'RWD', 'AWD'] },
  { key: 'induction', label: 'Induction', type: 'select', options: ['NA', 'Supercharger', 'Turbo', 'TwinTurbo'] },
  { key: 'frontTireWidth', label: 'Front tire width (mm)' }, { key: 'rearTireWidth', label: 'Rear tire width (mm)' },
  { key: 'frontTireAspect', label: 'Front tire aspect (%)' }, { key: 'rearTireAspect', label: 'Rear tire aspect (%)' },
  { key: 'frontTireRim', label: 'Front rim (in)' }, { key: 'rearTireRim', label: 'Rear rim (in)' },
  { key: 'maxHp', label: 'Maximum power (hp)' }, { key: 'maxTorque', label: 'Maximum torque (Nm)' },
  { key: 'maxHpRpm', label: 'Peak power rpm' }, { key: 'maxTorqueRpm', label: 'Peak torque rpm' },
];

export default function CompanionTuning({ state, disabled, onCommand }: Props) {
  const snapshot = state?.snapshot;
  const [draft, setDraft] = useState<Draft>({});
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftIdentity, setDraftIdentity] = useState<string | null>(null);
  useEffect(() => {
    if (!snapshot || editing) return;
    setDraft({}); setDraftError(null); setDraftIdentity(`${snapshot.carId}:${snapshot.profileKey}`);
  }, [editing, snapshot]);
  if (!snapshot) return <div className="companion-panel"><h2>Waiting for PC snapshot</h2><p className="text-body-secondary">Open a vehicle and workflow on the PC to make its results available here.</p></div>;

  const profile = snapshot.profile as CarParams | null;
  const value = (key: keyof CarParams) => Object.prototype.hasOwnProperty.call(draft, key) ? draft[String(key)] : profile?.[key] ?? '';
  const setValue = (key: keyof CarParams, raw: string) => {
    setEditing(true); setDraftError(null);
    if (!draftIdentity) setDraftIdentity(`${snapshot.carId}:${snapshot.profileKey}`);
    setDraft((previous) => ({ ...previous, [String(key)]: raw }));
  };
  const profileCommand = async () => {
    if (!Object.keys(draft).length) return;
    if (draftIdentity !== `${snapshot.carId}:${snapshot.profileKey}`) return;
    const patch: Partial<CarParams> = {};
    for (const [key, raw] of Object.entries(draft)) {
      if (!raw.trim()) { setDraftError(`${key} cannot be blank. Enter a value or discard the draft.`); return; }
      if (key === 'drivetrain' || key === 'induction') (patch as Record<string, unknown>)[key] = raw;
      else {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) { setDraftError(`${key} must be a valid number.`); return; }
        (patch as Record<string, unknown>)[key] = numeric;
      }
    }
    const applied = await onCommand({ kind: 'profile', patch });
    if (applied) { setEditing(false); setDraft({}); setDraftError(null); }
  };
  const workflow = snapshot.workflow;
  const measurement = snapshot.engine;
  const identityChanged = Boolean(editing && draftIdentity && draftIdentity !== `${snapshot.carId}:${snapshot.profileKey}`);
  return <div className="companion-stack">
    <div className="companion-panel"><div className="d-flex justify-content-between align-items-center"><div><h2>{snapshot.carName}</h2><p className="text-body-secondary">Step {workflow.step}: {workflow.goal} · {workflow.season}</p></div><span className="badge text-bg-info">PC snapshot</span></div>
      <div className="companion-form-grid companion-workflow-controls"><label className="companion-field"><span>Goal</span><select className="form-select" disabled={disabled} value={workflow.goal} onChange={(e) => void onCommand({ kind: 'workflow', goal: e.target.value })}>{['Road', 'Rally', 'Drift', 'Drag'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="companion-field"><span>Season</span><select className="form-select" disabled={disabled} value={workflow.season} onChange={(e) => void onCommand({ kind: 'workflow', season: e.target.value })}>{['Summer', 'Autumn', 'Winter', 'Spring'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="companion-field"><span>Workflow step</span><select className="form-select" disabled={disabled} value={workflow.step} onChange={(e) => void onCommand({ kind: 'workflow', step: Number(e.target.value) })}>{[1, 2, 3, 4].map((item) => <option key={item} value={item} disabled={!canOpenTuningStep(item, snapshot.readiness)}>{item}</option>)}</select></label></div>
      <div className="companion-form-grid">{fields.map((field) => <label key={String(field.key)} className="companion-field"><span>{field.label}</span>{field.type === 'select' ? <select className="form-select" value={String(value(field.key))} disabled={disabled} onChange={(e) => setValue(field.key, e.target.value)}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input className="form-control" type="number" value={String(value(field.key))} disabled={disabled} onChange={(e) => setValue(field.key, e.target.value)} />}</label>)}</div>
      <p className="text-body-secondary small mb-0">Apply sends an edit to the desktop working draft. Use the desktop Save Setup action to persist it.</p>
      {identityChanged && <div className="companion-message is-error">PC vehicle parameters changed. Discard this draft before editing the new vehicle.</div>}
      {draftError && <div className="companion-message is-error">{draftError}</div>}
      <div className="d-flex gap-2 mt-3"><button className="btn btn-primary flex-grow-1" disabled={disabled || identityChanged || !Object.keys(draft).length} onClick={() => void profileCommand()}>Apply profile draft</button><button className="btn btn-outline-secondary" disabled={!editing} onClick={() => { setDraft({}); setDraftError(null); setEditing(false); setDraftIdentity(`${snapshot.carId}:${snapshot.profileKey}`); }}>Discard</button></div>
    </div>
    <CompanionResults snapshot={snapshot} />
    <CompanionMeasurement measurement={measurement} disabled={disabled} onCommand={onCommand} />
  </div>;
}
