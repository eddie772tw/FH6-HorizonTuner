import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

interface PowerTorqueCanvasProps {
  height?: string | number;
  enabled?: boolean;
}

const PowerTorqueCanvas: React.FC<PowerTorqueCanvasProps> = React.memo(({ height = '140px', enabled = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{ rpm: number; power: number; torque: number; time: number }[]>([]);
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);
  const themeVars = useRef({ primary: '#00f0ff', secondary: '#ffaa00', isLight: false });

  const { convertPower, convertTorque, t } = useSettings();

  const maxPowerObservedRef = useRef<number>(100);
  const maxTorqueObservedRef = useRef<number>(100);

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

    // 策略 A：快取 CSS 主題色值，避免每幀兩次 getComputedStyle
    const updateThemeVars = () => {
      const style = getComputedStyle(document.documentElement);
      themeVars.current = {
        primary: style.getPropertyValue('--primary').trim() || '#00f0ff',
        secondary: style.getPropertyValue('--secondary').trim() || '#ffaa00',
        isLight: document.documentElement.getAttribute('data-bs-theme') === 'light',
      };
    };
    updateThemeVars();
    const themeObserver = new MutationObserver(updateThemeVars);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

    // ResizeObserver to automatically scale canvas resolution
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

      if (
        (prevCar.current !== null && prevCar.current !== liveData.CarOrdinal) ||
        (prevRace.current !== null && prevRace.current !== liveData.IsRaceOn)
      ) {
        hist.current = [];
        maxPowerObservedRef.current = 100;
        maxTorqueObservedRef.current = 100;
      }
      prevCar.current = liveData.CarOrdinal;
      prevRace.current = liveData.IsRaceOn;

      if (liveData.IsRaceOn !== 1) return;

      const now = performance.now();
      const rawRpm = liveData.CurrentEngineRpm || 0;
      const rawPower = convertPower(liveData.PowerWatts || 0).value;
      const rawTorque = convertTorque(liveData.TorqueNewtons || 0).value;
      const maxRpm = Math.max(7000, liveData.EngineMaxRpm || 8500);

      if (rawRpm > 300) {
        if (rawPower > maxPowerObservedRef.current) maxPowerObservedRef.current = rawPower;
        if (rawTorque > maxTorqueObservedRef.current) maxTorqueObservedRef.current = rawTorque;

        if (hist.current.length < 350) {
          hist.current.push({ rpm: rawRpm, power: Math.max(0, rawPower), torque: Math.max(0, rawTorque), time: now });
        } else {
          const old = hist.current.shift();
          if (old) {
            old.rpm = rawRpm;
            old.power = Math.max(0, rawPower);
            old.torque = Math.max(0, rawTorque);
            old.time = now;
            hist.current.push(old);
          }
        }
      }

      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0 || canvas.height === 0) return;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;

      ctx.clearRect(0, 0, w, h);

      const padTop = 26 * dpr;
      const padBottom = 12 * dpr;
      const plotH = Math.max(10, h - padTop - padBottom);

      // Grid Guidelines（使用快取的主題色值）
      const { primary: primaryHex, secondary: secondaryHex, isLight } = themeVars.current;
      ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1 * dpr;

      // Draw horizontal dashed grid lines (0% baseline, 25%, 50%, 75%)
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      const y0 = h - padBottom;
      const y25 = h - padBottom - plotH * 0.25;
      const y50 = h - padBottom - plotH * 0.50;
      const y75 = h - padBottom - plotH * 0.75;
      ctx.moveTo(0, y0); ctx.lineTo(w, y0);
      ctx.moveTo(0, y25); ctx.lineTo(w, y25);
      ctx.moveTo(0, y50); ctx.lineTo(w, y50);
      ctx.moveTo(0, y75); ctx.lineTo(w, y75);
      ctx.stroke();
      ctx.setLineDash([]);

      const len = hist.current.length;
      if (len === 0) return;

      const ceilHP = Math.max(100, Math.ceil(maxPowerObservedRef.current / 50) * 50);
      const ceilTQ = Math.max(100, Math.ceil(maxTorqueObservedRef.current / 50) * 50);
      const combinedMax = Math.max(ceilHP, ceilTQ) * 1.1; // 10% headroom

      // primaryHex / secondaryHex 已從快取取得，不需再呈 getComputedStyle

      // 1. Draw Torque Scatter Points (Secondary Theme Color)
      ctx.fillStyle = secondaryHex;
      for (let k = 0; k < len; k++) {
        const pt = hist.current[k];
        const px = (pt.rpm / maxRpm) * (w - 24 * dpr) + 12 * dpr;
        const py = h - padBottom - (pt.torque / combinedMax) * plotH;

        ctx.beginPath();
        ctx.arc(px, py, 1.8 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Draw Power Scatter Points (Primary Theme Color)
      ctx.fillStyle = primaryHex;
      for (let k = 0; k < len; k++) {
        const pt = hist.current[k];
        const px = (pt.rpm / maxRpm) * (w - 24 * dpr) + 12 * dpr;
        const py = h - padBottom - (pt.power / combinedMax) * plotH;

        ctx.beginPath();
        ctx.arc(px, py, 2.0 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Highlight Current Active Telemetry Point (Glowing Ring & Dot)
      if (len > 0) {
        const latest = hist.current[len - 1];
        const pxRpm = (latest.rpm / maxRpm) * (w - 24 * dpr) + 12 * dpr;
        const pyPower = h - padBottom - (latest.power / combinedMax) * plotH;
        const pyTorque = h - padBottom - (latest.torque / combinedMax) * plotH;

        // Current Power Active Marker
        ctx.beginPath();
        ctx.arc(pxRpm, pyPower, 4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = primaryHex;
        ctx.shadowColor = primaryHex;
        ctx.shadowBlur = 10 * dpr;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Current Torque Active Marker
        ctx.beginPath();
        ctx.arc(pxRpm, pyTorque, 4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = secondaryHex;
        ctx.shadowColor = secondaryHex;
        ctx.shadowBlur = 10 * dpr;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [convertPower, convertTorque, enabled]);

  return (
    <div
      ref={containerRef}
      className="position-relative w-100 rounded-3 border overflow-hidden d-flex flex-column flex-grow-1"
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: typeof height === 'number' ? `${height}px` : undefined,
        background: 'var(--surface-1)',
        borderColor: 'var(--glass-border) !important'
      }}
    >
      <canvas ref={canvasRef} className="w-100 h-100 d-block" style={{ width: '100%', height: '100%' }} />
      <div className="position-absolute top-0 start-0 end-0 p-2 d-flex justify-content-between align-items-center pointer-events-none" style={{ background: 'linear-gradient(to bottom, var(--surface-1), transparent)' }}>
        <div className="d-flex align-items-center gap-3 fs-8">
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: 'var(--primary)' }} />
            <span className="font-monospace fw-bold text-primary">{t("POWER")}</span>
          </div>
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: 'var(--secondary)' }} />
            <span className="font-monospace fw-bold text-secondary">{t("TORQUE")}</span>
          </div>
        </div>
        <span className="font-monospace text-body-secondary fs-8 fw-semibold">{t("RPM SCATTER TRACE")}</span>
      </div>
    </div>
  );
});

export default PowerTorqueCanvas;
