import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../hooks/useTelemetry';

const getTempColor = (temp: number) => {
  if (temp < 150) return '#0088ff';
  if (temp > 210) return '#ff0000';
  return '#00ff00';
};

export const TireStatusCluster: React.FC<{ t: (k: string) => string }> = React.memo(({ t }) => {
  const flTempRef = useRef<HTMLDivElement>(null);
  const frTempRef = useRef<HTMLDivElement>(null);
  const rlTempRef = useRef<HTMLDivElement>(null);
  const rrTempRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFrame = (e: any) => {
      if ((window as any).__IS_HUD_PAUSED__) return;
      const d = e.detail || e;
      const temps = d.TireTemp || [0, 0, 0, 0];

      if (flTempRef.current) {
        const c = (temps[0] - 32) * (5 / 9);
        flTempRef.current.textContent = `${Math.round(c)}°C`;
        flTempRef.current.style.color = getTempColor(temps[0]);
      }
      if (frTempRef.current) {
        const c = (temps[1] - 32) * (5 / 9);
        frTempRef.current.textContent = `${Math.round(c)}°C`;
        frTempRef.current.style.color = getTempColor(temps[1]);
      }
      if (rlTempRef.current) {
        const c = (temps[2] - 32) * (5 / 9);
        rlTempRef.current.textContent = `${Math.round(c)}°C`;
        rlTempRef.current.style.color = getTempColor(temps[2]);
      }
      if (rrTempRef.current) {
        const c = (temps[3] - 32) * (5 / 9);
        rrTempRef.current.textContent = `${Math.round(c)}°C`;
        rrTempRef.current.style.color = getTempColor(temps[3]);
      }
    };

    telemetryEmitter.addEventListener('frame', handleFrame);
    window.addEventListener('hud:frame', handleFrame);
    return () => {
      telemetryEmitter.removeEventListener('frame', handleFrame);
      window.removeEventListener('hud:frame', handleFrame);
    };
  }, []);

  return (
    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1rem' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.75rem' }}>{t('tire_temps')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>FL</div>
          <div ref={flTempRef} style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>--°C</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>FR</div>
          <div ref={frTempRef} style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>--°C</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>RL</div>
          <div ref={rlTempRef} style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>--°C</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>RR</div>
          <div ref={rrTempRef} style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>--°C</div>
        </div>
      </div>
    </div>
  );
});

export const TireSuspensionSection = TireStatusCluster;
