import { useEffect, useRef, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import type { CompanionCommand, CompanionState } from './companionProtocol';
import { canOpenTuningStep } from '../tuning/tuningWorkflow';
import { AlignmentResults, ChassisResults, GearingResults } from './CompanionResults';
import CompanionMeasurement from './CompanionMeasurement';

type Props = { state: CompanionState | null; disabled: boolean; onCommand: (command: Omit<CompanionCommand, 'id' | 'carId' | 'profileKey'>) => Promise<boolean> };
type Draft = Record<string, string>;
const sections = [
  { id: 'companion-setup', label: 'Setup' },
  { id: 'companion-chassis', label: 'Chassis' },
  { id: 'companion-alignment', label: 'Alignment' },
  { id: 'companion-engine', label: 'Engine' },
  { id: 'companion-gearing', label: 'Gearing' },
] as const;

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
  const [activeSection, setActiveSection] = useState<string>(sections[0].id);
  const navigationTarget = useRef<{ id: string; until: number } | null>(null);
  useEffect(() => {
    if (!snapshot || editing) return;
    setDraft({}); setDraftError(null); setDraftIdentity(`${snapshot.carId}:${snapshot.profileKey}`);
  }, [editing, snapshot]);
  useEffect(() => {
    if (!snapshot) return;
    const container = document.querySelector<HTMLElement>('.companion-content');
    if (!container) return;
    const updateSection = () => {
      if (navigationTarget.current && performance.now() < navigationTarget.current.until) {
        setActiveSection(navigationTarget.current.id);
        return;
      }
      navigationTarget.current = null;
      if (container.scrollHeight > container.clientHeight + 8 && container.scrollTop + container.clientHeight >= container.scrollHeight - 8) {
        setActiveSection(sections[sections.length - 1].id);
        return;
      }
      const threshold = container.getBoundingClientRect().top + 64;
      const visible = sections.map(({ id }) => ({ id, top: document.getElementById(id)?.getBoundingClientRect().top ?? Infinity }))
        .filter(({ top }) => top <= threshold);
      const rowTop = visible[visible.length - 1]?.top;
      const currentRow = visible.filter(({ top }) => Math.abs(top - rowTop) < 2);
      setActiveSection((current) => currentRow.some(({ id }) => id === current) ? current : (currentRow[0]?.id ?? sections[0].id));
    };
    container.addEventListener('scroll', updateSection, { passive: true });
    updateSection();
    return () => container.removeEventListener('scroll', updateSection);
  }, [snapshot?.carId]);
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
  const readinessMessage = !snapshot.readiness.mechanical ? 'Enter vehicle weight and distribution to unlock chassis tuning.'
    : !snapshot.readiness.engineInputs ? 'Enter engine power to unlock measurement.'
      : !snapshot.readiness.measuredEngine ? 'Complete engine measurement before gearing and step 4.'
        : 'Engine measurement is ready. Verify the setup on the PC before saving.';
  return <div className="companion-stack">
    <nav className="companion-section-nav" aria-label="Tuning sections">{sections.map(({ id, label }) => <button key={id} type="button" className={`btn ${activeSection === id ? 'btn-primary' : 'btn-outline-secondary'}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => { navigationTarget.current = { id, until: performance.now() + 800 }; setActiveSection(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{label}</button>)}</nav>
    <section id="companion-setup" className="companion-panel companion-tuning-setup"><div className="d-flex justify-content-between align-items-center"><div><h2>{snapshot.carName}</h2><p className="text-body-secondary">Step {workflow.step}: {workflow.goal} · {workflow.season}</p></div><span className="badge text-bg-info">PC snapshot</span></div>
      <div className="companion-form-grid companion-workflow-controls"><label className="companion-field"><span>Goal</span><select className="form-select" disabled={disabled} value={workflow.goal} onChange={(e) => void onCommand({ kind: 'workflow', goal: e.target.value })}>{['Road', 'Rally', 'Drift', 'Drag'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="companion-field"><span>Season</span><select className="form-select" disabled={disabled} value={workflow.season} onChange={(e) => void onCommand({ kind: 'workflow', season: e.target.value })}>{['Summer', 'Autumn', 'Winter', 'Spring'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="companion-field"><span>Workflow step</span><select className="form-select" disabled={disabled} value={workflow.step} onChange={(e) => void onCommand({ kind: 'workflow', step: Number(e.target.value) })}>{[1, 2, 3, 4].map((item) => <option key={item} value={item} disabled={!canOpenTuningStep(item, snapshot.readiness)}>{item}</option>)}</select></label></div>
      <p className="companion-readiness text-body-secondary" role="status">{readinessMessage}</p>
      <details className="companion-profile-details"><summary><span>Vehicle parameters</span><span className="companion-profile-summary">{profile ? `${profile.weight} kg · ${profile.maxHp} hp` : 'No profile'}{editing ? ' · Unsaved draft' : ''}</span></summary>
        <div className="companion-profile-body">
          <div className="companion-form-grid">{fields.map((field) => <label key={String(field.key)} className="companion-field"><span>{field.label}</span>{field.type === 'select' ? <select className="form-select" value={String(value(field.key))} disabled={disabled} onChange={(e) => setValue(field.key, e.target.value)}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input className="form-control" type="number" value={String(value(field.key))} disabled={disabled} onChange={(e) => setValue(field.key, e.target.value)} />}</label>)}</div>
          <p className="text-body-secondary small mb-0">Apply sends an edit to the desktop working draft. Use the desktop Save Setup action to persist it.</p>
          {identityChanged && <div className="companion-message is-error">PC vehicle parameters changed. Discard this draft before editing the new vehicle.</div>}
          {draftError && <div className="companion-message is-error">{draftError}</div>}
          <div className="d-flex gap-2 mt-3"><button className="btn btn-primary flex-grow-1" disabled={disabled || identityChanged || !Object.keys(draft).length} onClick={() => void profileCommand()}>Apply profile draft</button><button className="btn btn-outline-secondary" disabled={!editing} onClick={() => { setDraft({}); setDraftError(null); setEditing(false); setDraftIdentity(`${snapshot.carId}:${snapshot.profileKey}`); }}>Discard</button></div>
        </div>
      </details>
    </section>
    <div className="companion-tuning-results"><ChassisResults result={snapshot.results.chassis} /><AlignmentResults result={snapshot.results.alignment} /></div>
    <section id="companion-engine"><CompanionMeasurement measurement={measurement} disabled={disabled} onCommand={onCommand} /></section>
    <GearingResults result={snapshot.results.gearing} measurementPhase={measurement.phase} />
  </div>;
}
