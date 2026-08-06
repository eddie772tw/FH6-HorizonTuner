import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: SuspensionBar ---
const SuspensionBar: React.FC<{title: string, isLeft: boolean, tireIdx: number}> = React.memo(({title, isLeft, tireIdx}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
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
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
        }
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const primaryColor = '#00f0ff';

    const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const warningH = h * 0.08;
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

    if (canvasRef.current && canvasRef.current.width > 0) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) drawBackground(ctx, canvasRef.current.width, canvasRef.current.height);
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
        if (hist.current.length < 180) {
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
      if (canvas && hist.current.length > 0 && canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const dpr = window.devicePixelRatio || 1;
          
          drawBackground(ctx, w, h);

          ctx.beginPath();
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#ff003c');
          grad.addColorStop(0.08, primaryColor);
          grad.addColorStop(0.92, primaryColor);
          grad.addColorStop(1, '#ff003c');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2 * dpr;
          ctx.lineJoin = 'round';
  
          const maxT = hist.current.length > 0 ? hist.current[hist.current.length - 1].time : 0;
          for (let i = 0; i < hist.current.length; i++) {
            const p = hist.current[i];
            const x = w - ((maxT - p.time) / 2500) * w; 
            const y = h - (p.travel * h);
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
    <div ref={containerRef} className="p-2 rounded-3 border d-flex flex-column justify-content-between h-100 overflow-hidden" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
      <div className={`fw-bold text-body mb-1 fs-8 ${isLeft ? 'text-start' : 'text-end'}`}>{title}</div>
      <div className={`d-flex gap-2 align-items-center flex-grow-1 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`} style={{ height: '42px', minHeight: '38px' }}>
        <div className="position-relative h-100 border rounded-pill overflow-hidden flex-shrink-0" style={{ width: '20px', background: 'var(--surface-2)', borderColor: 'var(--glass-border) !important' }}>
          <div className="position-absolute" style={{ top: '50%', left: 0, right: 0, height: '1px', background: 'var(--divider)', zIndex: 2 }} />
          <div ref={barRef} className="position-absolute start-0 end-0 bottom-0 rounded-bottom-pill" style={{
            height: '50%',
            background: 'var(--primary)'
          }} />
        </div>
        <div ref={canvasContainerRef} className="flex-grow-1 h-100 position-relative opacity-75 overflow-hidden">
           <canvas ref={canvasRef} className="w-100 h-100 d-block" />
        </div>
      </div>
      <div className="d-flex justify-content-between mt-1 px-1 text-body-secondary fs-8 flex-shrink-0">
        <span>{t("Min")}: <span className="fw-bold font-monospace text-body" ref={minRef}>0.00</span></span>
        <span className="fw-bold font-monospace text-primary fs-7" ref={textRef}>0.00</span>
        <span>{t("Max")}: <span className="fw-bold font-monospace text-body" ref={maxRef}>0.00</span></span>
      </div>
    </div>
  );
});

export default SuspensionBar;
