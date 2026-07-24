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

      // Fixed 0-1 scale mapping (0% to 100%)
      const percent = Math.max(0, Math.min(100, travel * 100));
      if (barRef.current) barRef.current.style.height = percent + '%';
      if (textRef.current) textRef.current.innerText = travel.toFixed(2);
      if (minRef.current) minRef.current.innerText = minMax.current.min !== null ? minMax.current.min.toFixed(2) : '-';
      if (maxRef.current) maxRef.current.innerText = minMax.current.max !== null ? minMax.current.max.toFixed(2) : '-';

      const canvas = canvasRef.current;
      if (canvas && hist.current.length > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          
          ctx.clearRect(0, 0, 150, 60);
          const w = 150, h = 60;
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

          ctx.beginPath();
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#ff003c');
          // Must use valid CSS hex strings in Canvas API
          grad.addColorStop(0.05, primaryColor);
          grad.addColorStop(0.95, primaryColor);
          grad.addColorStop(1, '#ff003c');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
  
          const maxT = Math.max(...hist.current.map(p => p.time));
          for (let i = 0; i < hist.current.length; i++) {
            const p = hist.current[i];
            const x = 150 - ((maxT - p.time) / 2500) * 150; 
            // Fixed mapping: travel 0..1 to canvas y 60..0
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
    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '8px' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600, textAlign: isLeft ? 'left' : 'right' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: !isLeft ? 'row' : 'row-reverse', gap: '1rem', height: '60px', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '24px', height: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)', zIndex: 1 }} />
          <div ref={barRef} style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
            background: 'var(--primary)', transition: 'height 0.05s linear, background 0.1s', borderRadius: '0 0 8px 8px'
          }} />
        </div>
        <div style={{ flex: 1, height: '100%', position: 'relative', opacity: 0.8 }}>
           <canvas ref={canvasRef} width={150} height={60} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 0.2rem' }}>
        <span>{t("Min")}: <span style={{ fontWeight: 600 }} ref={minRef}>0.00</span></span>
        <span style={{ color: 'white', fontWeight: 'bold' }} ref={textRef}>0.00</span>
        <span>{t("Max")}: <span style={{ fontWeight: 600 }} ref={maxRef}>0.00</span></span>
      </div>
    </div>
  );
});

export default SuspensionBar;
