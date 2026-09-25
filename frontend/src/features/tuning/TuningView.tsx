import { RoadWorkflowView } from '../road/RoadWorkflowView';
import { useEffect, useMemo, useState } from 'react';
import { useCarParams } from '../../context/CarParamsContext';
import { ScopedUnitSettingsProvider, useSettings } from '../../context/SettingsContext';
import { calculateChassisTuning, calculateStaticTireAlignment, type Season } from '../../utils/tuningMath';
import { calculateWizardMeasuredGearing } from './measurementTuningProfile';
import { UnitSettingsSidebar } from '../../components/UnitSettingsSidebar';
import { createUnitPreference, loadUnitPreference, resolveUnitPreference, type UnitPreferenceOverride } from '../../utils/gameUnitSettings';
import { Step1GoalSetup } from './components/Step1GoalSetup';
import { Step2ChassisTuner } from './components/Step2ChassisTuner';
import { EngineDataStep } from './components/EngineDataStep';
import { WorkflowGuide } from './components/WorkflowGuide';
import { SetupVerificationStep } from './components/SetupVerificationStep';
import { canOpenTuningStep, getWorkflowReadiness, resolveTuningStep, TUNING_WORKFLOW_STEPS, updateWorkflowProfile } from './tuningWorkflow';
import { useTuneSession } from './TuneSessionProvider';
import { selectedEngineObservationMatchesLiveTelemetry } from './tuneSessionController';
import { useTelemetry } from '../../hooks/useTelemetry';

function TuningViewContent({ unitPreference, onUnitPreferenceChange }: {
    unitPreference: UnitPreferenceOverride; onUnitPreferenceChange: (value: UnitPreferenceOverride) => void;
  }) {
  const { carId, carName, carParams: liveCarParams, setCarParams, saveCarParams, isLoading, loadedCarId } = useCarParams();
  const { t } = useSettings();
  const { data } = useTelemetry();
  const session = useTuneSession();
  const [showUnits, setShowUnits] = useState(false);
  const currentStep = session.workflow.step;
  const goal = session.workflow.goal;
  const season = session.workflow.season as Season;
  const profile = session.profile;
  const engine = session.engine;
  const prepared = selectedEngineObservationMatchesLiveTelemetry(carId, engine.current, data) ? engine.current : null;
  const reviewHistory = session.workflow.reviewHistory;
  const setCurrentStep = (next: number | ((previous: number) => number)) => {
    const resolved = typeof next === 'function' ? next(currentStep) : next;
    session.workflow.setStep(resolved);
  };

  const gears = profile?.adjustability.gears || 6;
  const chassis = useMemo(() => profile ? calculateChassisTuning(goal, profile) : null, [goal, profile]);
  const alignment = useMemo(() => profile ? calculateStaticTireAlignment(goal, season, profile) : null, [goal, season, profile]);
  const gearing = useMemo(() => calculateWizardMeasuredGearing(goal, gears, profile, prepared ? {
    engineMaxRpm: prepared.engineMaxRpm!, peakPowerRpm: prepared.observedPeakPower!.rpm,
    peakTorqueRpm: prepared.observedPeakTorque!.rpm,
  } : null), [goal, gears, profile, prepared]);
  const readiness = getWorkflowReadiness(!isLoading && loadedCarId === carId, profile, Boolean(gearing));
  useEffect(() => {
    const step = resolveTuningStep(currentStep, readiness);
    if (step !== currentStep) setCurrentStep(step);
  }, [currentStep, readiness.mechanical, readiness.engineInputs, readiness.measuredEngine]);
  const inputSnapshot = useMemo(() => ({ carId, goal, season, profile,
    engineObservation: engine.observation }), [carId, goal, season, profile, engine.observation]);

  return <div className="container-fluid h-100 d-flex flex-column gap-3 p-0 overflow-auto">
    <header>
      <div className="workspace-toolbar mb-2">
        <div className="small text-body-secondary" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{carName} · {carId}</div>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-outline-secondary" onClick={() => session.workflow.setReviewHistory(value => !value)}>{t(reviewHistory ? 'Return to current setup' : 'Review saved runs')}</button>
          {currentStep > 1 && <button className="btn btn-outline-secondary" onClick={() => setCurrentStep(currentStep - 1)}>{t('Previous')}</button>}
          {currentStep < 4 && <button className="btn btn-primary" disabled={!canOpenTuningStep(currentStep + 1, readiness)} onClick={() => setCurrentStep(currentStep + 1)}>{t('Next')}</button>}
        </div>
      </div>
      <nav className="nav nav-pills gap-2 flex-wrap" aria-label={t('Tuning workflow steps')}>
        {TUNING_WORKFLOW_STEPS.map(step => <button key={step.id} className={'nav-link ' + (currentStep === step.number ? 'active' : '')}
          aria-current={currentStep === step.number ? 'step' : undefined} disabled={!canOpenTuningStep(step.number, readiness)}
          title={step.number === 4 && !readiness.measuredEngine ? t('Complete engine measurement before verifying the full setup.') : undefined}
          onClick={() => { session.workflow.setReviewHistory(false); setCurrentStep(step.number); }}>{step.number}. {t(step.label)}</button>)}
      </nav>
      <div className="small text-body-secondary mt-2" role="status">{t(!readiness.mechanical ? 'Complete the vehicle weight and distribution first.' : !readiness.measuredEngine ? 'Mechanical estimates are available. Engine data and gearing still require measurement.' : 'Engine measurement is ready. Confirm game settings before recording a validation run.')}</div>
      {!reviewHistory && <WorkflowGuide readiness={readiness} currentStep={currentStep} openStep={step => setCurrentStep(step)} />}
    </header>
    {!reviewHistory && currentStep === 1 && <Step1GoalSetup measuredEngineInputs selectedRaceGoal={goal} setSelectedRaceGoal={session.workflow.setGoal} season={season} setSeason={session.workflow.setSeason}
      carParams={profile} updateParam={(key, value) => {
        const updated = profile && updateWorkflowProfile(liveCarParams, key, value);
        if (updated) setCarParams(updated);
      }}
      hasCoreParams={readiness.mechanical} onOpenUnitSettings={() => setShowUnits(true)}
      onProceed={async () => { await saveCarParams(); setCurrentStep(2); }} />}
    {!reviewHistory && currentStep === 2 && <Step2ChassisTuner selectedRaceGoal={goal} season={season} carParams={profile}
      chassis={chassis} alignment={alignment} saveCarParams={saveCarParams} />}
    {!reviewHistory && currentStep === 3 && <EngineDataStep carId={carId} profile={profile} engine={engine} gearing={gearing} enabled={readiness.engineInputs} />}
    {!reviewHistory && currentStep === 4 && <SetupVerificationStep goal={goal} carId={carId} profile={profile} chassis={chassis}
      alignment={alignment} gearing={gearing} inputSnapshot={inputSnapshot} />}
    {reviewHistory && <RoadWorkflowView recommendation={null} carId={carId} />}
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
