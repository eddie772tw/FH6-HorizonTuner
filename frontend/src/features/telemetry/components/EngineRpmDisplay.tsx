import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

const EngineRpmDisplay: React.FC = React.memo(() => {
  const rpmRef = useRef<HTMLSpanElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const rpmBarRef = useRef<HTMLDivElement>(null);

  const { t, convertSpeed } = useSettings();
  const speedLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Initial label setting based on settings
    const sampleSpeed = convertSpeed(0);
    if (speedLabelRef.current) speedLabelRef.current.innerText = sampleSpeed.label;

    const handleUpdate = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;

      const rpm = data.CurrentEngineRpm || 0;
      const rpmIdle = data.EngineIdleRpm || 0;
      const rpmMax = data.EngineMaxRpm || 1;
      const rpmPercent = Math.max(0, Math.min(100, ((rpm - rpmIdle) / (rpmMax - rpmIdle)) * 100));
      const gear = data.Gear || 0;
      const speedData = convertSpeed(data.SpeedMetersPerSecond || 0);

      if (rpmRef.current) rpmRef.current.innerText = Math.round(rpm).toString();
      if (gearRef.current) gearRef.current.innerText = gear === 0 ? 'R' : gear.toString();
      if (speedRef.current) speedRef.current.innerText = Math.round(speedData.value).toString();

      if (rpmBarRef.current) {
        rpmBarRef.current.style.width = `${rpmPercent}%`;
        rpmBarRef.current.style.background = rpmPercent > 90 ? 'var(--secondary)' : 'var(--primary)';
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => telemetryEmitter.removeEventListener('update', handleUpdate);
  }, [convertSpeed]);

  return (
    <div className="d-flex flex-column flex-grow-1">
      <div className="d-flex justify-content-between align-items-end mb-2">
        <div>
          <div className="fw-bold text-primary lh-1" style={{ fontSize: '2rem' }}>
            <span ref={rpmRef}>0</span> <span className="text-secondary" style={{ fontSize: '0.9rem' }}>{t("RPM")}</span>
          </div>
        </div>
        <div className="text-center">
          <div className="fw-bold lh-1" style={{ fontSize: '2rem', color: 'var(--text-primary)' }}>
            <span ref={gearRef}>N</span> <span className="text-secondary" style={{ fontSize: '0.9rem' }}>{t("GEAR")}</span>
          </div>
        </div>
        <div className="text-end">
          <div className="fw-bold lh-1" style={{ fontSize: '2rem', color: 'var(--accent)' }}>
            <span ref={speedRef}>0</span> <span ref={speedLabelRef} className="text-secondary" style={{ fontSize: '0.9rem' }}></span>
          </div>
        </div>
      </div>
      <div className="w-100 overflow-hidden border" style={{ height: '10px', background: 'var(--surface-2)', borderColor: 'var(--glass-border) !important', borderRadius: '5px' }}>
        <div ref={rpmBarRef} className="h-100" style={{ width: '0%', background: 'var(--primary)' }} />
      </div>
    </div>
  );
});

export default EngineRpmDisplay;
