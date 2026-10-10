import { useEffect, useRef, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import type { CompanionCommand, CompanionState } from './companionProtocol';
import { canOpenTuningStep } from '../tuning/tuningWorkflow';
import { useSettings } from '../../context/SettingsContext';
import { AlignmentResults, ChassisResults, GearingResults } from './CompanionResults';
import CompanionMeasurement from './CompanionMeasurement';
import { usesCvt } from '../../domain/tuning/transmission';
import { CvtFoundationPanel } from '../tuning/components/CvtFoundationPanel';

type Props = { state: CompanionState | null; disabled: boolean; onCommand: (command: Omit<CompanionCommand, 'id' | 'carId' | 'profileKey'>) => Promise<boolean> };
type Draft = Record<string, string>;
// Moved sections inside component

// Removed fields array to be inline


export default function CompanionTuning({ state, disabled, onCommand }: Props) {
  const { t } = useSettings();
  // English uses source text; retain Companion-specific translations in other locales.
  const companionText = (english: string, key: string) => {
    const translated = t(key);
    return translated === key ? english : translated;
  };
  const sections = [
    { id: 'companion-setup', label: companionText("Setup", "companion.sections.Setup") },
    { id: 'companion-chassis', label: companionText("Chassis", "companion.sections.Chassis") },
    { id: 'companion-alignment', label: companionText("Alignment", "companion.sections.Alignment") },
    { id: 'companion-engine', label: companionText("Engine", "companion.sections.Engine") },
    { id: 'companion-gearing', label: companionText("Gearing", "companion.sections.Gearing") },
  ] as const;
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
  if (!snapshot) return <div className="companion-panel"><h2>{companionText("Waiting for PC snapshot", "companion.waiting_title")}</h2><p className="text-body-secondary">{companionText("Open a vehicle and workflow on the PC to make its results available here.", "companion.waiting_desc")}</p></div>;

  const fields: Array<{ key: keyof CarParams; label: string; type?: 'number' | 'select'; options?: string[] }> = [
    { key: 'weight', label: companionText("Weight (kg)", "companion.weight") }, { key: 'weight_distribution', label: companionText("Front distribution (%)", "companion.weight_distribution") },
    { key: 'drivetrain', label: companionText("Drivetrain", "companion.drivetrain"), type: 'select', options: ['FWD', 'RWD', 'AWD'] },
    { key: 'induction', label: companionText("Induction", "companion.induction"), type: 'select', options: ['NA', 'Supercharger', 'Turbo', 'TwinTurbo'] },
    { key: 'frontTireWidth', label: companionText("Front tire width (mm)", "companion.frontTireWidth") }, { key: 'rearTireWidth', label: companionText("Rear tire width (mm)", "companion.rearTireWidth") },
    { key: 'frontTireAspect', label: companionText("Front tire aspect (%)", "companion.frontTireAspect") }, { key: 'rearTireAspect', label: companionText("Rear tire aspect (%)", "companion.rearTireAspect") },
    { key: 'frontTireRim', label: companionText("Front rim (in)", "companion.frontTireRim") }, { key: 'rearTireRim', label: companionText("Rear rim (in)", "companion.rearTireRim") },
    { key: 'maxHp', label: companionText("Maximum power (hp)", "companion.maxHp") }, { key: 'maxTorque', label: companionText("Maximum torque (Nm)", "companion.maxTorque") },
    { key: 'maxHpRpm', label: companionText("Peak power rpm", "companion.maxHpRpm") }, { key: 'maxTorqueRpm', label: companionText("Peak torque rpm", "companion.maxTorqueRpm") },
  ];
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
  const readinessMessage = snapshot.calculationStatus === 'pending' ? companionText("Calculating tuning results…", "companion.readiness_pending")
    : snapshot.calculationStatus === 'error' ? companionText("Tuning calculation is unavailable. Retrying…", "companion.readiness_error")
    : usesCvt(profile) ? t('CVT recommendations are unavailable pending real capture and solver validation.') : !snapshot.readiness.mechanical ? companionText("Enter vehicle weight and distribution to unlock chassis tuning.", "companion.weight_missing")
    : !snapshot.readiness.engineInputs ? companionText("Enter engine power to unlock measurement.", "companion.engine_inputs_missing")
      : !snapshot.readiness.measuredEngine ? companionText("Complete engine measurement before gearing and step 4.", "companion.measurement_missing")
        : companionText("Engine measurement is ready. Verify the setup on the PC before saving.", "companion.ready_message");
  return <div className="companion-stack">
    <nav className="companion-section-nav workspace-tabs nav" aria-label={companionText("Tuning sections", "companion.tuning_sections")}>{sections.map(({ id, label }) => <button key={id} type="button" className={`nav-link ${activeSection === id ? 'active' : ''}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => { navigationTarget.current = { id, until: performance.now() + 800 }; setActiveSection(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{label}</button>)}</nav>
    <section id="companion-setup" className="companion-panel companion-tuning-setup"><div className="d-flex justify-content-between align-items-center"><div><h2>{snapshot.carName}</h2><p className="text-body-secondary">{companionText("Step", "companion.step")} {workflow.step}: {companionText(workflow.goal, `companion.${workflow.goal}`)} · {companionText(workflow.season, `companion.${workflow.season}`)}</p></div><span className="badge text-bg-info">{companionText("PC snapshot", "companion.pc_snapshot")}</span></div>
      <div className="companion-form-grid companion-workflow-controls"><label className="companion-field"><span>{companionText("Goal", "companion.goal")}</span><select className="form-select" disabled={disabled} value={workflow.goal} onChange={(e) => void onCommand({ kind: 'workflow', goal: e.target.value })}>{['Road', 'Rally', 'Drift', 'Drag'].map((item) => <option key={item} value={item}>{companionText(item, `companion.${item}`)}</option>)}</select></label><label className="companion-field"><span>{companionText("Season", "companion.season")}</span><select className="form-select" disabled={disabled} value={workflow.season} onChange={(e) => void onCommand({ kind: 'workflow', season: e.target.value })}>{['Summer', 'Autumn', 'Winter', 'Spring'].map((item) => <option key={item} value={item}>{companionText(item, `companion.${item}`)}</option>)}</select></label><label className="companion-field"><span>{companionText("Workflow step", "companion.workflow_step")}</span><select className="form-select" disabled={disabled} value={workflow.step} onChange={(e) => void onCommand({ kind: 'workflow', step: Number(e.target.value) })}>{[1, 2, 3, 4].map((item) => <option key={item} value={item} disabled={!canOpenTuningStep(item, snapshot.readiness)}>{item}</option>)}</select></label></div>
      <p className="companion-readiness text-body-secondary" role="status">{readinessMessage}</p>
      <details className="companion-profile-details"><summary><span>{companionText("Vehicle parameters", "companion.vehicle_parameters")}</span><span className="companion-profile-summary">{profile ? `${profile.weight} kg · ${profile.maxHp} hp` : companionText("No profile", "companion.no_profile")}{editing ? ` · ${companionText("Unsaved draft", "companion.unsaved_draft")}` : ''}</span></summary>
        <div className="companion-profile-body">
          <div className="companion-form-grid">{fields.map((field) => <label key={String(field.key)} className="companion-field"><span>{field.label}</span>{field.type === 'select' ? <select className="form-select" value={String(value(field.key))} disabled={disabled} onChange={(e) => setValue(field.key, e.target.value)}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input className="form-control" type="number" value={String(value(field.key))} disabled={disabled} onChange={(e) => setValue(field.key, e.target.value)} />}</label>)}</div>
          <p className="text-body-secondary small mb-0">{companionText("Apply sends an edit to the desktop working draft. Use the desktop Save Setup action to persist it.", "companion.apply_hint")}</p>
          {identityChanged && <div className="companion-message is-error">{companionText("PC vehicle parameters changed. Discard this draft before editing the new vehicle.", "companion.pc_vehicle_params_changed")}</div>}
          {draftError && <div className="companion-message is-error">{draftError}</div>}
          <div className="d-flex gap-2 mt-3"><button className="btn btn-primary flex-grow-1" disabled={disabled || identityChanged || !Object.keys(draft).length} onClick={() => void profileCommand()}>{companionText("Apply profile draft", "companion.apply_profile_draft")}</button><button className="btn btn-outline-secondary" disabled={!editing} onClick={() => { setDraft({}); setDraftError(null); setEditing(false); setDraftIdentity(`${snapshot.carId}:${snapshot.profileKey}`); }}>{companionText("Discard", "companion.discard")}</button></div>
        </div>
      </details>
    </section>
    <div className="companion-tuning-results"><ChassisResults result={snapshot.results.chassis} /><AlignmentResults result={snapshot.results.alignment} /></div>
    <section id="companion-engine">{usesCvt(profile) ? <CvtFoundationPanel result={snapshot.results.cvt} t={t} /> : <CompanionMeasurement measurement={measurement} disabled={disabled} onCommand={onCommand} />}</section>
    <GearingResults result={snapshot.results.gearing} measurementPhase={measurement.phase} unavailableMessage={usesCvt(profile) ? t('CVT recommendations are unavailable pending real capture and solver validation.') : undefined} />
  </div>;
}
