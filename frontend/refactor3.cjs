const fs = require('fs');
const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';

const fileContent = `import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry, telemetryEmitter } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { useCarParams } from '../context/CarParamsContext';
import AnalysisView from './AnalysisView';

const getCarClassString = (cls?: number) => {
  if (cls === undefined) return '';
  const classes = ['E', 'D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  if (cls >= 0 && cls < classes.length) return classes[cls];
  return \`Class \${cls}\`;
};

const getSlipColor = (ratio: number) => {
  const absRatio = Math.abs(ratio);
  if (absRatio < 0.08) return '#00f0ff';
  if (absRatio <= 0.14) return '#00ff00';
  if (absRatio <= 0.5) return '#00f0ff';
  if (absRatio <= 1.0) return '#ffaa00';
  return '#ff003c';
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
  return \`\${mins.toString().padStart(2, '0')}:\${secs.toString().padStart(2, '0')}.\${ms.toString().padStart(3, '0')}\`;
};

// --- COMPONENT: InputBar ---
const InputBar: React.FC<{label: string, selector: (d: any) => number, max: number, color: string}> = ({label, selector, max, color}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const handleDraw = (e: any) => {
      const data = e.detail;
      if (!data || data.IsRaceOn !== 1) return;
      const percent = Math.min((selector(data) / max) * 100, 100);
      if (barRef.current) barRef.current.style.width = percent + '%';
      if (textRef.current) textRef.current.innerText = Math.round(percent) + '%';
    };
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, [selector, max]);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
        <span>{label}</span>
        <span ref={textRef}>0%</span>
      </div>
      <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
        <div ref={barRef} style={{ height: '100%', width: '0%', background: color, transition: 'width 0.05s linear' }} />
      </div>
    </div>
  );
};

// --- COMPONENT: SteerBar ---
const SteerBar: React.FC = () => {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleDraw = (e: any) => {
      const data = e.detail;
      if (!data || data.IsRaceOn !== 1) return;
      const steer = data.SteerInput || 0;
      if (barRef.current) {
        barRef.current.style.width = \`\${Math.abs(steer) / 127 * 50}%\`;
        barRef.current.style.left = steer < 0 ? \`\${50 - (Math.abs(steer)/127*50)}%\` : '50%';
      }
    };
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, []);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <span>Steer L</span>
        <span>Steer R</span>
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

  useEffect(() => {
    let frame: number;
    const handleDraw = (e: any) => {
      const data = e.detail;
      if (!data || data.IsRaceOn !== 1) return;
      
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const lat = (data.AccelerationX || 0) / 9.81;
      const lon = (data.AccelerationZ || 0) / 9.81;
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
        dotRef.current.style.transform = \`translate(\${Math.max(-2, Math.min(2, lat)) * 40}px, \${Math.max(-2, Math.min(2, lon)) * 40}px)\`;
      }
      if (latRef.current) latRef.current.innerText = Math.abs(lat).toFixed(2);
      if (lonRef.current) lonRef.current.innerText = Math.abs(lon).toFixed(2);
    };
    telemetryEmitter.addEventListener('update', handleDraw);

    // 5Hz marker updater for React state
    const markerInterval = setInterval(() => {
      const now = performance.now();
      const history30s = hist.current.filter(p => now - p.time <= 30000);
      if (history30s.length > 0) {
        let maxLatL = { lat: 0, lon: 0 }, maxLatR = { lat: 0, lon: 0 };
        let maxLonB = { lat: 0, lon: 0 }, maxLonA = { lat: 0, lon: 0 };
        let maxL_B = { lat: 0, lon: 0 }, maxL_A = { lat: 0, lon: 0 };
        let maxR_B = { lat: 0, lon: 0 }, maxR_A = { lat: 0, lon: 0 };
        for (const p of history30s) {
          if (p.lat < maxLatL.lat) maxLatL = p;
          if (p.lat > maxLatR.lat) maxLatR = p;
          if (p.lon < maxLonB.lon) maxLonB = p;
          if (p.lon > maxLonA.lon) maxLonA = p;
          if (p.lat < 0 && p.lon < 0 && (p.lat+p.lon < maxL_B.lat+maxL_B.lon)) maxL_B = p;
          if (p.lat < 0 && p.lon > 0 && (p.lat-p.lon < maxL_A.lat-maxL_A.lon)) maxL_A = p;
          if (p.lat > 0 && p.lon < 0 && (p.lat-p.lon > maxR_B.lat-maxR_B.lon)) maxR_B = p;
          if (p.lat > 0 && p.lon > 0 && (p.lat+p.lon > maxR_A.lat+maxR_A.lon)) maxR_A = p;
        }
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
        <span style={{ position: 'absolute', top: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BRAKE</span>
        <span style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>ACCEL</span>
        <span style={{ position: 'absolute', left: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>L</span>
        <span style={{ position: 'absolute', right: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>R</span>
        
        {markers.map((p, i) => (
          <div key={i} style={{ 
            position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.6)', 
            top: \`\${80 + Math.max(-2, Math.min(2, p.lon)) * 40 - 3}px\`, 
            left: \`\${80 + Math.max(-2, Math.min(2, p.lat)) * 40 - 3}px\`,
            transition: 'top 0.1s linear, left 0.1s linear'
          }} />
        ))}
        <div ref={dotRef} style={{
          position: 'absolute', width: '14px', height: '14px', backgroundColor: 'var(--primary)',
          borderRadius: '50%', boxShadow: '0 0 12px var(--primary)', transition: 'transform 0.05s linear'
        }} />
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem' }}>
        <div style={{ textAlign: 'center' }}>
          <span ref={latRef} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>0.00</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>Lat G</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <span ref={lonRef} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--secondary)' }}>0.00</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>Lon G</span>
        </div>
      </div>
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
  
  const { convertTemp, tempUnit } = useSettings();

  useEffect(() => {
    const radius = 50; 
    const displayLimit = 1.5; 
    const histWidth = 100;
    const histHeight = 100;

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if (!liveData || liveData.IsRaceOn !== 1) return;
      
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

      if (tempRef.current) tempRef.current.innerText = Math.round(convertTemp(cTemp)).toString();
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
          const rOuter = radius * 0.9;
          const rInner = radius * 0.6;
          ctx.save();
          ctx.beginPath();
          ctx.arc(radius, radius, rOuter, 0, Math.PI * 2);
          ctx.arc(radius, radius, rInner, 0, Math.PI * 2, true);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          const history3s = hist.current.filter(p => now - p.time <= 3000);
          if (history3s.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            for (let i = 0; i < history3s.length; i++) {
              const p = history3s[i];
              const px = Math.max(-displayLimit, Math.min(displayLimit, p.angle));
              const py = Math.max(-displayLimit, Math.min(displayLimit, p.ratio));
              const cx = radius + (px / displayLimit) * radius;
              const cy = radius - (py / displayLimit) * radius;
              if (i === 0) ctx.moveTo(cx, cy);
              else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
          }

          const dotColor = getSlipColor(cRatio);
          const px = Math.max(-displayLimit, Math.min(displayLimit, cAngle));
          const py = Math.max(-displayLimit, Math.min(displayLimit, cRatio));
          ctx.beginPath();
          ctx.arc(radius + (px / displayLimit) * radius, radius - (py / displayLimit) * radius, 6, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        }
      }

      const tCanvas = tempCanvasRef.current;
      if (tCanvas) {
        const ctx = tCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, histWidth, histHeight);
          const minTemp = hist.current.length > 0 ? Math.min(...hist.current.map(p => p.temp)) : cTemp;
          const maxTemp = hist.current.length > 0 ? Math.max(...hist.current.map(p => p.temp)) : cTemp;
          
          let tempMinScale = minTemp - 20;
          let tempMaxScale = maxTemp + 20;
          if (tempMaxScale - tempMinScale < 40) {
            const mid = (tempMaxScale + tempMinScale) / 2;
            tempMinScale = mid - 20;
            tempMaxScale = mid + 20;
          }
          
          const numBins = 30;
          const tempPerBin = (tempMaxScale - tempMinScale) / numBins;
          const bins = new Array(numBins).fill(0);
          hist.current.forEach(p => {
            if (Math.abs(p.speed) < 0.5) return; 
            let t = Math.max(tempMinScale, Math.min(tempMaxScale, p.temp));
            let binIdx = Math.floor((t - tempMinScale) / tempPerBin);
            if (binIdx >= numBins) binIdx = numBins - 1;
            bins[binIdx]++;
          });
          const maxBinCount = Math.max(1, ...bins);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          for (let i = 0; i < numBins; i++) {
            const h = (bins[i] / maxBinCount) * histHeight;
            if (h > 0) {
              const binTemp = tempMinScale + i * tempPerBin;
              ctx.fillStyle = getTempColor(binTemp);
              // Adjust alignment to exterior! User asked: "胎溫直方圖和即時胎溫應該對其外側"
              // isLeft = true means Left side of the car, so align left? Or outer?
              // If isLeft is true, outer is LEFT. So bar grows left-to-right?
              // Wait, histogram usually draws bars upwards. Here we draw horizontal bars?
              // No, it's vertical. The width is histWidth.
              // Let's draw vertical bars.
              const barW = histWidth / numBins;
              // User said: "胎溫直方圖和即時胎溫應該對其外側，以免位置不斷受到中間AVG和Ratio值的字串長度影響"
              // So the histogram is on the outer side.
              // We just draw it normally filling the canvas. The container will handle alignment.
              ctx.fillRect(i * barW, histHeight - h, barW > 1 ? barW - 1 : barW, h);
            }
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

  const isLosingGrip = false; // We can set this if needed

  return (
    <div style={{ display: 'flex', flexDirection: isLeft ? 'row' : 'row-reverse', gap: '1rem', background: isLosingGrip ? 'rgba(255,0,0,0.1)' : 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '8px', transition: 'background 0.2s', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>
        <div style={{ position: 'relative', width: '100px', height: '100px' }}>
          <canvas ref={radarCanvasRef} width={100} height={100} style={{ position: 'absolute', top: 0, left: 0 }} />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: isLeft ? 'row' : 'row-reverse', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: isLeft ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isLeft ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Slip Angle</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }} ref={angRef}>0.00</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isLeft ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Slip Ratio</span>
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
};

// --- COMPONENT: SuspensionBar ---
const SuspensionBar: React.FC<{title: string, isLeft: boolean, tireIdx: number}> = ({title, isLeft, tireIdx}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const minRef = useRef<HTMLSpanElement>(null);
  const maxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const hist = useRef<{travel: number, time: number}[]>([]);
  const lastTimeRef = useRef(performance.now());
  const [minVal, setMinVal] = useState(0);
  const [maxVal, setMaxVal] = useState(0);

  useEffect(() => {
    let currentMin = 0;
    let currentMax = 0;

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if (!liveData || liveData.IsRaceOn !== 1) return;
      
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const travel = (liveData.NormalizedSuspensionTravel && liveData.NormalizedSuspensionTravel[tireIdx]) || 0;
      if (travel < currentMin) currentMin = travel;
      if (travel > currentMax) currentMax = travel;
      
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

      const percent = Math.max(0, Math.min(100, (travel + 0.5) * 100));
      if (barRef.current) barRef.current.style.height = percent + '%';
      if (textRef.current) textRef.current.innerText = travel.toFixed(2);
      if (minRef.current) minRef.current.innerText = currentMin.toFixed(2);
      if (maxRef.current) maxRef.current.innerText = currentMax.toFixed(2);

      const canvas = canvasRef.current;
      if (canvas && hist.current.length > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 150, 60);
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          const maxT = Math.max(...hist.current.map(p => p.time));
          for (let i = 0; i < hist.current.length; i++) {
            const p = hist.current[i];
            // map time to x (0 to 150)
            const x = 150 - ((maxT - p.time) / 3000) * 150; // 3 seconds window
            // map travel (-0.5 to 0.5) to y (60 to 0)
            const y = 60 - ((p.travel + 0.5) * 60);
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
    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '8px' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>
      <div style={{ display: 'flex', gap: '1rem', height: '60px', alignItems: 'center' }}>
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
        <span>Min: <span style={{ fontWeight: 600 }} ref={minRef}>0.00</span></span>
        <span style={{ color: 'white', fontWeight: 'bold' }} ref={textRef}>0.00</span>
        <span>Max: <span style={{ fontWeight: 600 }} ref={maxRef}>0.00</span></span>
      </div>
    </div>
  );
};

// --- COMPONENT: TelemetryView MAIN ---
const TelemetryView: React.FC = () => {
  const [subTab, setSubTab] = useState<'live' | 'analysis'>('live');
  const { data } = useTelemetry();
  const { convertSpeed, convertPower, convertTorque, convertBoost, speedUnit, powerUnit, torqueUnit, boostUnit } = useSettings();
  const { carName } = useCarParams();

  if (!data) {
    return (
      <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🏎️</div>
          <h2>Waiting for Telemetry</h2>
          <p>Start Forza Horizon and ensure data out is enabled on port 5300.</p>
        </div>
      </div>
    );
  }

  const isRacing = data.IsRaceOn === 1;

  const rpm = data.CurrentEngineRpm || 0;
  const rpmIdle = data.EngineIdleRpm || 0;
  const rpmMax = data.EngineMaxRpm || 1;
  const rpmPercent = Math.max(0, Math.min(100, ((rpm - rpmIdle) / (rpmMax - rpmIdle)) * 100));

  const speed = convertSpeed(data.SpeedMetersPerSecond || 0);
  const power = convertPower(data.PowerWatts || 0);
  const torqueDisplay = convertTorque(data.TorqueNewtons || 0);
  const boostDisplay = convertBoost(data.Boost || 0);

  const gear = data.Gear || 0;
  const currentLap = data.CurrentLap || 0;
  const bestLap = data.BestLap || 0;
  const lastLap = data.LastLap || 0;

  const classDisplay = getCarClassString(data.CarClass);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: isRacing ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: isRacing ? '0 0 10px var(--primary)' : 'none', transition: 'all 0.3s' }} />
            <span style={{ fontWeight: 600, color: isRacing ? '#fff' : 'var(--text-secondary)' }}>
              {isRacing ? 'LIVE TELEMETRY' : 'PAUSED'}
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={subTab === 'live' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('live')}>Dashboard</button>
            <button style={subTab === 'analysis' ? activeTabStyle : inactiveTabStyle} onClick={() => setSubTab('analysis')}>Post-Race Analysis</button>
          </div>
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
          {classDisplay && <span style={{ color: '#00f0ff', marginRight: '0.6rem' }}>{classDisplay}</span>}
          {carName}
        </div>
      </div>

      {subTab === 'analysis' ? (
        <AnalysisView />
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '4.5fr 5.5fr', gap: '2rem', flex: 1, minHeight: '600px' }}>
      
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Driver Inputs & Engine</h3>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.5rem' }}>
                <div><div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>{Math.round(rpm)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>RPM</span></div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>{gear === 0 ? 'R' : gear} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>GEAR</span></div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{Math.round(speed)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{speedUnit}</span></div></div>
              </div>
              <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: \`\${rpmPercent}%\`, background: rpmPercent > 90 ? 'var(--secondary)' : 'var(--primary)', transition: 'width 0.1s linear, background 0.3s ease' }} />
              </div>
            </div>
            <SteerBar />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <InputBar label="Throttle" selector={d => d.AccelInput || 0} max={255} color="#00ff00" />
              <InputBar label="Brake" selector={d => d.BrakeInput || 0} max={255} color="#ff0000" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <InputBar label="Clutch" selector={d => d.ClutchInput || 0} max={255} color="#0088ff" />
              <InputBar label="Handbrake" selector={d => d.HandBrakeInput || 0} max={255} color="#ffaa00" />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Vehicle Dynamics Overview</h3>
        <div style={{ display: 'flex', gap: '2rem', flex: 1, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              <div><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Power</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(power)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{powerUnit}</span></div></div>
              <div><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Torque</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(torqueDisplay)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{torqueUnit}</span></div></div>
              <div><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Boost</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: boostDisplay > 0 ? 'var(--secondary)' : '#fff' }}>{boostDisplay.toFixed(1)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{boostUnit}</span></div></div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}><span style={{ color: 'var(--text-secondary)' }}>Current Lap:</span><span style={{ fontFamily: 'monospace' }}>{formatTime(currentLap)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}><span style={{ color: 'var(--text-secondary)' }}>Last Lap:</span><span style={{ fontFamily: 'monospace' }}>{formatTime(lastLap)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}><span style={{ color: 'var(--primary)' }}>Best Lap:</span><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{formatTime(bestLap)}</span></div>
            </div>
          </div>
          <GForceRadar />
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>Tire Grip & Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1rem', flex: 1 }}>
          <TireRadar title="Front Left" isLeft={true} tireIdx={0} />
          <TireRadar title="Front Right" isLeft={false} tireIdx={1} />
          <TireRadar title="Rear Left" isLeft={true} tireIdx={2} />
          <TireRadar title="Rear Right" isLeft={false} tireIdx={3} />
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>Suspension Travel</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1.2rem', flex: 1 }}>
          <SuspensionBar title="Front Left" isLeft={true} tireIdx={0} />
          <SuspensionBar title="Front Right" isLeft={false} tireIdx={1} />
          <SuspensionBar title="Rear Left" isLeft={true} tireIdx={2} />
          <SuspensionBar title="Rear Right" isLeft={false} tireIdx={3} />
        </div>
      </div>

      </div>
      )}
    </div>
  );
};

export default TelemetryView;
`;

fs.writeFileSync(path, fileContent, 'utf8');
console.log("Rewrite complete.");
