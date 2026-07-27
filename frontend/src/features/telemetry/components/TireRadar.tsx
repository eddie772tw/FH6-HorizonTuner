import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

const getTempColor = (temp: number) => {
  if (temp < 150) return '#0088ff';
  if (temp > 210) return '#ff0000';
  return '#00ff00';
};

// --- COMPONENT: TireRadar ---
const TireRadar: React.FC<{title: string, isLeft: boolean, tireIdx: number}> = React.memo(({title, isLeft, tireIdx}) => {
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{temp: number, ratio: number, angle: number, time: number, speed: number}[]>([]);
  const lastTimeRef = useRef(performance.now());
  const tempRef = useRef<HTMLSpanElement>(null);
  const angRef = useRef<HTMLSpanElement>(null);
  const ratioRef = useRef<HTMLSpanElement>(null);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  
  const { convertTemp, t } = useSettings();
  const tempUnit = convertTemp(0).label;

  useEffect(() => {
    const radius = 50; 
    const displayLimit = 1.5; 
    const histWidth = 100;
    const histHeight = 70;

    const drawBackground = (ctx: CanvasRenderingContext2D, radius: number, displayLimit: number, isLosingGrip: boolean) => {
      ctx.clearRect(0, 0, radius * 2, radius * 2);
      
      // Radar border
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
      ctx.strokeStyle = isLosingGrip ? '#ff003c' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, radius); ctx.lineTo(radius * 2, radius);
      ctx.moveTo(radius, 0); ctx.lineTo(radius, radius * 2);
      ctx.stroke();

      // 1.0 Threshold Circle (dashed)
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.arc(radius, radius, radius / displayLimit, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,0,0,0.5)';
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (radarCanvasRef.current) {
      const ctx = radarCanvasRef.current.getContext('2d');
      if (ctx) drawBackground(ctx, radius, displayLimit, false);
    }

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
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      let cTemp = 0, cRatio = 0, cAngle = 0;
      if (liveData.TireTemp && liveData.TireSlipRatio && liveData.TireSlipAngle) {
        cTemp = liveData.TireTemp[tireIdx];
        cRatio = liveData.TireSlipRatio[tireIdx];
        cAngle = liveData.TireSlipAngle[tireIdx];
      }
      const speed = liveData.SpeedMetersPerSecond || 0;
      const isMoving = Math.abs(speed) > 0.5;

      if (!isMoving) {
        for (let i = 0; i < hist.current.length; i++) hist.current[i].time += dt;
      } else {
        if (hist.current.length < 900) {
          hist.current.push({ temp: cTemp, ratio: cRatio, angle: cAngle, time: now, speed });
        } else {
          const old = hist.current.shift();
          if (old) {
             old.temp = cTemp; old.ratio = cRatio; old.angle = cAngle; old.time = now; old.speed = speed;
             hist.current.push(old);
          }
        }
      }

      if (tempRef.current) tempRef.current.innerText = Math.round(convertTemp(cTemp).value).toString();
      if (angRef.current) {
        angRef.current.innerText = cAngle.toFixed(2);
        angRef.current.style.color = Math.abs(cAngle) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }
      if (ratioRef.current) {
        ratioRef.current.innerText = cRatio.toFixed(2);
        ratioRef.current.style.color = Math.abs(cRatio) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }

      const rCanvas = radarCanvasRef.current;
      if (rCanvas) {
        const ctx = rCanvas.getContext('2d');
        if (ctx) {
          const isLosingGrip = Math.abs(cRatio) > 1.0 || Math.abs(cAngle) > 1.0;
          drawBackground(ctx, radius, displayLimit, isLosingGrip);
  
          let startIdx = hist.current.length - 1;
          while (startIdx >= 0 && now - hist.current[startIdx].time <= 3000) {
            startIdx--;
          }
          const firstValidIdx = startIdx + 1;
          const histLen = hist.current.length;

          if (firstValidIdx < histLen) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            for (let i = firstValidIdx; i < histLen; i++) {
              const p = hist.current[i];
              let dx = (p.angle / displayLimit) * radius;
              let dy = (p.ratio / displayLimit) * radius;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > radius && dist > 0) {
                dx = (dx / dist) * radius;
                dy = (dy / dist) * radius;
              }
              const cx = radius + dx;
              const cy = radius + dy;
              if (i === firstValidIdx) ctx.moveTo(cx, cy);
              else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
          }

          let dx = (cAngle / displayLimit) * radius;
          let dy = (cRatio / displayLimit) * radius;
          const tDist = Math.sqrt(dx * dx + dy * dy);
          const maxTR = radius - 4; // Radius 50 minus dot radius 4
          if (tDist > maxTR && tDist > 0) {
            dx = (dx / tDist) * maxTR;
            dy = (dy / tDist) * maxTR;
          }
          const dotColor = isLosingGrip ? '#ff003c' : '#00f0ff';
          const dotGlowColor = isLosingGrip ? 'rgba(255, 0, 60, 0.35)' : 'rgba(0, 240, 255, 0.35)';
          const dotCenterX = radius + dx;
          const dotCenterY = radius + dy;

          // Double Pass Vector Glow (Zero performance cost, crisp glow aesthetic)
          ctx.beginPath();
          ctx.arc(dotCenterX, dotCenterY, 7, 0, Math.PI * 2);
          ctx.fillStyle = dotGlowColor;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(dotCenterX, dotCenterY, 4, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        }
      }

      const tCanvas = tempCanvasRef.current;
      if (tCanvas) {
        const ctx = tCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, histWidth, histHeight);
          
          let minTemp = cTemp;
          let maxTemp = cTemp;
          const hLen = hist.current.length;
          if (hLen > 0) {
            minTemp = hist.current[0].temp;
            maxTemp = hist.current[0].temp;
            for (let i = 1; i < hLen; i++) {
              const t = hist.current[i].temp;
              if (t < minTemp) minTemp = t;
              if (t > maxTemp) maxTemp = t;
            }
          }
          
          let tempMinScale = 100;
          let tempMaxScale = 260;
          if (minTemp < tempMinScale + 10) tempMinScale = minTemp - 10;
          if (maxTemp > tempMaxScale - 10) tempMaxScale = maxTemp + 10;
          
          const numBins = 30;
          const tempPerBin = (tempMaxScale - tempMinScale) / numBins;
          const bins = new Array(numBins).fill(0);
          let maxBinCount = 1;

          for (let i = 0; i < hLen; i++) {
            const p = hist.current[i];
            if (Math.abs(p.speed) < 0.5) continue;
            let t = Math.max(tempMinScale, Math.min(tempMaxScale, p.temp));
            let binIdx = Math.floor((t - tempMinScale) / tempPerBin);
            if (binIdx >= numBins) binIdx = numBins - 1;
            bins[binIdx]++;
            if (bins[binIdx] > maxBinCount) maxBinCount = bins[binIdx];
          }

          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          for (let i = 0; i < numBins; i++) {
            let h = (bins[i] / maxBinCount) * histHeight;
            if (h < 2) h = 2;
            
            const binTemp = tempMinScale + i * tempPerBin;
            ctx.fillStyle = getTempColor(binTemp);
            const barW = histWidth / numBins;
            ctx.fillRect(i * barW, histHeight - h, barW > 1 ? barW - 1 : barW, h);
          }
          
          const currentT = Math.max(tempMinScale, Math.min(tempMaxScale, cTemp));
          const lineX = ((currentT - tempMinScale) / (tempMaxScale - tempMinScale)) * histWidth;
          ctx.beginPath();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.moveTo(lineX, 0);
          ctx.lineTo(lineX, histHeight);
          ctx.stroke();
        }
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => telemetryEmitter.removeEventListener('update', handleUpdate);
  }, [tireIdx, convertTemp]);

  return (
    <div style={{ display: 'flex', flexDirection: isLeft ? 'row' : 'row-reverse', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '8px', transition: 'background 0.2s', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>
        <div style={{ position: 'relative', width: '100px', height: '100px' }}>
          <canvas ref={radarCanvasRef} width={100} height={100} style={{ position: 'absolute', top: 0, left: 0 }} />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: isLeft ? 'row' : 'row-reverse', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: isLeft ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isLeft ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t("Slip Angle")}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }} ref={angRef}>0.00</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isLeft ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t("Slip Ratio")}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }} ref={ratioRef}>0.00</span>
          </div>
        </div>
        <div style={{ position: 'relative', width: '100px', height: '100px', display: 'flex', flexDirection: 'column', alignItems: isLeft ? 'flex-start' : 'flex-end' }}>
           <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}><span ref={tempRef}>0</span><span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tempUnit}</span></span>
           <canvas ref={tempCanvasRef} width={100} height={70} style={{ width: '100%', flex: 1, marginTop: '4px' }} />
        </div>
      </div>
    </div>
  );
});

export default TireRadar;
