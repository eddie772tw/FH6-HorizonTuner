import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';
import { formatTelemetryGear } from '../../../utils/telemetryDisplay';

const EngineRpmDisplay: React.FC = React.memo(() => {
  const rpmRef = useRef<HTMLSpanElement>(null);
  const maxRpmRef = useRef<HTMLSpanElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const speedUnitRef = useRef<HTMLSpanElement>(null);
  const shiftBadgeRef = useRef<HTMLSpanElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const themeVars = useRef({ primary: '#00f0ff', secondary: '#ffaa00', isLight: false });
  const lastFlashRef = useRef(false);
  const lastFlashTimeRef = useRef(0);

  const { t, convertSpeed } = useSettings();

  useEffect(() => {
    const updateThemeVars = () => {
      const style = getComputedStyle(document.documentElement);
      themeVars.current = {
        primary: style.getPropertyValue('--primary').trim() || '#00f0ff',
        secondary: style.getPropertyValue('--secondary').trim() || '#ffaa00',
        isLight: document.documentElement.getAttribute('data-bs-theme') === 'light'
      };
    };

    updateThemeVars();
    const observer = new MutationObserver(updateThemeVars);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

    if (speedUnitRef.current) speedUnitRef.current.innerText = convertSpeed(0).label;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          drawRpmGauge(0, 8000, false);
        }
      }
    });
    resizeObserver.observe(container);

    const drawRpmGauge = (currentRpm: number, maxRpm: number, isShiftAlert: boolean) => {
      if (!canvas || canvas.width === 0 || canvas.height === 0) return;
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

      const { primary, secondary, isLight } = themeVars.current;

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
          activeColor = '#ff003c';
        } else if (segRatio >= 0.72) {
          activeColor = secondary;
        }

        ctx.beginPath();
        const slant = 3 * dpr;
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + segWidth + slant, y);
        ctx.lineTo(x + segWidth, y + segHeight);
        ctx.lineTo(x, y + segHeight);
        ctx.closePath();

        if (isActive) {
          if (isShiftAlert && segRatio >= 0.85) {
            ctx.fillStyle = lastFlashRef.current ? '#ffffff' : '#ff003c';
            ctx.shadowColor = '#ff003c';
            ctx.shadowBlur = 10 * dpr;
          } else {
            ctx.fillStyle = activeColor;
            ctx.shadowColor = activeColor;
            ctx.shadowBlur = 6 * dpr;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';
          ctx.fill();
        }
      }
    };

    const handleUpdate = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;

      const currentRpm = Math.round(data.CurrentEngineRpm || 0);
      const maxRpm = data.EngineMaxRpm || 8000;
      const gear = data.Gear || 0;
      const speedData = convertSpeed(data.SpeedMetersPerSecond || 0);
      const accelInput = data.AccelInput || 0;

      if (rpmRef.current) rpmRef.current.innerText = currentRpm.toString();
      if (maxRpmRef.current) maxRpmRef.current.innerText = Math.round(maxRpm).toString();
      if (speedRef.current) speedRef.current.innerText = Math.round(speedData.value).toString();

      const gearText = formatTelemetryGear(gear);
      if (gearRef.current) gearRef.current.innerText = gearText;

      const rpmPercent = currentRpm / Math.max(1000, maxRpm);
      const isRedlineAlert = rpmPercent >= 0.88 && accelInput > 100;

      if (shiftBadgeRef.current) {
        shiftBadgeRef.current.style.opacity = isRedlineAlert ? '1' : '0';
      }

      drawRpmGauge(currentRpm, maxRpm, isRedlineAlert);
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      resizeObserver.disconnect();
      observer.disconnect();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [convertSpeed]);

  return (
    <div className="d-flex flex-column gap-1 w-100 p-2 border rounded-3 overflow-hidden shadow-sm" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="text-body-secondary fw-bold text-uppercase fs-8" style={{ letterSpacing: '0.5px' }}>{t("ENGINE & TRANSMISSION")}</span>
        <span ref={shiftBadgeRef} className="badge bg-danger text-white font-monospace opacity-0 animate-pulse" style={{ transition: 'opacity 0.15s ease-in-out', fontSize: '0.65rem', letterSpacing: '0.5px' }}>
          SHIFT ⚡
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
