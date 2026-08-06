import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

// --- COMPONENT: PedalTraceCanvas ---
interface PedalTraceCanvasProps {
  height?: string | number;
  enabled?: boolean;
}

const PedalTraceCanvas: React.FC<PedalTraceCanvasProps> = React.memo(({ height = '140px', enabled = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{ throttle: number; brake: number; time: number }[]>([]);
  const lastTimeRef = useRef(performance.now());
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const isLightRef = useRef(false);
  const { t } = useSettings();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !enabled) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hist.current = [];
    }
  }, [enabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 策略 A：快取 isLight 主題屬性
    const updateIsLight = () => {
      isLightRef.current = document.documentElement.getAttribute('data-bs-theme') === 'light';
    };
    updateIsLight();
    const themeObserver = new MutationObserver(updateIsLight);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
        }
      }
    });

    resizeObserver.observe(container);

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;

      if (!enabled) {
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        hist.current = [];
        return;
      }

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

      if (canvas && hist.current.length > 0 && canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width, h = canvas.height;
          const dpr = window.devicePixelRatio || 1;
          ctx.clearRect(0, 0, w, h);

          // Dashed Guidelines (25%, 50%, 75%)（使用快取的 isLight）
          ctx.strokeStyle = isLightRef.current ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)';
          ctx.lineWidth = 1 * dpr;
          ctx.setLineDash([4 * dpr, 4 * dpr]);
          ctx.beginPath();
          ctx.moveTo(0, h * 0.25); ctx.lineTo(w, h * 0.25);
          ctx.moveTo(0, h * 0.50); ctx.lineTo(w, h * 0.50);
          ctx.moveTo(0, h * 0.75); ctx.lineTo(w, h * 0.75);
          ctx.stroke();
          ctx.setLineDash([]);

          const len = hist.current.length;
          const stepX = (w - 12 * dpr) / 299;
          const rightEdgeX = w - 6 * dpr;

          // Throttle Trace (Green #00ff66) - Anchored to right edge, scrolling left smoothly
          ctx.beginPath();
          for (let k = 0; k < len; k++) {
            const px = rightEdgeX - (len - 1 - k) * stepX;
            const py = h - (hist.current[k].throttle * (h - 16 * dpr)) - 8 * dpr;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 2.2 * dpr;
          ctx.strokeStyle = '#00ff66';
          ctx.shadowColor = 'rgba(0, 255, 102, 0.5)';
          ctx.shadowBlur = 4 * dpr;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Brake Trace (Red #ff0055) - Anchored to right edge, scrolling left smoothly
          ctx.beginPath();
          for (let k = 0; k < len; k++) {
            const px = rightEdgeX - (len - 1 - k) * stepX;
            const py = h - (hist.current[k].brake * (h - 16 * dpr)) - 8 * dpr;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 2.2 * dpr;
          ctx.strokeStyle = '#ff0055';
          ctx.shadowColor = 'rgba(255, 0, 85, 0.5)';
          ctx.shadowBlur = 4 * dpr;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [enabled]);

  return (
    <div
      ref={containerRef}
      className="position-relative w-100 rounded-3 border overflow-hidden flex-grow-1"
      style={{
        minHeight: typeof height === 'number' ? `${height}px` : height,
        background: 'var(--surface-1)',
        borderColor: 'var(--glass-border) !important'
      }}
    >
      <canvas ref={canvasRef} className="w-100 h-100 d-block" />
      <div className="position-absolute top-0 start-0 end-0 p-2 d-flex justify-content-between align-items-center pointer-events-none" style={{ background: 'linear-gradient(to bottom, var(--surface-1), transparent)' }}>
        <div className="d-flex align-items-center gap-3 fs-8">
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: '#00ff66' }} />
            <span className="font-monospace fw-bold text-success">{t("THROTTLE")}</span>
          </div>
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: '#ff0055' }} />
            <span className="font-monospace fw-bold text-danger">{t("BRAKE")}</span>
          </div>
        </div>
        <span className="font-monospace text-body-secondary fs-8 fw-semibold">{t("INPUT WAVEFORM")}</span>
      </div>
    </div>
  );
});

export default PedalTraceCanvas;
