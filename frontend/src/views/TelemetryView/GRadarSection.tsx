import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../hooks/useTelemetry';

export const GForceRadarCanvas: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<{ x: number; y: number; age: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleFrame = (e: any) => {
      if ((window as any).__IS_HUD_PAUSED__) return;
      const d = e.detail || e;
      const rawX = d.AccelerationX || 0;
      const rawZ = d.AccelerationZ || 0;

      const latG = -rawX / 9.81;
      const lonG = rawZ / 9.81;

      historyRef.current.push({ x: latG, y: lonG, age: 0 });
      if (historyRef.current.length > 60) {
        historyRef.current.shift();
      }

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 20;

      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let rPct of [0.33, 0.66, 1.0]) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * rPct, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      const scale = radius / 2.0;

      for (let i = 0; i < historyRef.current.length; i++) {
        const pt = historyRef.current[i];
        const alpha = (i + 1) / historyRef.current.length;
        const px = cx + pt.x * scale;
        const py = cy - pt.y * scale;

        ctx.fillStyle = `rgba(0, 240, 255, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const currentPx = cx + latG * scale;
      const currentPy = cy - lonG * scale;
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(currentPx, currentPy, 6, 0, Math.PI * 2);
      ctx.fill();
    };

    telemetryEmitter.addEventListener('frame', handleFrame);
    window.addEventListener('hud:frame', handleFrame);
    return () => {
      telemetryEmitter.removeEventListener('frame', handleFrame);
      window.removeEventListener('hud:frame', handleFrame);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
});

export const GRadarSection: React.FC<{ t: (k: string) => string }> = ({ t }) => {
  return (
    <div style={{ height: '300px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{t('g_force_radar')}</span>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GForceRadarCanvas />
      </div>
    </div>
  );
};
