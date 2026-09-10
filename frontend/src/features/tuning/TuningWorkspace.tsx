import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { RoadWorkflowView } from '../road/RoadWorkflowView';
import TuningView from './TuningView';

/** Road is the default task entry; existing domain pages remain available. */
export default function TuningWorkspace(props: ComponentProps<typeof TuningView>) {
  const { t } = useSettings();
  const [details, setDetails] = useState(false);
  const previousStep = useRef(props.currentStep);
  useEffect(() => {
    if (props.currentStep !== previousStep.current) setDetails(true);
    previousStep.current = props.currentStep;
  }, [props.currentStep]);
  return <div className="d-flex flex-column h-100" style={{ minHeight: 0 }}>
    <div className="d-flex flex-wrap gap-2 mb-2">
      <button className={'btn btn-sm ' + (!details ? 'btn-primary' : 'btn-outline-secondary')} onClick={() => setDetails(false)}>{t('Road comparison assistant')}</button>
      <button className={'btn btn-sm ' + (details ? 'btn-primary' : 'btn-outline-secondary')} onClick={() => setDetails(true)}>{t('Detailed tuning pages')}</button>
    </div>
    <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: 0 }}>
      {details ? <TuningView {...props} /> : <RoadWorkflowView />}
    </div>
  </div>;
}
