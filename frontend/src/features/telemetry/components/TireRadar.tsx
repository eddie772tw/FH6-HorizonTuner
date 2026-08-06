import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

const getTempColor = (temp: number) => {
  if (temp < 167) return '#0088ff';
  if (temp > 221) return '#ff0000';
  return '#00ff00';
};

// --- COMPONENT: TireRadar ---
const TireRadar: React.FC<{ title: string, isLeft: boolean, tireIdx: number }> = React.memo(({ title, isLeft, tireIdx }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{ temp: number, ratio: number, angle: number, time: number, speed: number }[]>([]);
  const lastTimeRef = useRef(performance.now());
  const tempLabelRef = useRef<HTMLSpanElement>(null);

  const angRef = useRef<HTMLSpanElement>(null);
  const ratioRef = useRef<HTMLSpanElement>(null);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const themeVars = useRef({ primary: '#00f0ff', isLight: false });
  const bgCacheRef = useRef<{ canvas: OffscreenCanvas | null; isLosingGrip: boolean }>({ canvas: null, isLosingGrip: false });
  
  // 保存 DOM 的實體邏輯尺寸 (CSS 像素)
  const tempSizeRef = useRef({ w: 90, h: 55 });

  const radarSizeRef = useRef<number>(120);
  const [radarSize, setRadarSize] = React.useState<number>(120);
  const { convertTemp } = useSettings();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (height > 0) {
          const calcSize = Math.max(70, height - 36);
          if (Math.abs(calcSize - radarSizeRef.current) > 1) {
            radarSizeRef.current = calcSize;
            setRadarSize(calcSize);
          }
        }
        
        // 取得動態容器的真實 CSS 尺寸 (以 tempCanvas 的父元素為準)
        if (tempCanvasRef.current && tempCanvasRef.current.parentElement) {
          const parent = tempCanvasRef.current.parentElement;
          tempSizeRef.current = { 
            w: Math.max(60, parent.clientWidth), 
            h: Math.max(30, parent.clientHeight) 
          };
        }
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const radius = radarSize / 2;
    const displayLimit = 1.5;

    const updateThemeVars = () => {
      const style = getComputedStyle(document.documentElement);
      themeVars.current = {
        primary: style.getPropertyValue('--primary').trim() || '#00f0ff',
        isLight: document.documentElement.getAttribute('data-bs-theme') === 'light',
      };
      bgCacheRef.current.canvas = null;
    };
    updateThemeVars();
    const themeObserver = new MutationObserver(updateThemeVars);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

    const rCanvas = radarCanvasRef.current;
    if (rCanvas) {
      const dpr = window.devicePixelRatio || 1;
      // 確保內部 Canvas Buffer 乘以 DPR
      rCanvas.width = Math.floor(radarSize * dpr);
      rCanvas.height = Math.floor(radarSize * dpr);
      // CSS 保持邏輯像素
      rCanvas.style.width = `${radarSize}px`;
      rCanvas.style.height = `${radarSize}px`;
      bgCacheRef.current.canvas = null;
    }

    const getOrCreateBgCache = (isLosingGrip: boolean): OffscreenCanvas | null => {
      const dpr = window.devicePixelRatio || 1;
      const scaledRadius = radius * dpr;
      const cache = bgCacheRef.current;
      if (cache.canvas && cache.isLosingGrip === isLosingGrip) {
        return cache.canvas;
      }
      try {
        const offscreen = new OffscreenCanvas(Math.floor(scaledRadius * 2), Math.floor(scaledRadius * 2));
        const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
        if (!ctx) return null;

        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        ctx.beginPath();
        ctx.arc(scaledRadius, scaledRadius, scaledRadius - 1 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = isLosingGrip ? '#ff003c' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1 * dpr;
        ctx.moveTo(0, scaledRadius); ctx.lineTo(scaledRadius * 2, scaledRadius);
        ctx.moveTo(scaledRadius, 0); ctx.lineTo(scaledRadius, scaledRadius * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.arc(scaledRadius, scaledRadius, scaledRadius / displayLimit, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,0,0,0.5)';
        ctx.stroke();
        ctx.setLineDash([]);

        cache.canvas = offscreen;
        cache.isLosingGrip = isLosingGrip;
        return offscreen;
      } catch {
        return null;
      }
    };

    if (rCanvas) {
      const ctx = rCanvas.getContext('2d');
      if (ctx) {
        const bg = getOrCreateBgCache(false);
        if (bg) ctx.drawImage(bg, 0, 0);
      }
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

      if (angRef.current) {
        angRef.current.innerText = cAngle.toFixed(2);
        angRef.current.style.color = Math.abs(cAngle) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }
      if (ratioRef.current) {
        ratioRef.current.innerText = cRatio.toFixed(2);
        ratioRef.current.style.color = Math.abs(cRatio) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }

      // 1. Radar Canvas 繪製 (保持原邏輯)
      if (rCanvas) {
        const ctx = rCanvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const isLosingGrip = Math.abs(cRatio) > 1.0 || Math.abs(cAngle) > 1.0;

          ctx.clearRect(0, 0, rCanvas.width, rCanvas.height);
          const bg = getOrCreateBgCache(isLosingGrip);
          if (bg) {
            ctx.drawImage(bg, 0, 0);
          }
          let startIdx = hist.current.length - 1;
          while (startIdx >= 0 && now - hist.current[startIdx].time <= 3000) {
            startIdx--;
          }
          const firstValidIdx = startIdx + 1;
          const histLen = hist.current.length;

          if (firstValidIdx < histLen) {
            ctx.beginPath();
            const isLightTheme = document.documentElement.getAttribute('data-bs-theme') === 'light';
            ctx.strokeStyle = isLightTheme ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 2 * dpr;
            ctx.lineJoin = 'round';
            for (let i = firstValidIdx; i < histLen; i++) {
              const p = hist.current[i];
              let dx = (p.angle / displayLimit) * radius * dpr;
              let dy = (p.ratio / displayLimit) * radius * dpr;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const maxScaledR = radius * dpr;
              if (dist > maxScaledR && dist > 0) {
                dx = (dx / dist) * maxScaledR;
                dy = (dy / dist) * maxScaledR;
              }
              const cx = maxScaledR + dx;
              const cy = maxScaledR + dy;
              if (i === firstValidIdx) ctx.moveTo(cx, cy);
              else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
          }

          let dx = (cAngle / displayLimit) * radius * dpr;
          let dy = (cRatio / displayLimit) * radius * dpr;
          const tDist = Math.sqrt(dx * dx + dy * dy);
          const maxTR = (radius - 4) * dpr;
          if (tDist > maxTR && tDist > 0) {
            dx = (dx / tDist) * maxTR;
            dy = (dy / tDist) * maxTR;
          }
          const { primary: primaryHex } = themeVars.current;
          const dotColor = isLosingGrip ? '#ff003c' : (primaryHex.startsWith('#') ? primaryHex : '#00f0ff');
          const dotGlowColor = isLosingGrip ? 'rgba(255, 0, 60, 0.35)' : (primaryHex.startsWith('#') ? `${primaryHex}59` : 'rgba(0, 240, 255, 0.35)');
          const dotCenterX = radius * dpr + dx;
          const dotCenterY = radius * dpr + dy;

          ctx.beginPath();
          ctx.arc(dotCenterX, dotCenterY, 7 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = dotGlowColor;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(dotCenterX, dotCenterY, 4 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        }
      }

      // 2. Temp Canvas 高畫質解析度修復修正 (修正高 DPI 模糊問題)
      const tCanvas = tempCanvasRef.current;
      if (tCanvas) {
        const ctx = tCanvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const tw = tempSizeRef.current.w;
          const th = tempSizeRef.current.h;

          // ⭐ 關鍵修復：將 Canvas 實體像素（Buffer）擴展為 DPR 倍數
          const pixelW = Math.floor(tw * dpr);
          const pixelH = Math.floor(th * dpr);

          if (tCanvas.width !== pixelW || tCanvas.height !== pixelH) {
            tCanvas.width = pixelW;
            tCanvas.height = pixelH;
            tCanvas.style.width = `${tw}px`;
            tCanvas.style.height = `${th}px`;
          }

          // ⭐ 重置並放大 Context 座標軸，後續所有繪製邏輯直接依照原邏輯(tw, th)即可，不必手動乘 dpr
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, tw, th);

          const tempMinScale = 100;
          const tempMaxScale = 260;
          const tempRange = tempMaxScale - tempMinScale;

          const targetBarW = 3;
          const numBins = Math.max(15, Math.floor(tw / targetBarW));
          const tempPerBin = tempRange / numBins;
          const bins = new Array(numBins).fill(0);
          let maxBinCount = 1;

          const hLen = hist.current.length;
          for (let i = 0; i < hLen; i++) {
            const p = hist.current[i];
            if (Math.abs(p.speed) < 0.5) continue;
            let normT = Math.max(0, Math.min(1, (p.temp - tempMinScale) / tempRange));
            let binIdx = Math.min(numBins - 1, Math.floor(normT * numBins));
            bins[binIdx]++;
            if (bins[binIdx] > maxBinCount) maxBinCount = bins[binIdx];
          }

          const coldX = Math.max(0, Math.min(tw, ((167 - tempMinScale) / tempRange) * tw));
          const hotX = Math.max(0, Math.min(tw, ((221 - tempMinScale) / tempRange) * tw));
          const lineY = th - 1;

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#0088ff';
          ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(coldX, lineY); ctx.stroke();
          ctx.strokeStyle = '#00ff00';
          ctx.beginPath(); ctx.moveTo(coldX, lineY); ctx.lineTo(hotX, lineY); ctx.stroke();
          ctx.strokeStyle = '#ff0000';
          ctx.beginPath(); ctx.moveTo(hotX, lineY); ctx.lineTo(tw, lineY); ctx.stroke();

          const barW = tw / numBins;
          for (let i = 0; i < numBins; i++) {
            let h = (bins[i] / maxBinCount) * (th - 6);
            if (h < 2) h = 2;

            const binTempMid = tempMinScale + (i + 0.5) * tempPerBin;
            ctx.fillStyle = getTempColor(binTempMid);
            const drawW = barW > 1.5 ? barW - 0.5 : barW;
            ctx.fillRect(i * barW, th - 2 - h, drawW, h);
          }

          if (cTemp > 0) {
            const currentT = Math.max(tempMinScale, Math.min(tempMaxScale, cTemp));
            const lineX = ((currentT - tempMinScale) / tempRange) * tw;
            ctx.beginPath();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.moveTo(lineX, 0);
            ctx.lineTo(lineX, th);
            ctx.stroke();

            if (tempLabelRef.current) {
              const pct = (lineX / tw) * 100;
              tempLabelRef.current.innerText = `${Math.round(convertTemp(cTemp).value)}`;
              tempLabelRef.current.style.left = `${pct}%`;
              tempLabelRef.current.style.transform = pct > 68
                ? 'translateX(calc(-100% - 3px))'
                : 'translateX(3px)';
            }
          }

          // 還原 context 的 scale 狀態
          ctx.restore();
        }
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      themeObserver.disconnect();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [tireIdx, convertTemp, radarSize]);

  return (
    <div ref={containerRef} className={`d-flex gap-2 align-items-stretch p-2 rounded-3 border h-100 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`} style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important', minHeight: 0 }}>
      {/* 雷達圖區 */}
      <div className="d-flex flex-column align-items-center justify-content-center flex-shrink-0">
        <div className="fw-bold text-body mb-1 fs-8">{title}</div>
        <div className="position-relative" style={{ width: `${radarSize}px`, height: `${radarSize}px` }}>
          <canvas ref={radarCanvasRef} className="position-absolute top-0 start-0" />
        </div>
      </div>
      {/* 右側資訊區 */}
      <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0, minHeight: 0, gap: '6px' }}>
        <div className="d-flex flex-row gap-3 align-items-end flex-shrink-0">
          <div className="d-flex flex-column align-items-start">
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bs-secondary-color, rgba(108,117,125,0.85))', fontWeight: 600 }}>ANG</span>
            <span className="fw-bold font-monospace" ref={angRef} style={{ fontSize: '1.5rem', lineHeight: 1.1 }}>0.00</span>
          </div>
          <div style={{ width: '1px', height: '28px', background: 'rgba(128,128,128,0.2)', flexShrink: 0 }} />
          <div className="d-flex flex-column align-items-start">
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bs-secondary-color, rgba(108,117,125,0.85))', fontWeight: 600 }}>RAT</span>
            <span className="fw-bold font-monospace" ref={ratioRef} style={{ fontSize: '1.5rem', lineHeight: 1.1 }}>0.00</span>
          </div>
        </div>
        <div className="flex-grow-1 position-relative" style={{ minHeight: 0 }}>
          <canvas ref={tempCanvasRef} className="position-absolute top-0 start-0" style={{ display: 'block' }} />
          <span
            ref={tempLabelRef}
            style={{
              position: 'absolute',
              top: '2px',
              left: '50%',
              transform: 'translateX(3px)',
              fontSize: '1.20rem',
              fontFamily: "'Courier New', monospace",
              fontWeight: 700,
              color: '#fff',
              background: 'rgba(0,0,0,0.55)',
              padding: '0 2px',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >0</span>
        </div>
      </div>
    </div>
  );
});

export default TireRadar;