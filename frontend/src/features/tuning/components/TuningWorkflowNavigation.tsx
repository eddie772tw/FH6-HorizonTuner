import { useSettings } from '../../../context/SettingsContext';
import { canOpenTuningStep, nextTuningStep, TUNING_WORKFLOW_STEPS, type WorkflowReadiness } from '../tuningWorkflow';

export function TuningWorkflowNavigation({ currentStep, readiness, onSelect }: {
  currentStep: number;
  readiness: WorkflowReadiness;
  onSelect: (step: number) => void;
}) {
  const { t } = useSettings();
  const next = nextTuningStep(currentStep, readiness);
  return <nav aria-label={t('Tuning workflow')} className="d-flex flex-column gap-2">
    <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
      <p className="small text-body-secondary mb-0">{t('Recommended order. Available sections can be opened independently.')}</p>
      <div className="d-flex gap-2">
        {currentStep > 1 && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onSelect(currentStep - 1)}>{t('Previous')}</button>}
        {currentStep > 1 && next !== null && <button type="button" className="btn btn-primary btn-sm" onClick={() => onSelect(next)}>{t('Next')}</button>}
      </div>
    </div>
    <ul className="nav nav-pills nav-justified flex-wrap gap-2 bg-body-tertiary p-2 rounded border">
      {TUNING_WORKFLOW_STEPS.map(step => {
        const enabled = canOpenTuningStep(step.number, readiness);
        const reason = !readiness.mechanical ? 'Enter valid vehicle weight and front weight percentage first.' : 'Complete engine-data preparation before verifying the complete setup.';
        return <li className="nav-item" key={step.id} style={{ minWidth: '130px' }}>
          <span title={!enabled ? t(reason) : undefined} tabIndex={!enabled ? 0 : undefined} className="d-block">
            <button type="button" className={`nav-link w-100 d-flex align-items-center justify-content-center gap-2 ${currentStep === step.number ? 'active fw-bold' : ''}`}
              aria-current={currentStep === step.number ? 'step' : undefined} disabled={!enabled} onClick={() => onSelect(step.number)}>
              <span className="badge text-bg-secondary">{step.number}</span>{t(step.label)}
            </button>
          </span>
        </li>;
      })}
    </ul>
  </nav>;
}
