const fs = require('fs');

const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(path, 'utf8');

const tireRadarStart = content.indexOf('const TireRadar: React.FC<{');
const getTempColorStart = content.indexOf('const getTempColor = (temp: number) => {');

if (tireRadarStart === -1 || getTempColorStart === -1) {
  console.error('Could not find injection points');
  process.exit(1);
}

const newComponents = `const TireRadar: React.FC<{
  title: string, 
  currentData: { temp: number, ratio: number, angle: number },
  history: { temp: number, ratio: number, angle: number, time: number, speed: number }[],
  isLeft: boolean
}> = ({title, currentData, history, isLeft}) => {
  const radius = 50; 
  const displayLimit = 1.5; 
  const { convertTemp } = useSettings();
  const tempVal = convertTemp(currentData.temp);

  const x = Math.max(-displayLimit, Math.min(displayLimit, currentData.angle));
  const y = Math.max(-displayLimit, Math.min(displayLimit, currentData.ratio));

  const isLosingGrip = Math.abs(currentData.ratio) > 1.0 || Math.abs(currentData.angle) > 1.0;
  const dotColor = getSlipColor(currentData.ratio);

  const histWidth = 100;
  const histHeight = 100;

  const now = performance.now();
  const history3s = history.filter(p => now - p.time <= 3000);
  
  const minTemp = history.length > 0 ? Math.min(...history.map(p => p.temp)) : currentData.temp;
  const maxTemp = history.length > 0 ? Math.max(...history.map(p => p.temp)) : currentData.temp;

  const tempMinScale = 50;
  const tempMaxScale = 250;
  
  const getTempY = (t: number) => {
    const clamped = Math.max(tempMinScale, Math.min(tempMaxScale, t));
    return histHeight - ((clamped - tempMinScale) / (tempMaxScale - tempMinScale)) * histHeight;
  };

  const numBins = 40;
  const binHeight = histHeight / numBins;
  const tempRange = tempMaxScale - tempMinScale;
  const tempPerBin = tempRange / numBins;

  const bins = new Array(numBins).fill(0);
  history.forEach(p => {
    if (Math.abs(p.speed) < 0.5) return; 
    let t = Math.max(tempMinScale, Math.min(tempMaxScale, p.temp));
    let binIdx = Math.floor((t - tempMinScale) / tempPerBin);
    if (binIdx >= numBins) binIdx = numBins - 1;
    bins[binIdx]++;
  });

  const maxBinCount = Math.max(1, ...bins);

  const layoutLeft = !isLeft;
  const flexDirection = layoutLeft ? 'row' : 'row-reverse';
  
  const rOuter = (0.14 / displayLimit) * radius;
  const rInner = (0.08 / displayLimit) * radius;

  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const histCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
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
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', minWidth: '220px' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.8rem', textAlign: 'center' }}>
        {title}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: layoutLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: '0.8rem' }}>
          
          <div style={{ position: 'relative', width: \`\${radius*2}px\`, height: \`\${radius*2}px\`, borderRadius: '50%', border: isLosingGrip ? '2px solid #ff003c' : '2px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <canvas ref={radarCanvasRef} width={radius*2} height={radius*2} style={{position: 'absolute', top: 0, left: 0}} />
            
            <div style={{ position: 'absolute', top: \`\${radius - (radius/displayLimit)}px\`, left: \`\${radius - (radius/displayLimit)}px\`, width: \`\${(radius/displayLimit)*2}px\`, height: \`\${(radius/displayLimit)*2}px\`, borderRadius: '50%', border: '1px dashed rgba(255,0,0,0.5)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', top: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.1)', left: '50%', pointerEvents: 'none' }} />

            <div style={{
              position: 'absolute',
              width: '8px',
              height: '8px',
              backgroundColor: dotColor,
              borderRadius: '50%',
              boxShadow: \`0 0 8px \${dotColor}\`,
              transform: \`translate(\${radius + (x / displayLimit) * radius - 4}px, \${radius + (y / displayLimit) * radius - 4}px)\`,
              transition: 'transform 0.05s linear, background 0.1s',
              pointerEvents: 'none'
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: layoutLeft ? 'flex-start' : 'flex-end', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
             <span style={{ color: getTempColor(currentData.temp), fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.2rem' }}>{Math.round(tempVal.value)}{tempVal.label}</span>
             <span>Min: <span style={{ color: getTempColor(minTemp), fontWeight: 600 }}>{Math.round(minTemp)}</span></span>
             <span>Max: <span style={{ color: getTempColor(maxTemp), fontWeight: 600 }}>{Math.round(maxTemp)}</span></span>
             <span>Ang: {currentData.angle.toFixed(2)}</span>
             <span>Ratio: {Math.round(currentData.ratio * 100)}%</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: \`\${histHeight}px\`, width: '24px', justifyContent: 'center' }}>
          <div style={{ width: '16px', height: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: \`\${getTempY(210)}%\`, left: -2, right: -2, height: '1px', background: '#ff0000', zIndex: 1 }} />
            <div style={{ position: 'absolute', top: \`\${getTempY(150)}%\`, left: -2, right: -2, height: '1px', background: '#0088ff', zIndex: 1 }} />
            
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: \`\${100 - getTempY(currentData.temp)}%\`,
              background: getTempColor(currentData.temp),
              transition: 'height 0.05s linear, background 0.1s',
              borderRadius: currentData.temp > 210 ? '8px' : '0 0 8px 8px'
            }} />
          </div>
        </div>

        <div style={{ flex: 1, height: \`\${histHeight}px\`, position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <canvas ref={histCanvasRef} width={histWidth} height={histHeight} style={{ display: 'block' }} />
        </div>
      </div>
    </div>
  );
};

interface SuspensionBarProps {
  title: string;
  travel: number;
  history: number[];
  minVal: number;
  maxVal: number;
  isLeft: boolean;
}

const SuspensionBar: React.FC<SuspensionBarProps> = ({title, travel, history, minVal, maxVal, isLeft}) => {
  const percent = Math.max(0, Math.min(100, travel * 100));
  const isBottomingOut = percent > 95;
  const isMaxStretch = percent < 5;

  const isMaxWarning = maxVal >= 0.95;
  const isMinWarning = minVal <= 0.05;
  const maxColor = isMaxWarning ? '#ff003c' : '#ffaa00';
  const minColor = isMinWarning ? '#ff003c' : '#00f0ff';

  const svgWidth = 140;
  const svgHeight = 100;
  const flexDirection = isLeft ? 'row' : 'row-reverse';

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
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
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', minWidth: '220px' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.8rem', textAlign: 'center' }}>
        {title}
      </div>
      
      <div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center' }}>
        <div style={{ flex: 1, height: \`\${svgHeight}px\`, position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <canvas ref={canvasRef} width={svgWidth} height={svgHeight} style={{ display: 'block' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: \`\${svgHeight}px\`, width: '24px', justifyContent: 'center' }}>
          <div style={{ width: '16px', height: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)', zIndex: 1 }} />
            
            <div style={{
              position: 'absolute', bottom: \`\${minVal * 100}%\`, left: -4, right: -4, height: '2px',
              background: minColor, boxShadow: \`0 0 4px \${minColor}\`, zIndex: 2
            }} />
            <div style={{
              position: 'absolute', bottom: \`\${maxVal * 100}%\`, left: -4, right: -4, height: '2px',
              background: maxColor, boxShadow: \`0 0 4px \${maxColor}\`, zIndex: 2
            }} />

            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: \`\${percent}%\`,
              background: isBottomingOut ? 'var(--secondary)' : isMaxStretch ? '#ffaa00' : 'var(--primary)',
              transition: 'height 0.05s linear, background 0.1s',
              borderRadius: percent > 95 ? '8px' : '0 0 8px 8px'
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 0.2rem' }}>
        <span>Min: <span style={{ color: minColor, fontWeight: 600 }}>{minVal.toFixed(2)}</span></span>
        <span style={{ color: 'white', fontWeight: 'bold' }}>{travel.toFixed(2)}</span>
        <span>Max: <span style={{ color: maxColor, fontWeight: 600 }}>{maxVal.toFixed(2)}</span></span>
      </div>
    </div>
  );
};
`;

const finalContent = content.substring(0, tireRadarStart) + newComponents + content.substring(getTempColorStart);
fs.writeFileSync(path, finalContent, 'utf8');
console.log('Successfully replaced TireRadar and SuspensionBar with Canvas versions.');
