import React, { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { PedalTraceSection } from './PedalTraceSection';
import { GRadarSection } from './GRadarSection';
import { TireSuspensionSection } from './TireSuspensionSection';

const AnalysisView = React.lazy(() => import('../../components/AnalysisView'));
const DragTestView = React.lazy(() => import('../../components/DragTestView'));

const activeTabStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const inactiveTabStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  cursor: 'pointer',
};

export const TelemetryViewIndex: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'live' | 'drag' | 'analysis'>('live');
  const { t } = useSettings();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
        <button
          style={activeSubTab === 'live' ? activeTabStyle : inactiveTabStyle}
          onClick={() => setActiveSubTab('live')}
        >
          {t('live_telemetry')}
        </button>
        <button
          style={activeSubTab === 'drag' ? activeTabStyle : inactiveTabStyle}
          onClick={() => setActiveSubTab('drag')}
        >
          {t('drag_test')}
        </button>
        <button
          style={activeSubTab === 'analysis' ? activeTabStyle : inactiveTabStyle}
          onClick={() => setActiveSubTab('analysis')}
        >
          {t('post_race_analysis')}
        </button>
      </div>

      {activeSubTab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <PedalTraceSection t={t} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <GRadarSection t={t} />
            <TireSuspensionSection t={t} />
          </div>
        </div>
      )}

      {activeSubTab === 'drag' && (
        <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading Drag Test...</div>}>
          <DragTestView />
        </React.Suspense>
      )}

      {activeSubTab === 'analysis' && (
        <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading Post-Race Analysis...</div>}>
          <AnalysisView />
        </React.Suspense>
      )}
    </div>
  );
};

export default TelemetryViewIndex;
