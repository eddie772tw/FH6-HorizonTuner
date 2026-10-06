import { useTelemetryCardPaint, createTelemetryCanvasSurface } from './TelemetryCardVisibility';
import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { readCanvasTheme, observeCanvasTheme, drawTraceGrid, TRACE_PAD_TOP, TRACE_PAD_BOTTOM } from '../../../utils/canvasTheme';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: PedalTraceCanvas ---
interface PedalTraceCanvasProps {
  height?: string | number;
  enabled?: boolean;
}

const PedalTraceCanvas: React.FC<PedalTraceCanvasProps> = React.memo(({ height = '140px', enabled = true }) => {
  const paint = useTelemetryCardPaint();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{ throttle: number; brake: number; time: number }[]>([]);
  const offsetRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const { t } = useSettings();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !enabled) {
      if (paint.canPaint()) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      hist.current = [];
      offsetRef.current = 0;
    }
  }, [enabled, paint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const surface = createTelemetryCanvasSurface(canvas);
    let theme = readCanvasTheme();
    const stopThemeObserver = observeCanvasTheme(() => { theme = readCanvasTheme(); draw(); });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        surface.resize(width, height);
        draw();
      }
    });

    resizeObserver.observe(container);

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;

      if (!enabled) {
        draw();
        hist.current = [];
        offsetRef.current = 0;
        return;
      }

      if ((prevCar.current !== null && prevCar.current !== liveData.CarOrdinal) ||
          (prevRace.current !== null && prevRace.current !== liveData.IsRaceOn)) {
        hist.current = [];
        offsetRef.current = 0;
      }
      prevCar.current = liveData.CarOrdinal;
      prevRace.current = liveData.IsRaceOn;

      if (liveData.IsRaceOn !== 1) return;

      const now = performance.now();
      lastTimeRef.current = now;

      const throttle = Math.max(0, Math.min(1, (liveData.AccelInput || 0) / 255));
      const brake = Math.max(0, Math.min(1, (liveData.BrakeInput || 0) / 255));

      // [PERF] Use O(1) circular buffer instead of O(N) Array.shift() in 60Hz loop
      if (hist.current.length < 300) {
        hist.current.push({ throttle, brake, time: now });
      } else {
        const idx = offsetRef.current;
        const oldP = hist.current[idx];
        if (oldP) { oldP.throttle = throttle; oldP.brake = brake; oldP.time = now; }
        offsetRef.current = (idx + 1) % 300;
      }

      draw();
    };

    const draw = () => {
      if (!paint.canPaint() || !surface.sync()) return;
      if (!enabled) {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      if (canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width, h = canvas.height;
          const dpr = window.devicePixelRatio || 1;
          ctx.clearRect(0, 0, w, h);

          const padTop = TRACE_PAD_TOP * dpr;
          const padBottom = TRACE_PAD_BOTTOM * dpr;
          const plotH = Math.max(10, h - padTop - padBottom);

          drawTraceGrid(ctx, w, h, dpr, theme);

          const len = hist.current.length;
          const stepX = (w - 12 * dpr) / 299;
          const rightEdgeX = w - 6 * dpr;

          // Throttle Trace (Green #00ff66) - Anchored to right edge, scrolling left smoothly
          ctx.beginPath();
          for (let k = 0; k < len; k++) {
            const idx = (offsetRef.current + k) % len;
            const px = rightEdgeX - (len - 1 - k) * stepX;
            const py = h - padBottom - (hist.current[idx].throttle * plotH);
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 2.2 * dpr;
          ctx.strokeStyle = theme.throttle;
          ctx.shadowColor = 'rgba(0, 255, 102, 0.5)';
          ctx.shadowBlur = theme.glowStrength * 4 * dpr;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Brake Trace (Red #ff0055) - Anchored to right edge, scrolling left smoothly
          ctx.beginPath();
          for (let k = 0; k < len; k++) {
            const idx = (offsetRef.current + k) % len;
            const px = rightEdgeX - (len - 1 - k) * stepX;
            const py = h - padBottom - (hist.current[idx].brake * plotH);
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 2.2 * dpr;
          ctx.strokeStyle = theme.brake;
          ctx.shadowColor = 'rgba(255, 0, 85, 0.5)';
          ctx.shadowBlur = theme.glowStrength * 4 * dpr;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    };

    const stopPaint = paint.subscribe(draw);
    draw();
    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      stopPaint();
      resizeObserver.disconnect();
      stopThemeObserver();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [enabled, paint]);

  return (
    <div
      ref={containerRef}
      className="telemetry-trace-panel position-relative w-100 rounded-3 border overflow-hidden flex-grow-1"
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: typeof height === 'number' ? `${height}px` : undefined,
        background: 'var(--surface-1)',
        borderColor: 'var(--glass-border) !important'
      }}
    >
      <canvas ref={canvasRef} className="w-100 h-100 d-block" />
      <div className="telemetry-trace-legend position-absolute top-0 start-0 end-0 px-2 py-1 d-flex justify-content-between align-items-center pointer-events-none" style={{ background: 'linear-gradient(to bottom, var(--surface-1), transparent)' }}>
        <div className="d-flex align-items-center gap-3 fs-8">
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: 'var(--instrument-throttle, #00ff66)' }} />
            <span className="font-monospace fw-bold text-success">{t("THROTTLE")}</span>
          </div>
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: 'var(--instrument-brake, #ff0055)' }} />
            <span className="font-monospace fw-bold text-danger">{t("BRAKE")}</span>
          </div>
        </div>
        <span className="font-monospace text-body-secondary fs-8 fw-semibold">{t("INPUT WAVEFORM")}</span>
      </div>
    </div>
  );
});

export default PedalTraceCanvas;
