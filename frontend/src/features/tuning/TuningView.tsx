import { RoadWorkflowView } from '../road/RoadWorkflowView';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCarParams } from '../../context/CarParamsContext';
import { ScopedUnitSettingsProvider, useSettings } from '../../context/SettingsContext';
import type { Season } from '../../domain/tuning/types';
import { UnitSettingsSidebar } from '../../components/UnitSettingsSidebar';
import { createUnitPreference, loadUnitPreference, resolveUnitPreference, type UnitPreferenceOverride } from '../../utils/gameUnitSettings';
import { Step1GoalSetup } from './components/Step1GoalSetup';
import { Step2ChassisTuner } from './components/Step2ChassisTuner';
import { EngineDataStep } from './components/EngineDataStep';
import { EvPowertrainStep } from './components/EvPowertrainStep';
import { WorkflowGuide } from './components/WorkflowGuide';
import { SetupVerificationStep } from './components/SetupVerificationStep';
import { canOpenTuningStep, resolveTuningStep, serializeWorkflowProfile, TUNING_WORKFLOW_STEPS, updateWorkflowProfile } from './tuningWorkflow';
import { useTuneSession } from './TuneSessionProvider';
import { unavailableReadiness } from './useWorkflowCalculation';
import { usesCvt } from '../../domain/tuning/transmission';
import { CvtFoundationPanel } from './components/CvtFoundationPanel';
import { BaselinePreviewPanel } from './components/BaselinePreviewPanel';
import { TuneVehicleSelector } from './components/TuneVehicleSelector';

export function TuningViewContent({ unitPreference, onUnitPreferenceChange }: {
    unitPreference: UnitPreferenceOverride; onUnitPreferenceChange: (value: UnitPreferenceOverride) => void;
  }) {
  const { carId, carName, carParams: liveCarParams, setCarParams, saveCarParams, selectionGeneration = 0,
    hasUnsavedParams = false, isSavingCarParams = false, paramsSaveStatus = 'idle' } = useCarParams();
  const { t } = useSettings();
  const session = useTuneSession();
  const [showUnits, setShowUnits] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const navigationLock = useRef(false);
  const navigationSequence = useRef(0);
  const [saveError, setSaveError] = useState(false);
  const [childBusy, setChildBusy] = useState(false);
  const childBusyRef = useRef(false);
  const reportBusy = useCallback((busy: boolean) => { childBusyRef.current = busy; setChildBusy(busy); }, []);
  const currentStep = session.workflow.step;
  const goal = session.workflow.goal;
  const season = session.workflow.season as Season;
  const goalPending = session.baseline.goal !== goal;
  // Recheck after asynchronous saves; a new draft must not be bypassed by an older handler.
  const goalPendingRef = useRef(goalPending);
  goalPendingRef.current = goalPending;
  const goalPendingMessage = t('Apply the draft target below or keep the applied target before continuing.');
  const profile = session.profile;
  const engine = session.engine;
  const operationPending = navigating || isSavingCarParams || Boolean(engine.pendingSave) || childBusy || Boolean(session.cvtEvidence?.busy);
  const latest = useRef('');
  latest.current = JSON.stringify([selectionGeneration, session.identityGeneration, serializeWorkflowProfile(liveCarParams), goal]);
  const readiness = session.result?.readiness ?? unavailableReadiness;
  const latestReadiness = useRef(readiness); latestReadiness.current = readiness;
  useEffect(() => { ++navigationSequence.current; navigationLock.current = false; setNavigating(false); setSaveError(false); }, [selectionGeneration]);
  const reviewHistory = session.workflow.reviewHistory;
  const setCurrentStep = (next: number | ((previous: number) => number)) => {
    const resolved = typeof next === 'function' ? next(currentStep) : next;
    if (resolved > 1 && goalPendingRef.current) return;
    if (!canOpenTuningStep(resolved, latestReadiness.current)) return;
    session.workflow.setStep(resolved);
  };
  const saveAndAct = async (action?: () => void, forceSave = false, allowDraft = false) => {
    if (navigationLock.current || operationPending || childBusyRef.current) return;
    if (!hasUnsavedParams && !forceSave) { action?.(); return; }
    navigationLock.current = true; setNavigating(true); setSaveError(false);
    const sequence = ++navigationSequence.current;
    const origin = latest.current;
    try {
      await saveCarParams();
      if (sequence === navigationSequence.current && origin === latest.current && (allowDraft || !goalPendingRef.current)) action?.();
    } catch { if (sequence === navigationSequence.current && origin === latest.current) setSaveError(true); }
    finally { if (sequence === navigationSequence.current) { navigationLock.current = false; setNavigating(false); } }
  };
  const openStep = (step: number) => {
    if ((step > 1 && goalPendingRef.current) || !canOpenTuningStep(step, readiness)) return;
    void saveAndAct(() => { session.workflow.setReviewHistory(false); setCurrentStep(step); }, false, step === 1);
  };

  const chassis = session.result?.chassis ?? null;
  const alignment = session.result?.alignment ?? null;
  const gearing = session.result?.gearing ?? null;
  useEffect(() => {
    if (session.calculationStatus !== 'ready') return;
    const step = resolveTuningStep(currentStep, readiness);
    if (step !== currentStep) setCurrentStep(step);
  }, [session.calculationStatus, currentStep, readiness.mechanical, readiness.engineInputs, readiness.measuredEngine, readiness.gearingAvailable]);
  return <div className="tuning-workflow container-fluid h-100 d-flex flex-column gap-3 p-0 overflow-auto">
    <header>
      <TuneVehicleSelector />
      <div className="workspace-toolbar mb-2">
        <div className="small text-body-secondary" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{carName} · {carId}</div>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-outline-secondary" disabled={operationPending || goalPending} onClick={() => void saveAndAct(() => session.workflow.setReviewHistory(value => !value))}>{t(reviewHistory ? 'Return to current setup' : 'Review saved runs')}</button>
          {currentStep > 1 && <button className="btn btn-outline-secondary" disabled={operationPending} onClick={() => openStep(currentStep - 1)}>{t('Previous')}</button>}
          {currentStep < 4 && <button className="btn btn-primary" disabled={operationPending || goalPending || !canOpenTuningStep(currentStep + 1, readiness)} aria-describedby="tuning-save-status tuning-target-status" onClick={() => openStep(currentStep + 1)}>{t(currentStep === 1 ? 'Go to chassis & tires' : currentStep === 2 ? 'Go to engine data & gearing' : 'Go to setup verification')}</button>}
        </div>
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2 small" style={{ minHeight: '2.5rem' }}>
        <span id="tuning-target-status" role="status">{t('Applied target')}: {t(goal)}{goalPending && <> · {t('Draft target')}: {t(session.baseline.goal)}. {goalPendingMessage}</>}</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={operationPending || !goalPending} onClick={session.baseline.cancel}>{t('Keep applied target')}</button>
      </div>
      <div id="tuning-save-status" role="status" aria-live="polite" className="small text-body-secondary" style={{ minHeight: '3em' }}>
        {t(saveError || paramsSaveStatus === 'error' ? 'Vehicle parameters could not be saved. Your edits are retained. Retry Save vehicle parameters or navigation.' : operationPending ? 'Saving changes. Wait before navigating.' : hasUnsavedParams ? 'Unsaved vehicle parameters. Navigation saves them before leaving this step.' : paramsSaveStatus === 'saved' ? 'Vehicle parameters saved.' : 'Vehicle parameters are up to date.')}
        <br />{t('Local baseline changes stay in this session. Save vehicle parameters does not save recommendations or apply values in game.')}
      </div>
      <nav className="workspace-tabs tuning-workflow__steps nav" aria-label={t('Tuning workflow steps')}>
        {TUNING_WORKFLOW_STEPS.map(step => <button key={step.id} className={'nav-link ' + (currentStep === step.number ? 'active' : '')}
          aria-current={currentStep === step.number ? 'step' : undefined} disabled={operationPending || (step.number > 1 && goalPending) || !canOpenTuningStep(step.number, readiness)} aria-describedby="tuning-save-status tuning-target-status"
          title={step.number === 4 && !readiness.gearingAvailable ? t('Engine analysis and a feasible gearing result are required before setup verification.') : undefined}
          onClick={() => openStep(step.number)}><span className="workspace-tabs__number">{step.number}.</span> {t(step.label)}</button>)}
      </nav>
      <div className="small text-body-secondary mt-2" role="status" style={{ minHeight: '3em' }}>{t(session.calculationStatus === 'pending' ? 'Calculating tuning results…' : session.calculationStatus === 'error' ? 'Tuning calculation is unavailable. Retrying…' : usesCvt(profile) ? 'CVT recommendations are unavailable pending real capture and solver validation.' : !readiness.mechanical ? 'Complete the vehicle weight and distribution first.' : !readiness.measuredEngine ? 'Mechanical estimates are available. Engine data and gearing still require measurement.' : !readiness.gearingAvailable ? 'Engine analysis is ready, but the gearing model has no feasible result. Review Step 3.' : 'Engine measurement is ready. Confirm game settings before recording a validation run.')}</div>
      <div style={{ display: 'flow-root', minHeight: '2.5rem' }}>
        {!reviewHistory && session.calculationStatus === 'ready' && <WorkflowGuide forwardBlocked={goalPending} busy={operationPending} readiness={readiness} currentStep={currentStep} openStep={openStep} />}
      </div>
    </header>
    {!reviewHistory && currentStep === 1 && <Step1GoalSetup measuredEngineInputs selectedRaceGoal={session.baseline.goal} setSelectedRaceGoal={session.baseline.setDraftGoal} season={season} setSeason={session.workflow.setSeason}
      carParams={profile} updateParam={(key, value) => {
        const updated = profile && updateWorkflowProfile(liveCarParams, key, value);
        if (updated) setCarParams(updated);
      }}
      hasCoreParams={readiness.mechanical} saving={operationPending} onOpenUnitSettings={() => setShowUnits(true)}
      onProceed={() => saveAndAct(undefined, true)} />}
    {!reviewHistory && [2, 4].includes(currentStep) && session.calculationStatus !== 'ready' && <div className="alert alert-info" role="status">{t(session.calculationStatus === 'error' ? 'Tuning calculation is unavailable. Retrying…' : 'Calculating tuning results…')}</div>}
    {!reviewHistory && currentStep === 2 && session.calculationStatus === 'ready' && <Step2ChassisTuner selectedRaceGoal={goal} season={season} carParams={profile}
      chassis={chassis} alignment={alignment} saving={operationPending} saveCarParams={() => saveAndAct(undefined, true)} />}
    {!reviewHistory && currentStep === 3 && (usesCvt(profile) ? <CvtFoundationPanel result={session.result?.cvt} t={t} evidenceSession={session.cvtEvidence} /> : profile?.isElectric
      ? <EvPowertrainStep key={JSON.stringify([carId, selectionGeneration])} enabled={readiness.engineInputs} onBusyChange={reportBusy} />
      : <EngineDataStep key={JSON.stringify([carId, selectionGeneration, session.identityGeneration, profile])} carId={carId} profile={profile} engine={engine} gearing={gearing && !('model' in gearing) ? gearing : null} enabled={readiness.engineInputs} />)}
    {!reviewHistory && currentStep === 4 && session.calculationStatus === 'ready' && <SetupVerificationStep key={JSON.stringify([carId, selectionGeneration, goal])} goal={goal} carId={carId} recommendation={session.result?.recommendation ?? null} onBusyChange={reportBusy} />}
    {!reviewHistory && [1, 2].includes(currentStep) && <BaselinePreviewPanel busy={operationPending} carId={carId} profile={profile} season={season} draft={session.baseline} showTargetSelector={currentStep !== 1} />}
    {reviewHistory && <RoadWorkflowView recommendation={null} carId={carId} onBusyChange={reportBusy} />}
    <UnitSettingsSidebar idPrefix="tuning-units" show={showUnits} title={t('Tuning Workflow Unit Settings')}
      preference={unitPreference} onChange={onUnitPreferenceChange} onClose={() => setShowUnits(false)} />
  </div>;
}

export default function TuningView() {
  const { settings } = useSettings();
  const [preference, setPreference] = useState(() => loadUnitPreference('tuning_unit_preference', settings.units));
  const units = useMemo(() => resolveUnitPreference(settings.units, preference), [settings.units, preference]);
  const update = (value: UnitPreferenceOverride) => {
    const normalized = preference.followGlobal && !value.followGlobal ? { ...createUnitPreference(settings.units), followGlobal: false } : value;
    setPreference(normalized);
    localStorage.setItem('tuning_unit_preference', JSON.stringify(normalized));
  };
  return <ScopedUnitSettingsProvider units={units}>
    <TuningViewContent unitPreference={preference} onUnitPreferenceChange={update} />
  </ScopedUnitSettingsProvider>;
}
