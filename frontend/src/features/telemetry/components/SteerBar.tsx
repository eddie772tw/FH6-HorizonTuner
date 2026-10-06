import { useTelemetryCardPaint } from './TelemetryCardVisibility';
import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: SteerBar ---
const SteerBar: React.FC = React.memo(() => {
  const paint = useTelemetryCardPaint();
  const latestSteer = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const { t } = useSettings();
  useEffect(() => {
    const draw = () => {
      if (!paint.canPaint()) return;
      const steer = latestSteer.current;
      if (barRef.current) {
        barRef.current.style.width = `${Math.abs(steer) / 127 * 50}%`;
        barRef.current.style.left = steer < 0 ? `${50 - (Math.abs(steer)/127*50)}%` : '50%';
      }
    };
    const handleDraw = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data || data.IsRaceOn !== 1) return;
      latestSteer.current = data.SteerInput || 0;
      draw();
    };
    const stopPaint = paint.subscribe(draw);
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => {
      stopPaint();
      telemetryEmitter.removeEventListener('update', handleDraw);
    };
  }, [paint]);
  return (
    <div className="d-flex flex-column justify-content-center flex-grow-1">
      <div className="d-flex justify-content-between text-body-secondary fs-7 fw-medium">
        <span>{t("Steer L")}</span>
        <span>{t("Steer R")}</span>
      </div>
      <div className="w-100 position-relative mt-1 border rounded-pill overflow-hidden" style={{ height: '14px', background: 'var(--surface-2)', borderColor: 'var(--glass-border) !important' }}>
        <div ref={barRef} className="position-absolute h-100 rounded-pill" style={{
          background: 'var(--primary)',
          width: '0%', left: '50%'
        }} />
        <div className="position-absolute" style={{ left: '50%', top: 0, bottom: 0, width: '2px', background: 'var(--divider)', zIndex: 2 }} />
      </div>
    </div>
  );
});

export default SteerBar;
