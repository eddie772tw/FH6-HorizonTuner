import React from 'react';
import LegacyTuningView from '../../components/TuningView';

export const TuningViewIndex: React.FC<{ setActiveTab?: (tab: any) => void }> = (props) => {
  return <LegacyTuningView {...props} />;
};

export default TuningViewIndex;
