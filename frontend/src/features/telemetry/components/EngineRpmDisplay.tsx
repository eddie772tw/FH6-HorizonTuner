import { useTelemetryCardPaint, createTelemetryCanvasSurface } from './TelemetryCardVisibility';
import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { readCanvasTheme, observeCanvasTheme } from '../../../utils/canvasTheme';
import { useSettings } from '../../../context/SettingsContext';
import { formatTelemetryGear, setTelemetryText } from '../../../utils/telemetryDisplay';

const EngineRpmDisplay: React.FC = React.memo(() => {
  const paint = useTelemetryCardPaint();
  const rpmRef = useRef<HTMLSpanElement>(null);
  const maxRpmRef = useRef<HTMLSpanElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const speedUnitRef = useRef<HTMLSpanElement>(null);
  const shiftBadgeRef = useRef<HTMLSpanElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const lastFlashRef = useRef(false);
  const lastFlashTimeRef = useRef(0);
  const latestSample = useRef({ rpm: 0, maxRpm: 8000, alert: false, gear: 11, speed: 0 });

  const { t, convertSpeed } = useSettings();

  useEffect(() => {
    let theme = readCanvasTheme();
    const stopThemeObserver = observeCanvasTheme(() => { theme = readCanvasTheme(); drawRpmGauge(); });

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const surface = createTelemetryCanvasSurface(canvas);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        surface.resize(width, height);
        drawRpmGauge();
      }
    });
    resizeObserver.observe(container);

    const drawRpmGauge = () => {
      if (!paint.canPaint()) return;
      const { rpm: currentRpm, maxRpm, alert: isShiftAlert, gear, speed } = latestSample.current;
      const speedData = convertSpeed(speed);
      setTelemetryText(speedUnitRef.current, speedData.label);
      setTelemetryText(rpmRef.current, currentRpm.toString());
      setTelemetryText(maxRpmRef.current, Math.round(maxRpm).toString());
      setTelemetryText(speedRef.current, Math.round(speedData.value).toString());
      setTelemetryText(gearRef.current, formatTelemetryGear(gear));
      if (shiftBadgeRef.current) shiftBadgeRef.current.style.opacity = isShiftAlert ? '1' : '0';
      if (!surface.sync()) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, w, h);

      const safeMaxRpm = Math.max(2000, maxRpm);
      const rpmPercent = Math.max(0, Math.min(1, currentRpm / safeMaxRpm));

      const numSegments = 30;
      const gap = 2.5 * dpr;
      const segWidth = (w - (numSegments - 1) * gap) / numSegments;
      const activeSegs = Math.round(rpmPercent * numSegments);

      const { primary, secondary, glowStrength } = theme;

      const now = performance.now();
      if (now - lastFlashTimeRef.current > 100) {
        lastFlashRef.current = !lastFlashRef.current;
        lastFlashTimeRef.current = now;
      }

      for (let i = 0; i < numSegments; i++) {
        const segRatio = i / (numSegments - 1);
        const isActive = i < activeSegs;
        const x = i * (segWidth + gap);
        const y = 2 * dpr;
        const segHeight = h - 4 * dpr;

        let activeColor = primary;
        if (segRatio >= 0.88) {
          activeColor = theme.danger;
        } else if (segRatio >= 0.72) {
          activeColor = secondary;
        }

        ctx.beginPath();
        const slant = (theme.flat ? 0 : 3) * dpr;
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + segWidth + slant, y);
        ctx.lineTo(x + segWidth, y + segHeight);
        ctx.lineTo(x, y + segHeight);
        ctx.closePath();

        if (isActive) {
          if (isShiftAlert && segRatio >= 0.85) {
            ctx.fillStyle = theme.alertFlash && lastFlashRef.current ? theme.pointer : theme.danger;
            ctx.shadowColor = theme.danger;
            ctx.shadowBlur = glowStrength * 10 * dpr;
          } else {
            ctx.fillStyle = activeColor;
            ctx.shadowColor = activeColor;
            ctx.shadowBlur = glowStrength * 6 * dpr;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = theme.inactive;
          ctx.fill();
        }
      }
    };

    const handleUpdate = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;

      const currentRpm = Math.round(data.CurrentEngineRpm || 0);
      const maxRpm = data.EngineMaxRpm || 8000;
      const rpmPercent = currentRpm / Math.max(1000, maxRpm);
      const isRedlineAlert = rpmPercent >= 0.88 && (data.AccelInput || 0) > 100;
      latestSample.current.gear = data.Gear || 0;
      latestSample.current.speed = data.SpeedMetersPerSecond || 0;
      latestSample.current.rpm = currentRpm;
      latestSample.current.maxRpm = maxRpm;
      latestSample.current.alert = isRedlineAlert;
      drawRpmGauge();
    };

    const stopPaint = paint.subscribe(drawRpmGauge);
    drawRpmGauge();
    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      stopPaint();
      resizeObserver.disconnect();
      stopThemeObserver();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [convertSpeed, paint]);

  return (
    <div className="telemetry-instrument-panel d-flex flex-column gap-1 w-100 p-2 border rounded-3 overflow-hidden shadow-sm" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="text-body-secondary fw-bold text-uppercase fs-8" style={{ letterSpacing: '0.5px' }}>{t("ENGINE & TRANSMISSION")}</span>
        <span ref={shiftBadgeRef} className="badge bg-danger text-white font-monospace opacity-0 animate-pulse" style={{ transition: 'opacity 0.15s ease-in-out', fontSize: '0.65rem', letterSpacing: '0.5px' }}>
          SHIFT
        </span>
      </div>

      <div className="d-flex align-items-center justify-content-between gap-3 px-1" style={{ marginTop: '-2px' }}>
        <div className="d-flex flex-column align-items-center justify-content-center px-3 py-1 rounded-2 border bg-body-tertiary flex-shrink-0" style={{ minWidth: '58px', borderColor: 'var(--glass-border) !important' }}>
          <span className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.5px' }}>{t("GEAR")}</span>
          <span ref={gearRef} className="fw-bold font-monospace text-primary fs-3" style={{ lineHeight: 1.1 }}>N</span>
        </div>

        <div className="d-flex flex-column flex-grow-1 gap-1 overflow-hidden" style={{ marginTop: '-2px' }}>
          <div className="d-flex justify-content-between align-items-baseline font-monospace">
            <span className="text-body-secondary fs-8 fw-bold">{t("RPM")}</span>
            <div className="d-flex align-items-baseline gap-1">
              <span ref={rpmRef} className="fw-bold text-body fs-5">0</span>
              <span className="fs-8 text-body-secondary">/ <span ref={maxRpmRef}>8000</span></span>
            </div>
          </div>
          <div ref={containerRef} className="w-100 position-relative" style={{ height: '18px' }}>
            <canvas ref={canvasRef} className="w-100 h-100 d-block" />
          </div>
        </div>

        <div className="d-flex flex-column align-items-end justify-content-center px-1 py-1 flex-shrink-0" style={{ minWidth: '88px', marginTop: '-2px' }}>
          <span className="text-body-secondary fs-8 fw-bold text-uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.5px' }}>{t("SPEED")}</span>
          <div className="d-flex align-items-baseline gap-1">
            <span ref={speedRef} className="fw-bold font-monospace text-body fs-4 text-end" style={{ lineHeight: 1.1, minWidth: '42px' }}>0</span>
            <span ref={speedUnitRef} className="fs-8 text-body-secondary font-monospace">km/h</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EngineRpmDisplay;
