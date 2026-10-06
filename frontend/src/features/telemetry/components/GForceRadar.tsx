import { useTelemetryCardPaint, createTelemetryCanvasSurface } from './TelemetryCardVisibility';
import { setTelemetryText } from '../../../utils/telemetryDisplay';
import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { readCanvasTheme, observeCanvasTheme } from '../../../utils/canvasTheme';
import { useSettings } from '../../../context/SettingsContext';
import { calculateGPointOffset, calculateRadarDiameter } from '../../../utils/gforceRadarMath';

// --- COMPONENT: GForceRadar ---
interface GForceRadarProps {
  size?: number;
  renderRadar?: boolean;
}

const GForceRadar: React.FC<GForceRadarProps> = React.memo(({ size: propSize, renderRadar = true }) => {
  const paint = useTelemetryCardPaint();
  const latestSample = useRef({ lat: 0, lon: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const circleContainerRef = useRef<HTMLDivElement>(null);
  const innerCircleRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const hist = useRef<{ lat: number; lon: number; time: number }[]>([]);
  const offsetRef = useRef(0);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<number>(propSize || 170);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const { t } = useSettings();

  useEffect(() => {
    const canvas = markerCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const surface = createTelemetryCanvasSurface(canvas);
    if (propSize) sizeRef.current = propSize;
    surface.resize(sizeRef.current, sizeRef.current);
    let paintedSize = 0;
    if (!renderRadar) {
      hist.current = [];
      offsetRef.current = 0;
    }

    const paintCurrent = () => {
      if (!paint.canPaint()) return;
      const { lat, lon } = latestSample.current;
      setTelemetryText(latRef.current, Math.abs(lat).toFixed(2));
      setTelemetryText(lonRef.current, Math.abs(lon).toFixed(2));
      const size = sizeRef.current;
      if (paintedSize !== size) {
        paintedSize = size;
        if (circleContainerRef.current) {
          circleContainerRef.current.style.width = `${size}px`;
          circleContainerRef.current.style.height = `${size}px`;
        }
        if (innerCircleRef.current) {
          innerCircleRef.current.style.width = `${size / 2}px`;
          innerCircleRef.current.style.height = `${size / 2}px`;
        }
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
      const offset = calculateGPointOffset(renderRadar ? lat : 0, renderRadar ? lon : 0, size / 2, 7);
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(-50%, -50%) translate(${offset.dx}px, ${offset.dy}px)`;
      }
    };

    let theme = readCanvasTheme();
    const stopThemeObserver = observeCanvasTheme(() => { theme = readCanvasTheme(); drawMarkers(); });

    const handleDraw = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;

      if (
        (prevCar.current !== null && prevCar.current !== data.CarOrdinal) ||
        (prevRace.current !== null && prevRace.current !== data.IsRaceOn)
      ) {
        hist.current = [];
        offsetRef.current = 0;
      }
      prevCar.current = data.CarOrdinal;
      prevRace.current = data.IsRaceOn;

      if (data.IsRaceOn !== 1) return;

      const now = performance.now();

      const lat = -(data.AccelerationX || 0) / 9.81;
      const lon = (data.AccelerationZ || 0) / 9.81;

      latestSample.current.lat = lat;
      latestSample.current.lon = lon;

      if (!renderRadar) {
        hist.current = [];
        offsetRef.current = 0;
        paintCurrent();
        return;
      }

      // [PERF] Use O(1) circular buffer instead of O(N) Array.shift() in the render loop.
      if (hist.current.length < 900) {
        hist.current.push({ lat, lon, time: now });
      } else {
        const idx = offsetRef.current;
        const old = hist.current[idx];
        if (old) {
          old.lat = lat;
          old.lon = lon;
          old.time = now;
        }
        offsetRef.current = (idx + 1) % 900;
      }

      paintCurrent();
    };

    telemetryEmitter.addEventListener('update', handleDraw);

    // Marker 用 Canvas 繪製，以 rAF ~5Hz 降頻更新（約每 200ms）
    let lastMarkerTime = 0;
    let rafId: number;

    const drawMarkers = () => {
      if (!paint.canPaint() || !surface.sync()) return;
      const mCanvas = canvas;

      const ctx = mCanvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, mCanvas.width, mCanvas.height);
      if (!renderRadar) return;

      const size = sizeRef.current;
      const dpr = window.devicePixelRatio || 1;
      const radius = size / 2;

      const histNow = performance.now();
      let maxLatL = { lat: 0, lon: 0 },
        maxLatR = { lat: 0, lon: 0 };
      let maxLonB = { lat: 0, lon: 0 },
        maxLonA = { lat: 0, lon: 0 };
      let maxL_B = { lat: 0, lon: 0 },
        maxL_A = { lat: 0, lon: 0 };
      let maxR_B = { lat: 0, lon: 0 },
        maxR_A = { lat: 0, lon: 0 };
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
        if (p.lat < 0 && p.lon < 0 && p.lat + p.lon < maxL_B.lat + maxL_B.lon) maxL_B = p;
        if (p.lat < 0 && p.lon > 0 && p.lat - p.lon < maxL_A.lat - maxL_A.lon) maxL_A = p;
        if (p.lat > 0 && p.lon < 0 && p.lat - p.lon > maxR_B.lat - maxR_B.lon) maxR_B = p;
        if (p.lat > 0 && p.lon > 0 && p.lat + p.lon > maxR_A.lat + maxR_A.lon) maxR_A = p;
      }

      if (!foundAny) return;

      const markers = [maxLatL, maxLatR, maxLonB, maxLonA, maxL_B, maxL_A, maxR_B, maxR_A];

      ctx.fillStyle = theme.marker;
      for (const p of markers) {
        const offset = calculateGPointOffset(p.lat, p.lon, radius, 3);
        const cx = (radius + offset.dx) * dpr;
        const cy = (radius + offset.dy) * dpr;
        ctx.beginPath();
        if (theme.linear) ctx.rect(cx - 2.5 * dpr, cy - 2.5 * dpr, 5 * dpr, 5 * dpr);
        else ctx.arc(cx, cy, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tickMarkers = (now: number) => {
      rafId = requestAnimationFrame(tickMarkers);
      if (now - lastMarkerTime < 200) return;
      lastMarkerTime = now;
      drawMarkers();
    };
    const repaint = () => { paintCurrent(); drawMarkers(); };
    const resizeObserver = new ResizeObserver(entries => {
      if (propSize) return;
      for (const { contentRect: { width, height } } of entries) {
        if (width <= 0 || height <= 0) {
          surface.resize(0, 0);
          continue;
        }
        sizeRef.current = calculateRadarDiameter(width, height, 38, 120, 240);
        surface.resize(sizeRef.current, sizeRef.current);
        repaint();
      }
    });
    resizeObserver.observe(container);
    const stopPaint = paint.subscribe(repaint);
    repaint();
    rafId = requestAnimationFrame(tickMarkers);

    return () => {
      stopPaint();
      resizeObserver.disconnect();
      telemetryEmitter.removeEventListener('update', handleDraw);
      stopThemeObserver();
      cancelAnimationFrame(rafId);
    };
  }, [renderRadar, propSize, paint]);

  const initSize = propSize || 170;

  return (
    <div
      ref={containerRef}
      className="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100 w-100 p-1"
      style={{ minHeight: 0, overflow: 'hidden' }}
    >
      {/* 雷達外框 DOM：強制正圓高寬比 (aspectRatio 1/1 + flexShrink 0) */}
      <div
        ref={circleContainerRef}
        className="position-relative rounded-circle border d-flex justify-content-center align-items-center shadow-inner flex-shrink-0"
        style={{
          width: `${initSize}px`,
          height: `${initSize}px`,
          aspectRatio: '1 / 1',
          background: 'var(--surface-2)',
          borderColor: 'var(--glass-border) !important',
        }}
      >
        {/* 0.5G 內圈虛線框 */}
        <div
          ref={innerCircleRef}
          className="position-absolute rounded-circle"
          style={{
            width: `${initSize / 2}px`,
            height: `${initSize / 2}px`,
            aspectRatio: '1 / 1',
            border: '1px dashed var(--divider)',
          }}
        />
        {/* 十字分割線 */}
        <div className="position-absolute w-100" style={{ height: '1px', background: 'var(--divider)' }} />
        <div className="position-absolute h-100" style={{ width: '1px', background: 'var(--divider)' }} />
        {/* 方位標籤 */}
        <span className="position-absolute top-0 m-1 font-monospace text-body-secondary fw-semibold fs-8">
          {t('BRAKE')}
        </span>
        <span className="position-absolute bottom-0 m-1 font-monospace text-body-secondary fw-semibold fs-8">
          {t('ACCEL')}
        </span>
        <span className="position-absolute start-0 ms-2 font-monospace text-body-secondary fw-semibold fs-8">
          {t('L')}
        </span>
        <span className="position-absolute end-0 me-2 font-monospace text-body-secondary fw-semibold fs-8">
          {t('R')}
        </span>

        {/* 歷史極值 Marker Canvas */}
        <canvas
          ref={markerCanvasRef}
          className="position-absolute top-0 start-0 w-100 h-100 pointer-events-none"
          style={{ borderRadius: '50%' }}
        />

        {/* 即時 G 力指示點：基準居中 top 50% left 50%，以 transform translate 偏置 */}
        <div
          ref={dotRef}
          className="position-absolute rounded-circle pointer-events-none"
          style={{
            width: '14px',
            height: '14px',
            top: '50%',
            left: '50%',
            backgroundColor: 'var(--primary)',
            boxShadow: 'var(--instrument-marker-shadow, 0 0 12px var(--primary))',
            transform: 'translate(-50%, -50%) translate(0px, 0px)',
            willChange: 'transform',
          }}
        />
      </div>

      {/* 底部數據標籤 */}
      <div className="d-flex gap-4 mt-2 flex-shrink-0">
        <div className="text-center">
          <span ref={latRef} className="fw-bold font-monospace text-primary fs-6">
            0.00
          </span>
          <span className="text-body-secondary fs-8 ms-1">{t('Lat G')}</span>
        </div>
        <div className="text-center">
          <span ref={lonRef} className="fw-bold font-monospace text-secondary fs-6">
            0.00
          </span>
          <span className="text-body-secondary fs-8 ms-1">{t('Lon G')}</span>
        </div>
      </div>
    </div>
  );
});

export default GForceRadar;
