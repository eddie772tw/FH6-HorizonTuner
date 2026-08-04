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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>
            <span ref={rpmRef}>0</span> <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("RPM")}</span>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>
            <span ref={gearRef}>N</span> <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("GEAR")}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
            <span ref={speedRef}>0</span> <span ref={speedLabelRef} style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}></span>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
        <div ref={rpmBarRef} style={{ height: '100%', width: '0%', background: 'var(--primary)' }} />
      </div>
    </div>
  );
});

export default EngineRpmDisplay;
