import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: SuspensionBar ---
const SuspensionBar: React.FC<{title: string, isLeft: boolean, tireIdx: number}> = React.memo(({title, isLeft, tireIdx}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const minRef = useRef<HTMLSpanElement>(null);
  const maxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { t } = useSettings();
  
  const hist = useRef<{travel: number, time: number}[]>([]);
  const lastTimeRef = useRef(performance.now());
  const minMax = useRef<{ min: number | null, max: number | null }>({ min: null, max: null });
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);

  useEffect(() => {
    // Canvas API does not support CSS variables like var(--primary) in gradients.
    // Using a valid hex color avoids crashes.
    const primaryColor = '#00f0ff';
    // Draw initial background
    const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const warningH = h * 0.05;
      ctx.fillStyle = 'rgba(255, 0, 60, 0.15)';
      ctx.fillRect(0, 0, w, warningH);
      ctx.fillRect(0, h - warningH, w, warningH);
      
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 0, 60, 0.2)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, warningH); ctx.lineTo(w, warningH);
      ctx.moveTo(0, h - warningH); ctx.lineTo(w, h - warningH);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) drawBackground(ctx, 150, 60);
    }

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;
      
      if ((prevCar.current !== null && prevCar.current !== liveData.CarOrdinal) ||
          (prevRace.current !== null && prevRace.current !== liveData.IsRaceOn)) {
        hist.current = [];
        minMax.current = { min: null, max: null };
      }
      prevCar.current = liveData.CarOrdinal;
      prevRace.current = liveData.IsRaceOn;

      if (liveData.IsRaceOn !== 1) return;
      
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const travel = (liveData.NormalizedSuspensionTravel && liveData.NormalizedSuspensionTravel[tireIdx]) || 0;
      
      if (minMax.current.min === null || minMax.current.max === null) {
        minMax.current.min = travel;
        minMax.current.max = travel;
      } else {
        if (travel < minMax.current.min) minMax.current.min = travel;
        if (travel > minMax.current.max) minMax.current.max = travel;
      }
      
      const speed = liveData.SpeedMetersPerSecond || 0;
      const isMoving = Math.abs(speed) > 0.5;

      if (!isMoving) {
        for (let i = 0; i < hist.current.length; i++) hist.current[i].time += dt;
      } else {
        if (hist.current.length < 150) {
          hist.current.push({ travel, time: now });
        } else {
          const old = hist.current.shift();
          if (old) {
             old.travel = travel; old.time = now;
             hist.current.push(old);
          }
        }
      }

      const percent = Math.max(0, Math.min(100, travel * 100));
      if (barRef.current) barRef.current.style.height = percent + '%';
      if (textRef.current) textRef.current.innerText = travel.toFixed(2);
      if (minRef.current) minRef.current.innerText = minMax.current.min !== null ? minMax.current.min.toFixed(2) : '-';
      if (maxRef.current) maxRef.current.innerText = minMax.current.max !== null ? minMax.current.max.toFixed(2) : '-';

      const canvas = canvasRef.current;
      if (canvas && hist.current.length > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          
          drawBackground(ctx, 150, 60);

          ctx.beginPath();
          const grad = ctx.createLinearGradient(0, 0, 0, 60);
          grad.addColorStop(0, '#ff003c');
          grad.addColorStop(0.05, primaryColor);
          grad.addColorStop(0.95, primaryColor);
          grad.addColorStop(1, '#ff003c');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
  
          // Bolt: Optimized max time calculation by directly accessing the last element since the array is ordered temporally
          const maxT = hist.current.length > 0 ? hist.current[hist.current.length - 1].time : 0;
          for (let i = 0; i < hist.current.length; i++) {
            const p = hist.current[i];
            const x = 150 - ((maxT - p.time) / 2500) * 150; 
            const y = 60 - (p.travel * 60);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    };
    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => telemetryEmitter.removeEventListener('update', handleUpdate);
  }, [tireIdx]);

  return (
    <div className="p-3 rounded border" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
      <div className={`fw-bold mb-2 ${isLeft ? 'text-start' : 'text-end'}`} style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{title}</div>
      <div className={`d-flex gap-3 align-items-center ${isLeft ? 'flex-row' : 'flex-row-reverse'}`} style={{ height: '60px' }}>
        <div className="position-relative h-100 border" style={{ width: '24px', background: 'var(--surface-2)', borderRadius: '12px', borderColor: 'var(--glass-border) !important' }}>
          <div className="position-absolute" style={{ top: '50%', left: 0, right: 0, height: '1px', background: 'var(--divider)', zIndex: 1 }} />
          <div ref={barRef} className="position-absolute" style={{
            bottom: 0, left: 0, right: 0, height: '50%',
            background: 'var(--primary)', borderRadius: '0 0 8px 8px'
          }} />
        </div>
        <div className="flex-grow-1 h-100 position-relative opacity-75">
           <canvas ref={canvasRef} width={150} height={60} className="w-100 h-100" />
        </div>
      </div>
      <div className="d-flex justify-content-between mt-3 px-1 text-secondary" style={{ fontSize: '0.8rem' }}>
        <span>{t("Min")}: <span className="fw-bold" ref={minRef}>0.00</span></span>
        <span className="fw-bold" style={{ color: 'var(--text-primary)' }} ref={textRef}>0.00</span>
        <span>{t("Max")}: <span className="fw-bold" ref={maxRef}>0.00</span></span>
      </div>
    </div>
  );
});

export default SuspensionBar;
