import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { DragWorkflowView } from '../drag/DragWorkflowView';
import { DriftWorkflowView } from '../drift/DriftWorkflowView';
import { OffroadWorkflowView } from '../offroad/OffroadWorkflowView';
import { RoadWorkflowView } from '../road/RoadWorkflowView';
import TuningView from './TuningView';

export type TuningDiscipline = 'road' | 'offroad' | 'drag' | 'drift';

export default function TuningWorkspace(props: ComponentProps<typeof TuningView>) {
  const { t } = useSettings();
  const [discipline, setDiscipline] = useState<TuningDiscipline>(() => {
    return (localStorage.getItem('tuning-active-discipline') as TuningDiscipline) || 'road';
  });
  const [details, setDetails] = useState<boolean>(() => {
    return localStorage.getItem('tuning-active-mode') === 'detailed';
  });
  const previousStep = useRef(props.currentStep);

  useEffect(() => {
    localStorage.setItem('tuning-active-discipline', discipline);
  }, [discipline]);

  useEffect(() => {
    localStorage.setItem('tuning-active-mode', details ? 'detailed' : 'workflow');
  }, [details]);

  useEffect(() => {
    if (props.currentStep !== previousStep.current) setDetails(true);
    previousStep.current = props.currentStep;
  }, [props.currentStep]);

  const renderWorkflow = () => {
    switch (discipline) {
      case 'offroad': return <OffroadWorkflowView />;
      case 'drag': return <DragWorkflowView />;
      case 'drift': return <DriftWorkflowView />;
      case 'road':
      default: return <RoadWorkflowView />;
    }
  };

  return (
    <div className="d-flex flex-column h-100" style={{ minHeight: 0 }}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <div className="btn-group" role="group">
          <button
            type="button"
            className={`btn btn-sm ${discipline === 'road' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDiscipline('road')}
          >
            {t('Road')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${discipline === 'offroad' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDiscipline('offroad')}
          >
            {t('Offroad / Rally')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${discipline === 'drag' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDiscipline('drag')}
          >
            {t('Drag')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${discipline === 'drift' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDiscipline('drift')}
          >
            {t('Drift')}
          </button>
        </div>

        <div className="btn-group" role="group">
          <button
            type="button"
            className={`btn btn-sm ${!details ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDetails(false)}
          >
            {t('Workflow Assistant')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${details ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDetails(true)}
          >
            {t('Detailed Tuning Pages')}
          </button>
        </div>
      </div>

      <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: 0 }}>
        {details ? <TuningView {...props} /> : renderWorkflow()}
      </div>
    </div>
  );
}
