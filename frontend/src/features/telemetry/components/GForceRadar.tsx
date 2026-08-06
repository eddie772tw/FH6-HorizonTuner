import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: GForceRadar ---
const GForceRadar: React.FC<{ size?: number }> = React.memo(({ size: propSize }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const hist = useRef<{lat: number, lon: number, time: number}[]>([]);
  const lastTimeRef = useRef(performance.now());
  // 策略 B：Marker 用 Canvas 繪製，移除 setMarkers useState 及 setInterval 觸發的 React re-render
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<number>(propSize || 170);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  // 策略 A：快取主題色值
  const primaryColorRef = useRef('#00f0ff');
  const { t } = useSettings();

  // ResizeObserver：尺寸改變時只更新 sizeRef，不觸發 React state
  useEffect(() => {
    const container = containerRef.current;
    if (container && !propSize) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            const avail = Math.min(width, height - 40);
            sizeRef.current = Math.max(140, Math.min(230, avail));
            // 同步調整兩個 canvas 的 CSS 尺寸
            if (markerCanvasRef.current) {
              markerCanvasRef.current.style.width = `${sizeRef.current}px`;
              markerCanvasRef.current.style.height = `${sizeRef.current}px`;
              markerCanvasRef.current.width = Math.floor(sizeRef.current * (window.devicePixelRatio || 1));
              markerCanvasRef.current.height = Math.floor(sizeRef.current * (window.devicePixelRatio || 1));
            }
          }
        }
      });
      resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    }
  }, [propSize]);

  useEffect(() => {
    // 策略 A：快取 --primary 色值，主題切換時重新讀取
    const updatePrimaryColor = () => {
      const style = getComputedStyle(document.documentElement);
      primaryColorRef.current = style.getPropertyValue('--primary').trim() || '#00f0ff';
    };
    updatePrimaryColor();
    const themeObserver = new MutationObserver(updatePrimaryColor);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

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

      const lat = -(data.AccelerationX || 0) / 9.81;
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

      const size = sizeRef.current;
      const radius = size / 2;
      const scaleFactor = radius * 0.5;

      // 更新即時 G 力指示點（直接操作 DOM，無 React re-render）
      if (dotRef.current) {
        let dx = lat * scaleFactor;
        let dy = lon * scaleFactor;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = radius - 7;
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

    // 策略 B：Marker 用 Canvas 繪製，以 rAF 5Hz 降頻更新（約每 200ms）
    let lastMarkerTime = 0;
    let rafId: number;

    const drawMarkers = (now: number) => {
      rafId = requestAnimationFrame(drawMarkers);

      if (now - lastMarkerTime < 200) return; // ~5Hz
      lastMarkerTime = now;

      const mCanvas = markerCanvasRef.current;
      if (!mCanvas || mCanvas.width === 0) return;

      const ctx = mCanvas.getContext('2d');
      if (!ctx) return;

      const size = sizeRef.current;
      const dpr = window.devicePixelRatio || 1;
      const radius = size / 2;
      const scaleFactor = radius * 0.5;

      ctx.clearRect(0, 0, mCanvas.width, mCanvas.height);

      const histNow = performance.now();
      let maxLatL = { lat: 0, lon: 0 }, maxLatR = { lat: 0, lon: 0 };
      let maxLonB = { lat: 0, lon: 0 }, maxLonA = { lat: 0, lon: 0 };
      let maxL_B = { lat: 0, lon: 0 }, maxL_A = { lat: 0, lon: 0 };
      let maxR_B = { lat: 0, lon: 0 }, maxR_A = { lat: 0, lon: 0 };
      let foundAny = false;

      const len = hist.current.length;
      for (let i = 0; i < len; i++) {
        const p = hist.current[i];
        if (histNow - p.time > 30000) continue;
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

      if (!foundAny) return;

      const markers = [maxLatL, maxLatR, maxLonB, maxLonA, maxL_B, maxL_A, maxR_B, maxR_A];
      const maxMR = (radius - 3);

      ctx.fillStyle = 'rgba(150, 150, 150, 0.7)';
      for (const p of markers) {
        let mx = p.lat * scaleFactor;
        let my = p.lon * scaleFactor;
        const mDist = Math.sqrt(mx * mx + my * my);
        if (mDist > maxMR && mDist > 0) {
          mx = (mx / mDist) * maxMR;
          my = (my / mDist) * maxMR;
        }
        const cx = (radius + mx) * dpr;
        const cy = (radius + my) * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    rafId = requestAnimationFrame(drawMarkers);

    return () => {
      telemetryEmitter.removeEventListener('update', handleDraw);
      themeObserver.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  const size = propSize || 170; // 初始 render 用的尺寸（之後由 sizeRef 驅動）

  return (
    <div ref={containerRef} className="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100 w-100 p-1">
      <div className="position-relative rounded-circle border d-flex justify-content-center align-items-center shadow-inner" style={{ width: `${size}px`, height: `${size}px`, background: 'var(--surface-2)', borderColor: 'var(--glass-border) !important' }}>
        <div className="position-absolute rounded-circle" style={{ width: `${size / 2}px`, height: `${size / 2}px`, border: '1px dashed var(--divider)' }} />
        <div className="position-absolute w-100" style={{ height: '1px', background: 'var(--divider)' }} />
        <div className="position-absolute h-100" style={{ width: '1px', background: 'var(--divider)' }} />
        <span className="position-absolute top-0 m-1 font-monospace text-body-secondary fw-semibold fs-8">{t("BRAKE")}</span>
        <span className="position-absolute bottom-0 m-1 font-monospace text-body-secondary fw-semibold fs-8">{t("ACCEL")}</span>
        <span className="position-absolute start-0 ms-2 font-monospace text-body-secondary fw-semibold fs-8">{t("L")}</span>
        <span className="position-absolute end-0 me-2 font-monospace text-body-secondary fw-semibold fs-8">{t("R")}</span>

        {/* 策略 B：Marker 改用 Canvas，徹底消除 React state re-render */}
        <canvas
          ref={markerCanvasRef}
          className="position-absolute top-0 start-0 w-100 h-100 pointer-events-none"
          style={{ borderRadius: '50%' }}
        />

        <div ref={dotRef} className="position-absolute rounded-circle" style={{
          width: '14px', height: '14px', backgroundColor: 'var(--primary)',
          boxShadow: '0 0 12px var(--primary)'
        }} />
      </div>
      <div className="d-flex gap-4 mt-2">
        <div className="text-center">
          <span ref={latRef} className="fw-bold font-monospace text-primary fs-6">0.00</span>
          <span className="text-body-secondary fs-8 ms-1">{t("Lat G")}</span>
        </div>
        <div className="text-center">
          <span ref={lonRef} className="fw-bold font-monospace text-secondary fs-6">0.00</span>
          <span className="text-body-secondary fs-8 ms-1">{t("Lon G")}</span>
        </div>
      </div>
    </div>
  );
});

export default GForceRadar;
