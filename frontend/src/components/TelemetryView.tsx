import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry, telemetryEmitter } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { useCarParams } from '../context/CarParamsContext';
import { useTelemetryRecorder } from '../context/TelemetryRecorderContext';
import { apiClient } from '../services/apiClient';

const AnalysisView = React.lazy(() => import('./AnalysisView'));
const DragTestView = React.lazy(() => import('./DragTestView'));


const getCarClassString = (cls?: number) => {
  if (cls === undefined) return '';
  const classes = ['E', 'D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  if (cls >= 0 && cls < classes.length) return classes[cls];
  return `Class ${cls}`;
};



const getTempColor = (temp: number) => {
  if (temp < 150) return '#0088ff';
  if (temp > 210) return '#ff0000';
  return '#00ff00';
};

const formatTime = (seconds: number) => {
  if (seconds <= 0) return "--:--.---";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const activeTabStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const inactiveTabStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  cursor: 'pointer',
};

// --- COMPONENT: SteerBar ---
const SteerBar: React.FC = () => {
  const barRef = useRef<HTMLDivElement>(null);
  const { t } = useSettings();
  useEffect(() => {
    const handleDraw = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data || data.IsRaceOn !== 1) return;
      const steer = data.SteerInput || 0;
      if (barRef.current) {
        barRef.current.style.width = `${Math.abs(steer) / 127 * 50}%`;
        barRef.current.style.left = steer < 0 ? `${50 - (Math.abs(steer)/127*50)}%` : '50%';
      }
    };
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, []);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <span>{t("Steer L")}</span>
        <span>{t("Steer R")}</span>
      </div>
      <div style={{ width: '100%', height: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative', marginTop: '4px' }}>
        <div ref={barRef} style={{ 
          position: 'absolute', height: '100%', background: 'white',
          width: '0%', left: '50%', transition: 'width 0.05s linear, left 0.05s linear'
        }} />
        <div style={{ position: 'absolute', left: '50%', top: '-2px', bottom: '-2px', width: '2px', background: 'gray' }} />
      </div>
    </div>
  );
};

// --- COMPONENT: GForceRadar ---
const GForceRadar: React.FC = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const hist = useRef<{lat: number, lon: number, time: number}[]>([]);
  const lastTimeRef = useRef(performance.now());
  const [markers, setMarkers] = useState<{lat: number, lon: number}[]>([]);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const { t } = useSettings();

  useEffect(() => {
    const handleDraw = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;
      
      if ((prevCar.current !== null && prevCar.current !== data.CarOrdinal) ||
          (prevRace.current !== null && prevRace.current !== data.IsRaceOn)) {
        hist.current = [];
      }
      prevCar.current = data.CarOrdinal;
      prevRace.current = data.IsRaceOn;

      if (data.IsRaceOn !== 1) return;
      
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const lat = -(data.AccelerationX || 0) / 9.81; // Invert X axis (lateral G) per user requirement
      const lon = (data.AccelerationZ || 0) / 9.81; // Keep Y axis (longitudinal G: BRAKE on top)
      const isMoving = Math.abs(data.SpeedMetersPerSecond || 0) > 0.5;

      if (!isMoving) {
        for (let i = 0; i < hist.current.length; i++) hist.current[i].time += dt;
      } else {
        if (hist.current.length < 900) {
          hist.current.push({ lat, lon, time: now });
        } else {
          const old = hist.current.shift();
          if (old) {
            old.lat = lat; old.lon = lon; old.time = now;
            hist.current.push(old);
          }
        }
      }

      if (dotRef.current) {
        let dx = lat * 40;
        let dy = lon * 40;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = 73; // radius 80 minus dot radius 7
        if (dist > maxR && dist > 0) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }
        dotRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      if (latRef.current) latRef.current.innerText = Math.abs(lat).toFixed(2);
      if (lonRef.current) lonRef.current.innerText = Math.abs(lon).toFixed(2);
    };
    telemetryEmitter.addEventListener('update', handleDraw);

    // 5Hz marker updater for React state
    const markerInterval = setInterval(() => {
      const now = performance.now();
      let maxLatL = { lat: 0, lon: 0 }, maxLatR = { lat: 0, lon: 0 };
      let maxLonB = { lat: 0, lon: 0 }, maxLonA = { lat: 0, lon: 0 };
      let maxL_B = { lat: 0, lon: 0 }, maxL_A = { lat: 0, lon: 0 };
      let maxR_B = { lat: 0, lon: 0 }, maxR_A = { lat: 0, lon: 0 };
      let foundAny = false;

      const len = hist.current.length;
      for (let i = 0; i < len; i++) {
        const p = hist.current[i];
        if (now - p.time > 30000) continue;
        foundAny = true;
        if (p.lat < maxLatL.lat) maxLatL = p;
        if (p.lat > maxLatR.lat) maxLatR = p;
        if (p.lon < maxLonB.lon) maxLonB = p;
        if (p.lon > maxLonA.lon) maxLonA = p;
        if (p.lat < 0 && p.lon < 0 && (p.lat + p.lon < maxL_B.lat + maxL_B.lon)) maxL_B = p;
        if (p.lat < 0 && p.lon > 0 && (p.lat - p.lon < maxL_A.lat - maxL_A.lon)) maxL_A = p;
        if (p.lat > 0 && p.lon < 0 && (p.lat - p.lon > maxR_B.lat - maxR_B.lon)) maxR_B = p;
        if (p.lat > 0 && p.lon > 0 && (p.lat + p.lon > maxR_A.lat + maxR_A.lon)) maxR_A = p;
      }

      if (foundAny) {
        setMarkers([maxLatL, maxLatR, maxLonB, maxLonA, maxL_B, maxL_A, maxR_B, maxR_A]);
      } else {
        setMarkers([]);
      }
    }, 200);

    return () => {
      telemetryEmitter.removeEventListener('update', handleDraw);
      clearInterval(markerInterval);
    };
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', width: '80px', height: '80px', borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.15)' }} />
        <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.15)' }} />
        <span style={{ position: 'absolute', top: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{t("BRAKE")}</span>
        <span style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{t("ACCEL")}</span>
        <span style={{ position: 'absolute', left: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{t("L")}</span>
        <span style={{ position: 'absolute', right: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{t("R")}</span>
        
        {markers.map((p, i) => {
          let mx = p.lat * 40;
          let my = p.lon * 40;
          const mDist = Math.sqrt(mx * mx + my * my);
          const maxMR = 77; // radius 80 minus marker half size 3
          if (mDist > maxMR && mDist > 0) {
            mx = (mx / mDist) * maxMR;
            my = (my / mDist) * maxMR;
          }
          return (
            <div key={i} style={{ 
              position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.6)', 
              top: `${80 + my - 3}px`, 
              left: `${80 + mx - 3}px`,
              transition: 'top 0.1s linear, left 0.1s linear'
            }} />
          );
        })}
        <div ref={dotRef} style={{
          position: 'absolute', width: '14px', height: '14px', backgroundColor: 'var(--primary)',
          borderRadius: '50%', boxShadow: '0 0 12px var(--primary)', transition: 'transform 0.05s linear'
        }} />
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem' }}>
        <div style={{ textAlign: 'center' }}>
          <span ref={latRef} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>0.00</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>{t("Lat G")}</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <span ref={lonRef} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--secondary)' }}>0.00</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>{t("Lon G")}</span>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENT: VerticalInputBar ---
const VerticalInputBar: React.FC<{ label: string; selector: (d: any) => number; max: number; color: string }> = ({ label, selector, max, color }) => {
  const valRef = useRef<number>(0);
  const barRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;
      const rawVal = selector(liveData);
      valRef.current = Math.max(0, Math.min(max, rawVal));

      const pct = Math.round((valRef.current / max) * 100);
      if (barRef.current) barRef.current.style.height = `${pct}%`;
      if (pctRef.current) pctRef.current.innerText = `${pct}%`;
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [selector, max]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ position: 'relative', width: '16px', height: '65px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
        <div ref={barRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '0%', background: color, transition: 'height 0.05s linear', borderRadius: '0 0 3px 3px' }} />
      </div>
      <span ref={pctRef} style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#fff' }}>0%</span>
    </div>
  );
};

// --- COMPONENT: PedalTraceCanvas ---
const PedalTraceCanvas: React.FC = () => {
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
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
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
    <div style={{ position: 'relative', width: '100%', height: '95px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={480} height={95} style={{ width: '100%', height: '100%' }} />
      <span style={{ position: 'absolute', top: '6px', right: '10px', color: '#00ff66', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
        {t("THROTTLE")}
      </span>
      <span style={{ position: 'absolute', bottom: '6px', right: '10px', color: '#ff0055', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
        {t("BRAKE")}
      </span>
    </div>
  );
};

// --- COMPONENT: TireRadar ---
const TireRadar: React.FC<{title: string, isLeft: boolean, tireIdx: number}> = ({title, isLeft, tireIdx}) => {
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
          ctx.clearRect(0, 0, radius*2, radius*2);
          
          // Old style radar border
          const isLosingGrip = Math.abs(cRatio) > 1.0 || Math.abs(cAngle) > 1.0;
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
    <div style={{ display: 'flex', flexDirection: !isLeft ? 'row' : 'row-reverse', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '8px', transition: 'background 0.2s', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>
        <div style={{ position: 'relative', width: '100px', height: '100px' }}>
          <canvas ref={radarCanvasRef} width={100} height={100} style={{ position: 'absolute', top: 0, left: 0 }} />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: !isLeft ? 'row' : 'row-reverse', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: !isLeft ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: !isLeft ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t("Slip Angle")}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }} ref={angRef}>0.00</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: !isLeft ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t("Slip Ratio")}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }} ref={ratioRef}>0.00</span>
          </div>
        </div>
        <div style={{ position: 'relative', width: '100px', height: '100px', display: 'flex', flexDirection: 'column', alignItems: !isLeft ? 'flex-start' : 'flex-end' }}>
           <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}><span ref={tempRef}>0</span><span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tempUnit}</span></span>
           <canvas ref={tempCanvasRef} width={100} height={70} style={{ width: '100%', flex: 1, marginTop: '4px' }} />
        </div>
      </div>
    </div>
  );
};

// --- COMPONENT: SuspensionBar ---
const SuspensionBar: React.FC<{title: string, isLeft: boolean, tireIdx: number}> = ({title, isLeft, tireIdx}) => {
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
};

// --- COMPONENT: TelemetryView MAIN ---
const TelemetryView: React.FC = () => {
  const [subTab, setSubTab] = useState<'live' | 'analysis' | 'drag'>('live');
  const [isHudPaused, setIsHudPaused] = useState<boolean>(false);
  const { data } = useTelemetry();
  const { convertSpeed, convertPower, convertTorque, convertBoost, t } = useSettings();
  const { carName } = useCarParams();
  const { isRecording, loadSavedSession } = useTelemetryRecorder();

  const prevIsRacingRef = useRef<boolean>(false);

  useEffect(() => {
    const channel = new BroadcastChannel('horizon_tuner_hud_channel');
    const checkConfig = (cfg: any) => {
      if (cfg && cfg.enabled && cfg.pauseTelemetryViewWhenActive) {
        setIsHudPaused(true);
        (window as any).__IS_HUD_PAUSED__ = true;
      } else {
        setIsHudPaused(false);
        (window as any).__IS_HUD_PAUSED__ = false;
      }
    };

    apiClient.getOverlayConfig()
      .then((data: any) => { if (data && typeof data === 'object' && Object.keys(data).length > 0) checkConfig(data); })
      .catch(() => {});

    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'config') {
        checkConfig(event.data.data);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // Monitor IsRaceOn to auto-redirect and load the latest session on race completion
  useEffect(() => {
    if (!data) return;
    const isRacingNow = data.IsRaceOn === 1;
    
    // Transition from racing (true) to not racing (false)
    if (prevIsRacingRef.current && !isRacingNow) {
      if (isRecording) {
        const timer = setTimeout(async () => {
          await loadSavedSession('latest.json');
          setSubTab('analysis');
        }, 500);
        return () => clearTimeout(timer);
      }
    }
    prevIsRacingRef.current = isRacingNow;
  }, [data?.IsRaceOn, isRecording, loadSavedSession]);

  const isRacing = data?.IsRaceOn === 1;

  const rpm = data?.CurrentEngineRpm || 0;
  const rpmIdle = data?.EngineIdleRpm || 0;
  const rpmMax = data?.EngineMaxRpm || 1;
  const rpmPercent = Math.max(0, Math.min(100, ((rpm - rpmIdle) / (rpmMax - rpmIdle)) * 100));

  const speedData = convertSpeed(data?.SpeedMetersPerSecond || 0);
  const powerData = convertPower(data?.PowerWatts || 0);
  const torqueData = convertTorque(data?.TorqueNewtons || 0);
  const boostData = convertBoost(data?.Boost || 0);

  const gear = data?.Gear || 0;
  const currentLap = data?.CurrentLap || 0;
  const bestLap = data?.BestLap || 0;
  const lastLap = data?.LastLap || 0;

  const classDisplay = getCarClassString(data?.CarClass);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: isRacing ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: isRacing ? '0 0 10px var(--primary)' : 'none', transition: 'all 0.3s' }} />
            <span style={{ fontWeight: 600, color: isRacing ? '#fff' : 'var(--text-secondary)' }}>
              {isRacing ? t("LIVE TELEMETRY") : t("PAUSED")}
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={subTab === 'live' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('live')}>{t("Dashboard")}</button>
            <button style={subTab === 'analysis' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('analysis')}>{t("Post-Race Analysis")}</button>
            <button style={subTab === 'drag' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('drag')}>{t("Drag Test")}</button>
          </div>
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
          {classDisplay && <span style={{ color: '#00f0ff', marginRight: '0.6rem' }}>{classDisplay}</span>}
          {carName}
        </div>
      </div>

      {isHudPaused && (
        <div style={{
          padding: '0.8rem 1.2rem',
          marginBottom: '1.5rem',
          background: 'rgba(255, 170, 0, 0.12)',
          border: '1px solid rgba(255, 170, 0, 0.4)',
          borderRadius: '8px',
          color: '#ffaa00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.9rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⏸️</span>
            <strong>{t("Telemetry rendering paused (HUD Overlay is active)") || "Telemetry 畫面已暫停渲染 (HUD Overlay 啟用中，節省 CPU/GPU 資源)"}</strong>
          </div>
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            {t("Can be toggled in HUD Control Panel") || "可在 HUD 控制面板關閉此暫停開關"}
          </span>
        </div>
      )}

      {subTab === 'analysis' ? (
        <React.Suspense fallback={<div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading Analysis Module...</div>}>
          <AnalysisView />
        </React.Suspense>
      ) : subTab === 'drag' ? (
        <React.Suspense fallback={<div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading Drag Test Module...</div>}>
          <DragTestView />
        </React.Suspense>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '4.5fr 5.5fr', gap: '2rem', flex: 1, minHeight: '600px' }}>
      
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>{t("Driver Inputs & Engine")}</h3>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.5rem' }}>
                <div><div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>{Math.round(rpm)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>RPM</span></div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>{gear === 0 ? 'R' : gear} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t("GEAR")}</span></div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{Math.round(speedData.value)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{speedData.label}</span></div></div>
              </div>
              <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${rpmPercent}%`, background: rpmPercent > 90 ? 'var(--secondary)' : 'var(--primary)', transition: 'width 0.1s linear, background 0.3s ease' }} />
              </div>
            </div>
            <SteerBar />
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <PedalTraceCanvas />
            </div>
            <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', padding: '0 0.5rem' }}>
              <VerticalInputBar label={t("Clutch")} selector={d => d.ClutchInput || 0} max={255} color="#0088ff" />
              <VerticalInputBar label={t("Handbrake")} selector={d => d.HandBrakeInput || 0} max={255} color="#ffaa00" />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>{t("Vehicle Dynamics Overview")}</h3>
        <div style={{ display: 'flex', gap: '2rem', flex: 1, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              <div><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t("Power")}</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(powerData.value)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{powerData.label}</span></div></div>
              <div><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t("Torque")}</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(torqueData.value)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{torqueData.label}</span></div></div>
              <div><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t("Boost")}</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: boostData.value > 0 ? 'var(--secondary)' : '#fff' }}>{boostData.value.toFixed(1)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{boostData.label}</span></div></div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}><span style={{ color: 'var(--text-secondary)' }}>{t("Current Lap")}:</span><span style={{ fontFamily: 'monospace' }}>{formatTime(currentLap)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}><span style={{ color: 'var(--text-secondary)' }}>{t("Last Lap")}:</span><span style={{ fontFamily: 'monospace' }}>{formatTime(lastLap)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}><span style={{ color: 'var(--primary)' }}>{t("Best Lap")}:</span><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{formatTime(bestLap)}</span></div>
            </div>
          </div>
          <GForceRadar />
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>{t("Tire Grip & Status")}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1rem', flex: 1 }}>
          <TireRadar title={t("Front Left")} isLeft={true} tireIdx={0} />
          <TireRadar title={t("Front Right")} isLeft={false} tireIdx={1} />
          <TireRadar title={t("Rear Left")} isLeft={true} tireIdx={2} />
          <TireRadar title={t("Rear Right")} isLeft={false} tireIdx={3} />
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>{t("Suspension Travel")}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1.2rem', flex: 1 }}>
          <SuspensionBar title={t("Front Left")} isLeft={true} tireIdx={0} />
          <SuspensionBar title={t("Front Right")} isLeft={false} tireIdx={1} />
          <SuspensionBar title={t("Rear Left")} isLeft={true} tireIdx={2} />
          <SuspensionBar title={t("Rear Right")} isLeft={false} tireIdx={3} />
        </div>
      </div>

      </div>
      )}
    </div>
  );
};

export default TelemetryView;
