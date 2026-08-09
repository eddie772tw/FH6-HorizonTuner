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
    <div className="d-flex flex-column justify-content-center flex-grow-1">
      <div className="d-flex justify-content-between text-secondary" style={{ fontSize: '0.85rem' }}>
        <span>{t("Steer L")}</span>
        <span>{t("Steer R")}</span>
      </div>
      <div className="w-100 position-relative mt-1 border" style={{ height: '16px', background: 'var(--surface-2)', borderColor: 'var(--glass-border) !important', borderRadius: '8px' }}>
        <div ref={barRef} className="position-absolute h-100" style={{
          background: 'var(--primary)',
          width: '0%', left: '50%'
        }} />
        <div className="position-absolute" style={{ left: '50%', top: '-2px', bottom: '-2px', width: '2px', background: 'var(--divider)' }} />
      </div>
    </div>
  );
});

export default SteerBar;
