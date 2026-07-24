import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: SteerBar ---
const SteerBar: React.FC = React.memo(() => {
  const barRef = useRef<HTMLDivElement>(null);
  const { t } = useSettings();
  useEffect(() => {
    const handleDraw = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data || data.IsRaceOn !== 1) return;
      const steer = data.SteerInput || 0;
      if (barRef.current) {
        barRef.current.style.width = `${Math.abs(steer) / 127 * 50}%`;
        barRef.current.style.left = steer < 0 ? `${50 - (Math.abs(steer)/127*50)}%` : '50%';
      }
    };
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, []);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <span>{t("Steer L")}</span>
        <span>{t("Steer R")}</span>
      </div>
      <div style={{ width: '100%', height: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative', marginTop: '4px' }}>
        <div ref={barRef} style={{ 
          position: 'absolute', height: '100%', background: 'white',
          width: '0%', left: '50%', transition: 'width 0.05s linear, left 0.05s linear'
        }} />
        <div style={{ position: 'absolute', left: '50%', top: '-2px', bottom: '-2px', width: '2px', background: 'gray' }} />
      </div>
    </div>
  );
});

export default SteerBar;
