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
import { useEngineMeasurementArchive } from './useEngineMeasurementArchive';
import { canOpenTuningStep, getWorkflowReadiness, resolveTuningStep, serializeWorkflowProfile, TUNING_WORKFLOW_STEPS } from './tuningWorkflow';
import { useTelemetry } from '../../hooks/useTelemetry';

interface Props {
  currentStep?: number;
  setCurrentStep?: (step: number | ((previous: number) => number)) => void;
  setActiveTab?: (tab: any) => void;
}

function TuningViewContent({ currentStep: externalStep, setCurrentStep: externalSetStep,
  unitPreference, onUnitPreferenceChange }: Props & {
    unitPreference: UnitPreferenceOverride; onUnitPreferenceChange: (value: UnitPreferenceOverride) => void;
  }) {
  const { carId, carName, carParams, setCarParams, saveCarParams, isLoading, loadedCarId } = useCarParams();
  const { data } = useTelemetry();
  const { t } = useSettings();
  const [internalStep, setInternalStep] = useState(1);
  const currentStep = externalStep ?? internalStep;
  const setCurrentStep = externalSetStep ?? setInternalStep;
  const [goal, setGoal] = useState('Road');
  const [season, setSeason] = useState<Season>('Summer');
  const [showUnits, setShowUnits] = useState(false);
  const [reviewHistory, setReviewHistory] = useState(false);
  const staticJson = serializeWorkflowProfile(loadedCarId === carId ? carParams : null);
  const profile = useMemo(() => JSON.parse(staticJson) as typeof carParams, [staticJson]);
  const engine = useEngineMeasurementArchive(carId, profile);
  const measurement = engine.current;
  const liveIdentityMatches = !data || data.IsRaceOn !== 1 || !measurement || (
    String(data.CarOrdinal) === carId && data.CarPerformanceIndex === measurement.identity?.performanceIndex &&
    data.CarClass === measurement.identity?.carClass && data.EngineMaxRpm === measurement.engineMaxRpm);
  useEffect(() => { if (!liveIdentityMatches) engine.invalidate(); }, [liveIdentityMatches]);
  const prepared = liveIdentityMatches ? measurement : null;
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
    <header className="border-bottom pb-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div><h2 className="h4 text-primary">{t('Tuning Wizard')}</h2><span>{carName} · {carId}</span></div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={() => setReviewHistory(value => !value)}>{t(reviewHistory ? 'Return to current setup' : 'Review saved runs')}</button>
          {currentStep > 1 && <button className="btn btn-outline-secondary" onClick={() => setCurrentStep(currentStep - 1)}>{t('Previous')}</button>}
          {currentStep < 4 && <button className="btn btn-primary" disabled={!canOpenTuningStep(currentStep + 1, readiness)} onClick={() => setCurrentStep(currentStep + 1)}>{t('Next')}</button>}
        </div>
      </div>
      <nav className="nav nav-pills gap-2" aria-label={t('Tuning workflow steps')}>
        {TUNING_WORKFLOW_STEPS.map(step => <button key={step.id} className={'nav-link ' + (currentStep === step.number ? 'active' : '')}
          aria-current={currentStep === step.number ? 'step' : undefined} disabled={!canOpenTuningStep(step.number, readiness)}
          title={step.number === 4 && !readiness.measuredEngine ? t('Complete engine measurement before verifying the full setup.') : undefined}
          onClick={() => { setReviewHistory(false); setCurrentStep(step.number); }}>{step.number}. {t(step.label)}</button>)}
      </nav>
      <div className="small text-body-secondary mt-2" role="status">{t(!readiness.mechanical ? 'Complete the vehicle weight and distribution first.' : !readiness.measuredEngine ? 'Mechanical estimates are available. Engine data and gearing still require measurement.' : 'Engine measurement is ready. Confirm game settings before recording a validation run.')}</div>
      {!reviewHistory && <WorkflowGuide readiness={readiness} currentStep={currentStep} openStep={step => setCurrentStep(step)} />}
    </header>
    {!reviewHistory && currentStep === 1 && <Step1GoalSetup measuredEngineInputs selectedRaceGoal={goal} setSelectedRaceGoal={setGoal} season={season} setSeason={setSeason}
      carParams={profile} updateParam={(key, value) => profile && setCarParams({ ...profile, [key]: value })}
      hasCoreParams={readiness.mechanical} onOpenUnitSettings={() => setShowUnits(true)}
      onProceed={async () => { await saveCarParams(); setCurrentStep(2); }} />}
    {!reviewHistory && currentStep === 2 && <Step2ChassisTuner selectedRaceGoal={goal} season={season} carParams={profile}
      chassis={chassis} alignment={alignment} saveCarParams={saveCarParams} />}
    {!reviewHistory && currentStep === 3 && <EngineDataStep key={carId + engine.key} carId={carId} profile={profile} engine={engine} gearing={gearing} enabled={readiness.engineInputs} />}
    {!reviewHistory && currentStep === 4 && <SetupVerificationStep goal={goal} carId={carId} profile={profile} chassis={chassis}
      alignment={alignment} gearing={gearing} inputSnapshot={inputSnapshot} />}
    {reviewHistory && <RoadWorkflowView recommendation={null} carId={carId} />}
    <UnitSettingsSidebar idPrefix="tuning-units" show={showUnits} title={t('Tuning Workflow Unit Settings')}
      preference={unitPreference} onChange={onUnitPreferenceChange} onClose={() => setShowUnits(false)} />
  </div>;
}

export default function TuningView(props: Props) {
  const { settings } = useSettings();
  const [preference, setPreference] = useState(() => loadUnitPreference('tuning_unit_preference', settings.units));
  const units = useMemo(() => resolveUnitPreference(settings.units, preference), [settings.units, preference]);
  const update = (value: UnitPreferenceOverride) => {
    const normalized = preference.followGlobal && !value.followGlobal ? { ...createUnitPreference(settings.units), followGlobal: false } : value;
    setPreference(normalized);
    localStorage.setItem('tuning_unit_preference', JSON.stringify(normalized));
  };
  return <ScopedUnitSettingsProvider units={units}><TuningViewContent {...props} unitPreference={preference} onUnitPreferenceChange={update} /></ScopedUnitSettingsProvider>;
}
