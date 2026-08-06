import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

const getTempColor = (temp: number) => {
  if (temp < 167) return '#0088ff';
  if (temp > 221) return '#ff0000';
  return '#00ff00';
};

// --- COMPONENT: TireRadar ---
const TireRadar: React.FC<{title: string, isLeft: boolean, tireIdx: number}> = React.memo(({title, isLeft, tireIdx}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{temp: number, ratio: number, angle: number, time: number, speed: number}[]>([]);
  const lastTimeRef = useRef(performance.now());
  const tempRef = useRef<HTMLSpanElement>(null);
  const angRef = useRef<HTMLSpanElement>(null);
  const ratioRef = useRef<HTMLSpanElement>(null);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  // 策略 A：快取主題色值
  const themeVars = useRef({ primary: '#00f0ff', isLight: false });
  // 策略 B：靜態背景快取（OffscreenCanvas），避免每幀重繪
  const bgCacheRef = useRef<{ canvas: OffscreenCanvas | null; isLosingGrip: boolean }>({ canvas: null, isLosingGrip: false });
  // tempCanvas 尺寸快取（避免 clientWidth/clientHeight reflow）
  const tempSizeRef = useRef({ w: 90, h: 55 });

  const [radarSize, setRadarSize] = React.useState<number>(95);
  const { convertTemp, t } = useSettings();
  const tempUnit = convertTemp(0).label;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (height > 0) {
          // Bounded radar size between 70px and 95px
          const calcSize = Math.max(70, Math.min(95, height - 32));
          setRadarSize(calcSize);
        }
        // 快取 tempCanvas 尺寸，避免之後讀取 clientWidth/clientHeight
        if (tempCanvasRef.current) {
          const tempW = Math.floor((width - calcSizeFromHeight(entry.contentRect.height)) - 16) || 90;
          tempSizeRef.current = { w: Math.max(60, tempW), h: 55 };
        }
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // 從高度計算 calcSize 的純函數（與 ResizeObserver 回調共用邏輯）
  const calcSizeFromHeight = (h: number) => Math.max(70, Math.min(95, h - 32));

  useEffect(() => {
    const radius = radarSize / 2;
    const displayLimit = 1.5;

    // 策略 A：快取主題色值
    const updateThemeVars = () => {
      const style = getComputedStyle(document.documentElement);
      themeVars.current = {
        primary: style.getPropertyValue('--primary').trim() || '#00f0ff',
        isLight: document.documentElement.getAttribute('data-bs-theme') === 'light',
      };
      // 主題改變時使背景快取失效，下一幀重繪
      bgCacheRef.current.canvas = null;
    };
    updateThemeVars();
    const themeObserver = new MutationObserver(updateThemeVars);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

    const rCanvas = radarCanvasRef.current;
    if (rCanvas) {
      const dpr = window.devicePixelRatio || 1;
      rCanvas.width = Math.floor(radarSize * dpr);
      rCanvas.height = Math.floor(radarSize * dpr);
      // 背景快取失效
      bgCacheRef.current.canvas = null;
    }

    // 策略 B：靜態背景離屏快取
    const getOrCreateBgCache = (isLosingGrip: boolean): OffscreenCanvas | null => {
      const dpr = window.devicePixelRatio || 1;
      const scaledRadius = radius * dpr;
      const cache = bgCacheRef.current;
      // 只有在 isLosingGrip 狀態改變或快取不存在時才重新繪製
      if (cache.canvas && cache.isLosingGrip === isLosingGrip) {
        return cache.canvas;
      }
      try {
        const offscreen = new OffscreenCanvas(Math.floor(scaledRadius * 2), Math.floor(scaledRadius * 2));
        const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
        if (!ctx) return null;

        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        // Radar border
        ctx.beginPath();
        ctx.arc(scaledRadius, scaledRadius, scaledRadius - 1 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = isLosingGrip ? '#ff003c' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
        // Crosshairs
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1 * dpr;
        ctx.moveTo(0, scaledRadius); ctx.lineTo(scaledRadius * 2, scaledRadius);
        ctx.moveTo(scaledRadius, 0); ctx.lineTo(scaledRadius, scaledRadius * 2);
        ctx.stroke();
        // 1.0 Threshold Circle (dashed)
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
        // OffscreenCanvas 不支援時退化
        return null;
      }
    };

    // 初始化靜態背景（非 losing grip 狀態）
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

      if (tempRef.current) tempRef.current.innerText = Math.round(convertTemp(cTemp).value).toString();
      if (angRef.current) {
        angRef.current.innerText = cAngle.toFixed(2);
        angRef.current.style.color = Math.abs(cAngle) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }
      if (ratioRef.current) {
        ratioRef.current.innerText = cRatio.toFixed(2);
        ratioRef.current.style.color = Math.abs(cRatio) > 1.0 ? 'var(--secondary)' : 'var(--text-secondary)';
      }

      if (rCanvas) {
        const ctx = rCanvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const isLosingGrip = Math.abs(cRatio) > 1.0 || Math.abs(cAngle) > 1.0;

          // 策略 B：從快取繪製靜態背景（isLosingGrip 改變才重新生成）
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
          // isLosingGrip already declared at line 196 within this ctx block
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

      const tCanvas = tempCanvasRef.current;
      if (tCanvas) {
        const ctx = tCanvas.getContext('2d');
        if (ctx) {
          // 使用快取的尺寸，避免 clientWidth/clientHeight reflow
          const tw = tempSizeRef.current.w;
          const th = tempSizeRef.current.h;
          if (tCanvas.width !== tw || tCanvas.height !== th) {
            tCanvas.width = tw;
            tCanvas.height = th;
          }
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

          // Tri-Color Baseline (Cold: Blue, Normal: Green, Hot: Red)
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
          }
        }
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      themeObserver.disconnect();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [tireIdx, convertTemp]);

  return (
    <div ref={containerRef} className={`d-flex gap-2 align-items-center p-2 rounded-3 border h-100 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`} style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
      <div className="d-flex flex-column align-items-center justify-content-center">
        <div className="fw-bold text-body mb-1 fs-8">{title}</div>
        <div className="position-relative" style={{ width: `${radarSize}px`, height: `${radarSize}px` }}>
          <canvas ref={radarCanvasRef} className="position-absolute top-0 start-0 w-100 h-100" />
        </div>
      </div>
      <div className={`d-flex flex-grow-1 justify-content-between ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
        <div className={`d-flex flex-column gap-1 justify-content-center ${isLeft ? 'align-items-end' : 'align-items-start'}`}>
          <div className={`d-flex flex-column ${isLeft ? 'align-items-end' : 'align-items-start'}`}>
            <span className="text-body-secondary text-uppercase fs-8" style={{ fontSize: '0.68rem' }}>{t("Slip Angle")}</span>
            <span className="fw-bold font-monospace text-body fs-8" ref={angRef}>0.00</span>
          </div>
          <div className={`d-flex flex-column ${isLeft ? 'align-items-end' : 'align-items-start'}`}>
            <span className="text-body-secondary text-uppercase fs-8" style={{ fontSize: '0.68rem' }}>{t("Slip Ratio")}</span>
            <span className="fw-bold font-monospace text-body fs-8" ref={ratioRef}>0.00</span>
          </div>
        </div>
        <div className={`d-flex flex-column position-relative justify-content-between ${isLeft ? 'align-items-start' : 'align-items-end'}`} style={{ width: '90px', height: `${radarSize}px` }}>
           <span className="fw-bold font-monospace text-body fs-6"><span ref={tempRef}>0</span><span className="text-body-secondary fs-8 ms-1">{tempUnit}</span></span>
           <canvas ref={tempCanvasRef} width={90} height={55} className="w-100 flex-grow-1 mt-1" />
        </div>
      </div>
    </div>
  );
});

export default TireRadar;
