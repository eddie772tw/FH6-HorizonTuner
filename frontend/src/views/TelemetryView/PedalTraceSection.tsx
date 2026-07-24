import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../hooks/useTelemetry';

interface PedalTraceSectionProps {
  t: (key: string) => string;
}

export const VerticalInputBar: React.FC<{ label: string; color: string; getValue: (data: any) => number }> = React.memo(
  ({ label, color, getValue }) => {
    const fillRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleFrame = (e: any) => {
        if ((window as any).__IS_HUD_PAUSED__) return;
        const d = e.detail || e;
        const val = Math.max(0, Math.min(255, getValue(d)));
        const pct = Math.round((val / 255) * 100);
        if (fillRef.current) fillRef.current.style.height = `${pct}%`;
        if (textRef.current) textRef.current.textContent = `${pct}%`;
      };
      telemetryEmitter.addEventListener('frame', handleFrame);
      window.addEventListener('hud:frame', handleFrame);
      return () => {
        telemetryEmitter.removeEventListener('frame', handleFrame);
        window.removeEventListener('hud:frame', handleFrame);
      };
    }, [getValue]);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: '4px', flex: 1 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ flex: 1, width: '16px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div ref={fillRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '0%', background: color, transition: 'height 0.05s ease-out' }} />
        </div>
        <div ref={textRef} style={{ fontSize: '0.75rem', fontWeight: 'bold', fontFamily: 'monospace' }}>0%</div>
      </div>
    );
  }
);

export const PedalTraceCanvas: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<{ time: number; accel: number; brake: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleFrame = (e: any) => {
      if ((window as any).__IS_HUD_PAUSED__) return;
      const d = e.detail || e;
      const now = performance.now();
      const accel = (d.AccelInput || 0) / 255;
      const brake = (d.BrakeInput || 0) / 255;

      historyRef.current.push({ time: now, accel, brake });
      const cutoff = now - 5000;
      while (historyRef.current.length > 0 && historyRef.current[0].time < cutoff) {
        historyRef.current.shift();
      }

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let yPct of [0.25, 0.5, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(0, h * yPct);
        ctx.lineTo(w, h * yPct);
        ctx.stroke();
      }

      if (historyRef.current.length < 2) return;

      const drawPath = (key: 'accel' | 'brake', color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        let started = false;

        for (let i = 0; i < historyRef.current.length; i++) {
          const pt = historyRef.current[i];
          const age = now - pt.time;
          const x = w - (age / 5000) * w;
          const val = pt[key];
          const y = h - val * (h - 8) - 4;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };

      drawPath('accel', '#00ff88');
      drawPath('brake', '#ff0055');
    };

    telemetryEmitter.addEventListener('frame', handleFrame);
    window.addEventListener('hud:frame', handleFrame);
    return () => {
      telemetryEmitter.removeEventListener('frame', handleFrame);
      window.removeEventListener('hud:frame', handleFrame);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
});

export const PedalTraceSection: React.FC<PedalTraceSectionProps> = ({ t }) => {
  return (
    <div style={{ height: '220px', display: 'flex', gap: '1rem', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1rem' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 'bold' }}>{t('pedal_inputs_5s_history')}</span>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#00ff88' }}>■ {t('accel')}</span>
            <span style={{ color: '#ff0055' }}>■ {t('brake')}</span>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PedalTraceCanvas />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', width: '90px' }}>
        <VerticalInputBar label="CLUTCH" color="#7000ff" getValue={(d) => d.ClutchInput || 0} />
        <VerticalInputBar label="HAND" color="#ff00cc" getValue={(d) => d.HandBrakeInput || 0} />
      </div>
    </div>
  );
};
