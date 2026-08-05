import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: PedalTraceCanvas ---
const PedalTraceCanvas: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{ throttle: number; brake: number; time: number }[]>([]);
  const lastTimeRef = useRef(performance.now());
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const { t } = useSettings();

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;

      if ((prevCar.current !== null && prevCar.current !== liveData.CarOrdinal) ||
          (prevRace.current !== null && prevRace.current !== liveData.IsRaceOn)) {
        hist.current = [];
      }
      prevCar.current = liveData.CarOrdinal;
      prevRace.current = liveData.IsRaceOn;

      if (liveData.IsRaceOn !== 1) return;

      const now = performance.now();
      lastTimeRef.current = now;

      const throttle = Math.max(0, Math.min(1, (liveData.AccelInput || 0) / 255));
      const brake = Math.max(0, Math.min(1, (liveData.BrakeInput || 0) / 255));

      if (hist.current.length < 300) {
        hist.current.push({ throttle, brake, time: now });
      } else {
        const oldP = hist.current.shift();
        if (oldP) { oldP.throttle = throttle; oldP.brake = brake; oldP.time = now; hist.current.push(oldP); }
      }

      const canvas = canvasRef.current;
      if (canvas && hist.current.length > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width, h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          // 50% Guideline
          const isLight = document.documentElement.getAttribute('data-bs-theme') === 'light';
          ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
          ctx.stroke();

          const len = hist.current.length;
          const stepX = w / (300 - 1);

          // Throttle Trace (Green #00ff66) - Latest on right
          ctx.beginPath();
          for (let k = 0; k < len; k++) {
            const px = k * stepX;
            const py = h - (hist.current[k].throttle * (h - 6)) - 3;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#00ff66';
          ctx.shadowColor = 'rgba(0, 255, 102, 0.6)';
          ctx.shadowBlur = 4;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Brake Trace (Red #ff0055) - Latest on right
          ctx.beginPath();
          for (let k = 0; k < len; k++) {
            const px = k * stepX;
            const py = h - (hist.current[k].brake * (h - 6)) - 3;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#ff0055';
          ctx.shadowColor = 'rgba(255, 0, 85, 0.6)';
          ctx.shadowBlur = 4;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '95px', background: 'var(--surface-1)', borderRadius: '6px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={480} height={95} style={{ width: '100%', height: '100%' }} />
      <span style={{ position: 'absolute', top: '6px', right: '10px', color: '#00ff66', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
        {t("THROTTLE")}
      </span>
      <span style={{ position: 'absolute', bottom: '6px', right: '10px', color: '#ff0055', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
        {t("BRAKE")}
      </span>
    </div>
  );
});

export default PedalTraceCanvas;
