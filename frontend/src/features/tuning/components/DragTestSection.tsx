import React, { memo } from 'react';
import { useSettings } from '../../../context/SettingsContext';

interface DragTestSectionProps {
  selectedRaceGoal: string;
  dragTestStatus: string;
  dragPointsCount: number;
  selectedDragSession: string;
  globalSavedSessions: any[];
  activeDragData: any[];
  handleStartDragTest: () => void;
  handleClearDragTest: () => void;
  handleLoadDragSession: (val: string) => void;
  handleSaveDragSession: () => void;
  applyDragOptimizedGearing: () => void;
}

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--primary)',
  color: 'black',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const DragTestSectionComponent: React.FC<DragTestSectionProps> = ({
  selectedRaceGoal,
  dragTestStatus,
  dragPointsCount,
  selectedDragSession,
  globalSavedSessions,
  activeDragData,
  handleStartDragTest,
  handleClearDragTest,
  handleLoadDragSession,
  handleSaveDragSession,
  applyDragOptimizedGearing
}) => {
  const { t } = useSettings();

  if (selectedRaceGoal !== 'SpeedZone') return null;

  return (
    <div style={{ background: 'rgba(255, 150, 0, 0.05)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--accent)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.9rem' }}>🏎️ {t("Drag Test Optimizer (Alternative Gearing)")}</span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleStartDragTest} style={{ ...btnStyle, flex: 1, padding: '0.35rem', fontSize: '0.75rem' }}>
          {t("Start drag run")}
        </button>
        <button onClick={handleClearDragTest} style={{ ...btnStyle, flex: 1, padding: '0.35rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', color: 'white' }}>
          {t("Reset run")}
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
        <span>{t("Drag Status:")} <strong style={{ color: dragTestStatus==='recording'?'#0f0':'white' }}>{dragTestStatus.toUpperCase()}</strong></span>
        <span>{dragPointsCount} {t("pts collected")}</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <select 
          value={selectedDragSession} 
          onChange={(e) => handleLoadDragSession(e.target.value)}
          style={{ background: 'black', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', flex: 1, fontSize: '0.8rem' }}
        >
          <option value="">-- {t("Select Drag Test Run")} --</option>
          {globalSavedSessions.map((s: any) => (
            <option key={s.filename} value={s.filename}>{s.filename}</option>
          ))}
        </select>
        <button onClick={handleSaveDragSession} style={{ ...btnStyle, padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', color: 'white' }}>💾 {t("Save Run")}</button>
      </div>
      <button 
        onClick={applyDragOptimizedGearing} 
        disabled={!activeDragData || activeDragData.length === 0}
        style={{ ...btnStyle, background: (activeDragData && activeDragData.length > 0) ? 'var(--accent)' : 'gray', color: 'black', fontSize: '0.8rem', padding: '0.4rem' }}
      >
        ⚙️ {t("Calculate optimized FD & 1st gear")}
      </button>
    </div>
  );
};

export const DragTestSection = memo(DragTestSectionComponent);
