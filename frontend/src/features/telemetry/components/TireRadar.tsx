import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

const getTempColor = (temp: number) => {
  if (temp < 167) return '#0088ff';
  if (temp > 221) return '#ff0000';
  return '#00ff00';
};

// --- COMPONENT: TireRadar ---
interface TireRadarProps {
  title: string;
  isLeft: boolean;
  tireIdx: number;
  renderCharts?: boolean;
}

const TireRadar: React.FC<TireRadarProps> = React.memo(({ title, isLeft, tireIdx, renderCharts = true }) => {
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
  const tempSizeRef = useRef({ w: 90, h: 28 });
  const { convertTemp } = useSettings();

  useEffect(() => {
    if (!renderCharts) {
      const rCanvas = radarCanvasRef.current;
      if (rCanvas) {
        const ctx = rCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, rCanvas.width, rCanvas.height);
      }
      hist.current = [];
    }
  }, [renderCharts]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncCanvasBuffers = () => {
      const dpr = window.devicePixelRatio || 1;

      // 1. Radar Canvas Buffer Sync (保持正圓, 最大適應 38% 欄位)
      const rCanvas = radarCanvasRef.current;
      if (rCanvas && rCanvas.parentElement) {
        const parent = rCanvas.parentElement;
        const rw = parent.clientWidth;
        const rh = parent.clientHeight;
        const rSize = Math.max(30, Math.min(rw, rh));
        const pixelR = Math.floor(rSize * dpr);
        if (rCanvas.width !== pixelR || rCanvas.height !== pixelR) {
          rCanvas.width = pixelR;
          rCanvas.height = pixelR;
          rCanvas.style.width = `${rSize}px`;
          rCanvas.style.height = `${rSize}px`;
          bgCacheRef.current.canvas = null;
        }
      }

      // 2. Temp Canvas Buffer Sync (完全依據右側欄位 ClientWidth 自適應 100% 寬度)
      const tCanvas = tempCanvasRef.current;
      if (tCanvas && tCanvas.parentElement) {
        const parent = tCanvas.parentElement;
        const tw = Math.max(35, parent.clientWidth);
        const th = Math.max(16, parent.clientHeight);
        tempSizeRef.current = { w: tw, h: th };
        const pixelW = Math.floor(tw * dpr);
        const pixelH = Math.floor(th * dpr);
        if (tCanvas.width !== pixelW || tCanvas.height !== pixelH) {
          tCanvas.width = pixelW;
          tCanvas.height = pixelH;
          tCanvas.style.width = `${tw}px`;
          tCanvas.style.height = `${th}px`;
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      syncCanvasBuffers();
    });
    resizeObserver.observe(container);
    syncCanvasBuffers();

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
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

    const getOrCreateBgCache = (scaledRadius: number, isLosingGrip: boolean): OffscreenCanvas | null => {
      const dpr = window.devicePixelRatio || 1;
      const cache = bgCacheRef.current;
      const targetSize = Math.floor(scaledRadius * 2);
      if (cache.canvas && cache.canvas.width === targetSize && cache.isLosingGrip === isLosingGrip) {
        return cache.canvas;
      }
      try {
        const offscreen = new OffscreenCanvas(targetSize, targetSize);
        const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
        if (!ctx) return null;

        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        ctx.beginPath();
        ctx.arc(scaledRadius, scaledRadius, Math.max(1, scaledRadius - 1 * dpr), 0, Math.PI * 2);
        ctx.strokeStyle = isLosingGrip ? '#ff003c' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1 * dpr;
        ctx.moveTo(0, scaledRadius); ctx.lineTo(targetSize, scaledRadius);
        ctx.moveTo(scaledRadius, 0); ctx.lineTo(scaledRadius, targetSize);
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

      if (renderCharts) {
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
      } else {
        hist.current = [];
      }

      if (angRef.current) {
        angRef.current.innerText = cAngle.toFixed(2);
        angRef.current.style.color = Math.abs(cAngle) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }
      if (ratioRef.current) {
        ratioRef.current.innerText = cRatio.toFixed(2);
        ratioRef.current.style.color = Math.abs(cRatio) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }

      // 1. Radar Canvas 繪製 (純動態對齊 Buffer 尺寸)
      const rCanvas = radarCanvasRef.current;
      if (rCanvas && rCanvas.width > 0) {
        const ctx = rCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, rCanvas.width, rCanvas.height);
          const dpr = window.devicePixelRatio || 1;
          const radius = (rCanvas.width / dpr) / 2;
          const isLosingGrip = Math.abs(cRatio) > 1.0 || Math.abs(cAngle) > 1.0;

          // 保留靜態抓地力雷達圖背景
          const bg = getOrCreateBgCache(radius * dpr, isLosingGrip);
          if (bg) {
            ctx.drawImage(bg, 0, 0);
          }

          if (renderCharts) {
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
                const cx = radius * dpr + dx;
                const cy = radius * dpr + dy;
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
            ctx.arc(dotCenterX, dotCenterY, 6 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = dotGlowColor;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(dotCenterX, dotCenterY, 3.5 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();
          }
        }
      }

      // 2. Temp Canvas 高畫質 100% 自適應繪製
      const tCanvas = tempCanvasRef.current;
      if (tCanvas) {
        const ctx = tCanvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const tw = tempSizeRef.current.w;
          const th = tempSizeRef.current.h;

          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, tw, th);

          const tempMinScale = 100;
          const tempMaxScale = 260;
          const tempRange = tempMaxScale - tempMinScale;

          // 保留最底部的靜態三色區域基準線
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

          // 僅在 renderCharts === true 時繪製彩色分佈直方圖柱
          if (renderCharts) {
            const targetBarW = 2.5;
            const numBins = Math.max(10, Math.floor(tw / targetBarW));
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

            const barW = tw / numBins;
            for (let i = 0; i < numBins; i++) {
              let h = (bins[i] / maxBinCount) * (th - 6);
              if (h < 2) h = 2;

              const binTempMid = tempMinScale + (i + 0.5) * tempPerBin;
              ctx.fillStyle = getTempColor(binTempMid);
              const drawW = barW > 1.2 ? barW - 0.3 : barW;
              ctx.fillRect(i * barW, th - 2 - h, drawW, h);
            }
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
              tempLabelRef.current.style.transform = pct > 50
                ? 'translateX(calc(-100% - 2px))'
                : 'translateX(2px)';
            }
          }

          ctx.restore();
        }
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      themeObserver.disconnect();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [tireIdx, convertTemp, renderCharts]);

  return (
    <div
      ref={containerRef}
      className={`d-flex gap-2 align-items-center p-2 rounded-3 border h-100 overflow-hidden ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}
      style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important', minHeight: 0 }}
    >
      {/* 雷達圖區 (固定佔據 ~38% 寬度) */}
      <div className="d-flex flex-column align-items-center justify-content-center h-100 overflow-hidden" style={{ flex: '0 0 38%', maxWidth: '42%', minWidth: '40px' }}>
        <div className="fw-bold text-body mb-1 fs-8 flex-shrink-0 text-truncate">{title}</div>
        <div className="w-100 flex-grow-1 position-relative d-flex align-items-center justify-content-center overflow-hidden" style={{ minHeight: 0 }}>
          <canvas ref={radarCanvasRef} className="position-absolute" />
        </div>
      </div>

      {/* 右側資訊與胎溫分佈區 (占據剩餘 ~62% 寬度, 垂直自適應充滿 100% 高度) */}
      <div className="d-flex flex-column h-100 overflow-hidden" style={{ flex: '1 1 0%', minWidth: 0, gap: '4px' }}>
        {/* ANG & RAT 數據大字體標頭 */}
        <div className="d-flex flex-row align-items-center gap-3 flex-shrink-0 pt-1">
          <div className="d-flex flex-column align-items-start">
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bs-secondary-color, rgba(108,117,125,0.85))', fontWeight: 600 }}>ANG</span>
            <span className="fw-bold font-monospace text-body" ref={angRef} style={{ fontSize: '1.45rem', lineHeight: 1.0 }}>0.00</span>
          </div>
          <div style={{ width: '1px', height: '26px', background: 'rgba(128,128,128,0.2)', flexShrink: 0 }} />
          <div className="d-flex flex-column align-items-start">
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bs-secondary-color, rgba(108,117,125,0.85))', fontWeight: 600 }}>RAT</span>
            <span className="fw-bold font-monospace text-body" ref={ratioRef} style={{ fontSize: '1.45rem', lineHeight: 1.0 }}>0.00</span>
          </div>
        </div>

        {/* 胎溫分佈直方圖區 (垂直高度自適應充滿剩餘空間，消除中央空白) */}
        <div className="flex-grow-1 position-relative w-100 overflow-hidden" style={{ minHeight: '24px' }}>
          <canvas ref={tempCanvasRef} className="position-absolute top-0 start-0 w-100 h-100" style={{ display: 'block' }} />
          <span
            ref={tempLabelRef}
            style={{
              position: 'absolute',
              top: '1px',
              left: '50%',
              transform: 'translateX(2px)',
              fontSize: '0.95rem',
              fontFamily: "'Courier New', monospace",
              fontWeight: 700,
              color: '#fff',
              background: 'rgba(0,0,0,0.65)',
              borderRadius: '2px',
              padding: '0 3px',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              userSelect: 'none',
              zIndex: 2,
            }}
          >0</span>
        </div>
      </div>
    </div>
  );
});

export default TireRadar;