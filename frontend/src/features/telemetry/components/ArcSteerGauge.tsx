import { useTelemetryCardPaint, createTelemetryCanvasSurface } from './TelemetryCardVisibility';
import { setTelemetryText } from '../../../utils/telemetryDisplay';
import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { readCanvasTheme, observeCanvasTheme } from '../../../utils/canvasTheme';
import { useSettings } from '../../../context/SettingsContext';

const ArcSteerGauge: React.FC<{ size?: number }> = React.memo(() => {
  const paint = useTelemetryCardPaint();
  const lastSteer = useRef(0);
  const hasSample = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const degTextRef = useRef<HTMLSpanElement>(null);
  const dirTextRef = useRef<HTMLSpanElement>(null);
  const { t } = useSettings();

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const surface = createTelemetryCanvasSurface(canvas);

    let theme = readCanvasTheme();
    const stopThemeObserver = observeCanvasTheme(() => { theme = readCanvasTheme(); drawGauge(lastSteer.current); });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        surface.resize(width, height);
        drawGauge(lastSteer.current);
      }
    });
    resizeObserver.observe(container);

    const drawGauge = (steerRatio: number) => {
      if (!paint.canPaint()) return;
      if (hasSample.current && degTextRef.current) {
        const deg = steerRatio * 45;
        setTelemetryText(degTextRef.current, `${Math.abs(deg).toFixed(1)}°`);
        degTextRef.current.style.color = Math.abs(deg) > 30 ? 'var(--secondary)' : 'var(--text-primary)';
      }
      if (hasSample.current && dirTextRef.current) {
        if (Math.abs(steerRatio) < 0.02) setTelemetryText(dirTextRef.current, 'CENTER');
        else setTelemetryText(dirTextRef.current, steerRatio < 0 ? 'LEFT' : 'RIGHT');
      }
      if (!surface.sync()) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2 + 2 * dpr;
      // Dynamically fit full container bounds with adaptive padding
      const radius = Math.max(15 * dpr, Math.min(cx, cy) - 6 * dpr);

      // 270 Degree Arc: from 135 deg (3*PI/4) to 405 deg (9*PI/4)
      const startAngle = (3 * Math.PI) / 4;
      const endAngle = (9 * Math.PI) / 4;
      const centerAngle = (6 * Math.PI) / 4; // Top center

      // 1. Background Arc Track（使用快取的主題色值）
      const { primary: primaryHex } = theme;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.lineWidth = (theme.linear ? 1 : 4) * dpr;
      ctx.strokeStyle = theme.track;
      ctx.stroke();

      // Tick marks
      const tickCount = theme.linear ? 25 : 9;
      ctx.lineWidth = 1.4 * dpr;
      for (let i = 0; i < tickCount; i++) {
        const tickAngle = startAngle + (i / (tickCount - 1)) * (endAngle - startAngle);
        const isCenter = i === (tickCount - 1) / 2;
        const innerR = radius - (isCenter ? 8 * dpr : 4.5 * dpr);
        const outerR = radius + 3 * dpr;
        ctx.beginPath();
        ctx.moveTo(cx + innerR * Math.cos(tickAngle), cy + innerR * Math.sin(tickAngle));
        ctx.lineTo(cx + outerR * Math.cos(tickAngle), cy + outerR * Math.sin(tickAngle));
        ctx.strokeStyle = isCenter ? primaryHex : theme.tick;
        ctx.stroke();
      }

      // 2. Active Steering Arc（primaryHex 已從快取取得）
      const targetAngle = centerAngle + (steerRatio * (endAngle - startAngle)) / 2;

      if (Math.abs(steerRatio) > 0.005) {
        ctx.beginPath();
        if (steerRatio > 0) {
          ctx.arc(cx, cy, radius, centerAngle, targetAngle, false);
        } else {
          ctx.arc(cx, cy, radius, targetAngle, centerAngle, false);
        }
        ctx.lineWidth = (theme.linear ? 2 : 5) * dpr;
        ctx.strokeStyle = primaryHex;
        ctx.shadowColor = primaryHex;
        ctx.shadowBlur = theme.glowStrength * 8 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // 3. Indicator Needle Dot & Center Marker
      const dotX = cx + radius * Math.cos(targetAngle);
      const dotY = cy + radius * Math.sin(targetAngle);

      ctx.beginPath();
      if (theme.linear) ctx.rect(dotX - 4 * dpr, dotY - 4 * dpr, 8 * dpr, 8 * dpr);
      else ctx.arc(dotX, dotY, 5.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = primaryHex;
      ctx.shadowColor = primaryHex;
      ctx.shadowBlur = theme.glowStrength * 10 * dpr;
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;

      const steerRaw = (liveData.SteerInput || 0) / 127;
      const clampedSteer = Math.max(-1, Math.min(1, steerRaw));
      lastSteer.current = clampedSteer;
      hasSample.current = true;
      drawGauge(clampedSteer);
    };

    const stopPaint = paint.subscribe(() => drawGauge(lastSteer.current));
    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      stopPaint();
      resizeObserver.disconnect();
      stopThemeObserver();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [paint]);

  return (
    <div ref={containerRef} className="w-100 h-100 position-relative d-flex align-items-center justify-content-center p-1 overflow-hidden">
      <canvas ref={canvasRef} className="w-100 h-100 position-absolute top-0 start-0" />
      <div className="telemetry-steer-gauge__readout position-absolute top-50 start-50 translate-middle d-flex flex-column align-items-center justify-content-center text-center pointer-events-none z-1">
        <span ref={dirTextRef} className="telemetry-steer-gauge__direction text-body-secondary text-uppercase fs-8 fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
          {t("STEER")}
        </span>
        <span ref={degTextRef} className="fw-bold font-monospace fs-6 text-body">0.0°</span>
      </div>
    </div>
  );
});

export default ArcSteerGauge;
