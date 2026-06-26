const fs = require('fs');

const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add telemetryEmitter import
content = content.replace(
  "import { useTelemetry } from '../hooks/useTelemetry';",
  "import { useTelemetry, telemetryEmitter } from '../hooks/useTelemetry';"
);

// 2. Fix TelemetryView useEffect
// We replace `useEffect(() => { ... }, [data]);` with the event listener version.
const oldTelemetryUseEffect = `  useEffect(() => {
    if (!data) return;
    
    // Proactive memory cleanup on race state changes (soft cleanup)
    if (data.IsRaceOn !== lastIsRaceOnRef.current) {
      historyG.current = [];
      historySusp.current = [];
      historyTire.current = [];
      lastIsRaceOnRef.current = data.IsRaceOn;
    }

    // We only track when racing to avoid clutter when paused/in menus
    if (data.IsRaceOn !== 1) return;

    const now = performance.now();
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;

    const lat = (data.AccelerationX || 0) / 9.81;
    const lon = (data.AccelerationZ || 0) / 9.81;
    const speed = data.SpeedMetersPerSecond || 0;
    const isMoving = Math.abs(speed) >= 0.5;
    
    // --- Zero-Allocation Object Pool (Ring Buffer alternative) ---
    // Instead of creating new objects every frame, we reuse the oldest objects
    const MAX_HISTORY = 900; // 30 seconds at 30 FPS

    if (historyG.current.length < MAX_HISTORY) {
      historyG.current.push({ lat, lon, time: now });
    } else {
      const old = historyG.current.shift();
      if (old) {
        old.lat = lat; old.lon = lon; old.time = now;
        historyG.current.push(old);
      }
    }

    const suspTravel = data.NormalizedSuspensionTravel || [0, 0, 0, 0];
    if (!isMoving) {
      for (let i = 0; i < historySusp.current.length; i++) historySusp.current[i].time += dt;
    } else {
      if (historySusp.current.length < MAX_HISTORY) {
        historySusp.current.push({ FL: suspTravel[0], FR: suspTravel[1], RL: suspTravel[2], RR: suspTravel[3], time: now });
      } else {
        const old = historySusp.current.shift();
        if (old) {
          old.FL = suspTravel[0]; old.FR = suspTravel[1]; old.RL = suspTravel[2]; old.RR = suspTravel[3]; old.time = now;
          historySusp.current.push(old);
        }
      }
    }

    const tireTemp = data.TireTemp || [0,0,0,0];
    const slipRatio = data.TireSlipRatio || [0,0,0,0];
    const slipAngle = data.TireSlipAngle || [0,0,0,0];

    if (!isMoving) {
      for (let i = 0; i < historyTire.current.length; i++) historyTire.current[i].time += dt;
    } else {
      if (historyTire.current.length < MAX_HISTORY) {
        historyTire.current.push({
          FL: { temp: tireTemp[0], ratio: slipRatio[0], angle: slipAngle[0] },
          FR: { temp: tireTemp[1], ratio: slipRatio[1], angle: slipAngle[1] },
          RL: { temp: tireTemp[2], ratio: slipRatio[2], angle: slipAngle[2] },
          RR: { temp: tireTemp[3], ratio: slipRatio[3], angle: slipAngle[3] },
          time: now,
          speed: speed
        });
      } else {
        const old = historyTire.current.shift();
        if (old) {
          old.FL.temp = tireTemp[0]; old.FL.ratio = slipRatio[0]; old.FL.angle = slipAngle[0];
          old.FR.temp = tireTemp[1]; old.FR.ratio = slipRatio[1]; old.FR.angle = slipAngle[1];
          old.RL.temp = tireTemp[2]; old.RL.ratio = slipRatio[2]; old.RL.angle = slipAngle[2];
          old.RR.temp = tireTemp[3]; old.RR.ratio = slipRatio[3]; old.RR.angle = slipAngle[3];
          old.time = now;
          old.speed = speed;
          historyTire.current.push(old);
        }
      }
    }
  }, [data]);`;

const newTelemetryUseEffect = `  useEffect(() => {
    const handleUpdate = (e: any) => {
      const data = e.detail;
      if (!data) return;
      
      // Proactive memory cleanup on race state changes (soft cleanup)
      if (data.IsRaceOn !== lastIsRaceOnRef.current) {
        historyG.current = [];
        historySusp.current = [];
        historyTire.current = [];
        lastIsRaceOnRef.current = data.IsRaceOn;
      }

      if (data.IsRaceOn !== 1) return;

      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const lat = (data.AccelerationX || 0) / 9.81;
      const lon = (data.AccelerationZ || 0) / 9.81;
      const speed = data.SpeedMetersPerSecond || 0;
      const isMoving = Math.abs(speed) >= 0.5;
      
      const MAX_HISTORY = 1800; // 30 seconds at 60 FPS

      if (historyG.current.length < MAX_HISTORY) {
        historyG.current.push({ lat, lon, time: now });
      } else {
        const old = historyG.current.shift();
        if (old) {
          old.lat = lat; old.lon = lon; old.time = now;
          historyG.current.push(old);
        }
      }

      const suspTravel = data.NormalizedSuspensionTravel || [0, 0, 0, 0];
      if (!isMoving) {
        for (let i = 0; i < historySusp.current.length; i++) historySusp.current[i].time += dt;
      } else {
        if (historySusp.current.length < MAX_HISTORY) {
          historySusp.current.push({ FL: suspTravel[0], FR: suspTravel[1], RL: suspTravel[2], RR: suspTravel[3], time: now });
        } else {
          const old = historySusp.current.shift();
          if (old) {
            old.FL = suspTravel[0]; old.FR = suspTravel[1]; old.RL = suspTravel[2]; old.RR = suspTravel[3]; old.time = now;
            historySusp.current.push(old);
          }
        }
      }

      const tireTemp = data.TireTemp || [0,0,0,0];
      const slipRatio = data.TireSlipRatio || [0,0,0,0];
      const slipAngle = data.TireSlipAngle || [0,0,0,0];

      if (!isMoving) {
        for (let i = 0; i < historyTire.current.length; i++) historyTire.current[i].time += dt;
      } else {
        if (historyTire.current.length < MAX_HISTORY) {
          historyTire.current.push({
            FL: { temp: tireTemp[0], ratio: slipRatio[0], angle: slipAngle[0] },
            FR: { temp: tireTemp[1], ratio: slipRatio[1], angle: slipAngle[1] },
            RL: { temp: tireTemp[2], ratio: slipRatio[2], angle: slipAngle[2] },
            RR: { temp: tireTemp[3], ratio: slipRatio[3], angle: slipAngle[3] },
            time: now,
            speed: speed
          });
        } else {
          const old = historyTire.current.shift();
          if (old) {
            old.FL.temp = tireTemp[0]; old.FL.ratio = slipRatio[0]; old.FL.angle = slipAngle[0];
            old.FR.temp = tireTemp[1]; old.FR.ratio = slipRatio[1]; old.FR.angle = slipAngle[1];
            old.RL.temp = tireTemp[2]; old.RL.ratio = slipRatio[2]; old.RL.angle = slipAngle[2];
            old.RR.temp = tireTemp[3]; old.RR.ratio = slipRatio[3]; old.RR.angle = slipAngle[3];
            old.time = now;
            old.speed = speed;
            historyTire.current.push(old);
          }
        }
      }
    };
    
    // Subscribe to 60Hz telemetry emitter
    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => telemetryEmitter.removeEventListener('update', handleUpdate);
  }, []);`;

content = content.replace(oldTelemetryUseEffect, newTelemetryUseEffect);

// 3. Rewrite TireRadar useEffect
const oldTireRadarUseEffectStart = `  useEffect(() => {
    const rCanvas = radarCanvasRef.current;`;
const oldTireRadarUseEffectEnd = `        ctx.globalAlpha = 1.0;
      }
    }
  });`;

const tireRadarUseEffectRegex = /useEffect\(\(\) => \{\s*const rCanvas = radarCanvasRef\.current;[\s\S]*?ctx\.globalAlpha = 1\.0;\s*\}\s*\}\s*\}\);\s*/m;

const newTireRadarUseEffect = `  useEffect(() => {
    const handleDraw = (e: any) => {
      const liveData = e.detail;
      if (!liveData || liveData.IsRaceOn !== 1) return;

      // Extract current data from live event to bypass React props delay
      let cTemp = currentData.temp;
      let cRatio = currentData.ratio;
      let cAngle = currentData.angle;
      
      if (liveData.TireTemp && liveData.TireSlipRatio && liveData.TireSlipAngle) {
        let idx = 0;
        if (title.includes('Right')) idx += 1;
        if (title.includes('Rear')) idx += 2;
        cTemp = liveData.TireTemp[idx];
        cRatio = liveData.TireSlipRatio[idx];
        cAngle = liveData.TireSlipAngle[idx];
      }

      const x = Math.max(-displayLimit, Math.min(displayLimit, cAngle));
      const y = Math.max(-displayLimit, Math.min(displayLimit, cRatio));
      const dotColor = getSlipColor(cRatio);

      // We still use the shared history array passed via props. 
      // It is updated by TelemetryView at 60Hz concurrently.
      const now = performance.now();
      const history3s = history.filter(p => now - p.time <= 3000);
      
      const minTemp = history.length > 0 ? Math.min(...history.map(p => p.temp)) : cTemp;
      const maxTemp = history.length > 0 ? Math.max(...history.map(p => p.temp)) : cTemp;
      
      const bins = new Array(numBins).fill(0);
      history.forEach(p => {
        if (Math.abs(p.speed) < 0.5) return; 
        let t = Math.max(tempMinScale, Math.min(tempMaxScale, p.temp));
        let binIdx = Math.floor((t - tempMinScale) / tempPerBin);
        if (binIdx >= numBins) binIdx = numBins - 1;
        bins[binIdx]++;
      });
      const maxBinCount = Math.max(1, ...bins);

      const rCanvas = radarCanvasRef.current;
      if (rCanvas) {
        const ctx = rCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, radius*2, radius*2);
          
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
              const cy = radius + (py / displayLimit) * radius;
              if (i === 0) ctx.moveTo(cx, cy);
              else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
          }

          // Draw the Live Dot directly on the canvas instead of using a React DOM element!
          ctx.beginPath();
          ctx.arc(radius + (x / displayLimit) * radius, radius + (y / displayLimit) * radius, 4, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.shadowBlur = 8;
          ctx.shadowColor = dotColor;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      const hCanvas = histCanvasRef.current;
      if (hCanvas) {
        const ctx = hCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, histWidth, histHeight);

          const y210 = getTempY(210);
          const y150 = getTempY(150);

          ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
          ctx.fillRect(0, 0, histWidth, y210);
          ctx.beginPath();
          ctx.moveTo(0, y210); ctx.lineTo(histWidth, y210);
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
          ctx.setLineDash([3, 3]);
          ctx.stroke();

          ctx.fillStyle = 'rgba(0, 136, 255, 0.1)';
          ctx.fillRect(0, y150, histWidth, histHeight - y150);
          ctx.beginPath();
          ctx.moveTo(0, y150); ctx.lineTo(histWidth, y150);
          ctx.strokeStyle = 'rgba(0, 136, 255, 0.3)';
          ctx.stroke();
          ctx.setLineDash([]);

          const grad = ctx.createLinearGradient(0, 0, 0, histHeight);
          grad.addColorStop(0, '#ff0000');
          grad.addColorStop(y210 / histHeight, '#ff0000');
          grad.addColorStop(y210 / histHeight, '#00ff00');
          grad.addColorStop(y150 / histHeight, '#00ff00');
          grad.addColorStop(y150 / histHeight, '#0088ff');
          grad.addColorStop(1, '#0088ff');

          ctx.fillStyle = grad;
          ctx.globalAlpha = 0.8;
          for (let idx = 0; idx < bins.length; idx++) {
            const count = bins[idx];
            if (count > 0) {
              const w = (count / maxBinCount) * histWidth;
              const y = histHeight - (idx + 1) * binHeight;
              const xOffset = layoutLeft ? 0 : histWidth - w;
              ctx.fillRect(xOffset, y, w, Math.max(1, binHeight - 0.5));
            }
          }
          ctx.globalAlpha = 1.0;
        }
      }
    };
    
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, [history, layoutLeft, title]);
`;
content = content.replace(tireRadarUseEffectRegex, newTireRadarUseEffect);

// Remove the DOM node for the Grip Dot in TireRadar since we now draw it on Canvas!
content = content.replace(
  /<div style=\{\{\s*position: 'absolute',\s*width: '8px',\s*height: '8px',\s*backgroundColor: dotColor,[\s\S]*?pointerEvents: 'none'\s*\}\} \/>/m,
  ''
);

// 4. Rewrite SuspensionBar useEffect
const suspBarRegex = /useEffect\(\(\) => \{\s*const canvas = canvasRef\.current;[\s\S]*?ctx\.stroke\(\);\s*\}\s*\}\s*\}\s*\}\);\s*/m;

const newSuspBarUseEffect = `  useEffect(() => {
    const handleDraw = (e: any) => {
      const liveData = e.detail;
      if (!liveData || liveData.IsRaceOn !== 1) return;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, svgWidth, svgHeight);

          ctx.fillStyle = 'rgba(255, 0, 60, 0.15)';
          ctx.fillRect(0, 0, svgWidth, 5);
          ctx.fillRect(0, 95, svgWidth, 5);
          
          ctx.strokeStyle = 'rgba(255, 0, 60, 0.2)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, 5); ctx.lineTo(svgWidth, 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, 95); ctx.lineTo(svgWidth, 95);
          ctx.stroke();
          ctx.setLineDash([]);

          if (history.length > 0) {
            const lineGrad = ctx.createLinearGradient(0, 0, 0, svgHeight);
            lineGrad.addColorStop(0, '#ff003c');
            lineGrad.addColorStop(0.05, '#ff003c');
            lineGrad.addColorStop(0.05, '#00f0ff');
            lineGrad.addColorStop(0.95, '#00f0ff');
            lineGrad.addColorStop(0.95, '#ff003c');
            lineGrad.addColorStop(1, '#ff003c');

            const fillGrad = ctx.createLinearGradient(0, 0, 0, svgHeight);
            fillGrad.addColorStop(0, 'rgba(255, 0, 60, 0.25)');
            fillGrad.addColorStop(0.05, 'rgba(255, 0, 60, 0.25)');
            fillGrad.addColorStop(0.05, 'rgba(0, 240, 255, 0.15)');
            fillGrad.addColorStop(0.95, 'rgba(0, 240, 255, 0.15)');
            fillGrad.addColorStop(0.95, 'rgba(255, 0, 60, 0.25)');
            fillGrad.addColorStop(1, 'rgba(255, 0, 60, 0.25)');

            ctx.beginPath();
            ctx.moveTo(0, svgHeight);
            for (let idx = 0; idx < history.length; idx++) {
              const val = history[idx];
              const x = history.length > 1 ? (idx / (history.length - 1)) * svgWidth : 0;
              const y = svgHeight - (val * svgHeight);
              ctx.lineTo(x, y);
            }
            ctx.lineTo(svgWidth, svgHeight);
            ctx.closePath();
            ctx.fillStyle = fillGrad;
            ctx.fill();

            ctx.beginPath();
            for (let idx = 0; idx < history.length; idx++) {
              const val = history[idx];
              const x = history.length > 1 ? (idx / (history.length - 1)) * svgWidth : 0;
              const y = svgHeight - (val * svgHeight);
              if (idx === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    };
    
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, [history]);
`;

content = content.replace(suspBarRegex, newSuspBarUseEffect);

fs.writeFileSync(path, content, 'utf8');
console.log("Successfully refactored Canvas to bypass React using EventTarget.");
