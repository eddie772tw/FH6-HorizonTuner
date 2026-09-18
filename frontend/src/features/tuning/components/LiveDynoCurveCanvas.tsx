import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';
import type { TuningMeasurementState } from '../tuningMeasurement';

interface LiveDynoCurveCanvasProps {
  height?: string | number;
  state: TuningMeasurementState;
  enabled?: boolean;
}

interface BucketPoint {
  rpm: number;
  hpSum: number;
  tqSum: number;
  count: number;
}

export const LiveDynoCurveCanvas: React.FC<LiveDynoCurveCanvasProps> = React.memo(({
  height = 170,
  state,
  enabled = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bucketsRef = useRef<Map<number, BucketPoint>>(new Map());
  const maxHpObservedRef = useRef<number>(100);
  const maxTqObservedRef = useRef<number>(100);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { convertPower, convertTorque, t } = useSettings();
  const themeVars = useRef({ primary: '#00f0ff', secondary: '#ffaa00', isLight: false });

  // 當重置或車輛更換時清空聚合桶
  useEffect(() => {
    if (state.acceptedMs === 0) {
      bucketsRef.current.clear();
      maxHpObservedRef.current = 100;
      maxTqObservedRef.current = 100;
    }
  }, [state.acceptedMs, state.carId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

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

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: h } = entry.contentRect;
        if (width > 0 && h > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(h * dpr);
        }
      }
    });
    resizeObserver.observe(container);

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if (!liveData || !enabled || (window as any).__IS_HUD_PAUSED__) return;
      if (liveData.IsRaceOn !== 1) return;

      const rawRpm = liveData.CurrentEngineRpm || 0;
      const redlineRpm = Math.max(5000, stateRef.current.engineMaxRpm || liveData.EngineMaxRpm || 8000);
      const accel = liveData.AccelInput || 0;
      const brake = liveData.BrakeInput || 0;
      const handbrake = liveData.HandBrakeInput || 0;
      const clutch = liveData.ClutchInput || 0;
      const gear = liveData.Gear || 0;

      // 只有在全油門加速中聚合樣本 (5~10 RPM 區間步長，此處使用 10 RPM)
      const isWot = accel >= 240 && brake === 0 && handbrake === 0 && clutch === 0 && gear >= 1 && gear <= 10;
      if (isWot && rawRpm > 300 && rawRpm <= redlineRpm) {
        const powerHp = convertPower(liveData.PowerWatts || 0).value;
        const torque = convertTorque(liveData.TorqueNewtons || 0).value;

        if (powerHp > 0 && torque > 0) {
          if (powerHp > maxHpObservedRef.current) maxHpObservedRef.current = powerHp;
          if (torque > maxTqObservedRef.current) maxTqObservedRef.current = torque;

          const bucketKey = Math.floor(rawRpm / 10) * 10;
          const existing = bucketsRef.current.get(bucketKey);
          if (existing) {
            existing.hpSum += powerHp;
            existing.tqSum += torque;
            existing.count += 1;
          } else {
            bucketsRef.current.set(bucketKey, {
              rpm: bucketKey,
              hpSum: powerHp,
              tqSum: torque,
              count: 1,
            });
          }
        }
      }

      // 開始渲染 Canvas
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0 || canvas.height === 0) return;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;

      ctx.clearRect(0, 0, w, h);

      const padTop = 26 * dpr;
      const padBottom = 22 * dpr; // 底部保留給 Bins 直方指示條
      const plotH = Math.max(10, h - padTop - padBottom);

      const { primary: primaryHex, secondary: secondaryHex, isLight } = themeVars.current;

      // 1. 繪製橫向參考格線 (0%, 25%, 50%, 75%, 100%)
      ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      for (const ratio of [0, 0.25, 0.5, 0.75]) {
        const y = h - padBottom - plotH * ratio;
        ctx.moveTo(12 * dpr, y);
        ctx.lineTo(w - 12 * dpr, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const currentState = stateRef.current;
      const targetMaxRpm = redlineRpm;

      // 2. 背景繪製「動力帶區間高亮 (Powerband Region)」
      const pStart = currentState.powerbandStartRpm;
      const pEnd = currentState.powerbandEndRpm ?? (currentState.effectiveRedline ?? currentState.observedPeakPower?.rpm);
      if (pStart && pEnd && pStart < pEnd && pStart > 0 && pEnd <= targetMaxRpm * 1.05) {
        const x1 = (pStart / targetMaxRpm) * (w - 24 * dpr) + 12 * dpr;
        const x2 = (Math.min(targetMaxRpm, pEnd) / targetMaxRpm) * (w - 24 * dpr) + 12 * dpr;
        const bandWidth = Math.max(2, x2 - x1);

        // 半透明動力帶漸變背景
        const bandGrad = ctx.createLinearGradient(x1, 0, x2, 0);
        bandGrad.addColorStop(0, isLight ? 'rgba(0, 180, 255, 0.06)' : 'rgba(0, 240, 255, 0.05)');
        bandGrad.addColorStop(0.5, isLight ? 'rgba(0, 180, 255, 0.12)' : 'rgba(0, 240, 255, 0.10)');
        bandGrad.addColorStop(1, isLight ? 'rgba(0, 180, 255, 0.06)' : 'rgba(0, 240, 255, 0.05)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(x1, padTop, bandWidth, plotH);

        // 動力帶兩側細邊框
        ctx.strokeStyle = isLight ? 'rgba(0, 180, 255, 0.25)' : 'rgba(0, 240, 255, 0.20)';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(x1, padTop); ctx.lineTo(x1, padTop + plotH);
        ctx.moveTo(x2, padTop); ctx.lineTo(x2, padTop + plotH);
        ctx.stroke();

        // 動力帶頂部精緻小標籤
        ctx.fillStyle = isLight ? '#0077b6' : 'rgba(0, 240, 255, 0.85)';
        ctx.font = `${Math.round(8 * dpr)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`⚡ POWERBAND: ${Math.round(pStart)} - ${Math.round(pEnd)} RPM`, (x1 + x2) / 2, padTop - 6 * dpr);
      }

      // 3. 排序聚合點並繪製平滑曲線
      const sortedKeys = Array.from(bucketsRef.current.keys()).sort((a, b) => a - b);
      const combinedMax = Math.max(100, Math.max(maxHpObservedRef.current, maxTqObservedRef.current) * 1.12);

      if (sortedKeys.length >= 2) {
        const pointsHp: { x: number; y: number }[] = [];
        const pointsTq: { x: number; y: number }[] = [];

        for (const k of sortedKeys) {
          const b = bucketsRef.current.get(k)!;
          const avgHp = b.hpSum / b.count;
          const avgTq = b.tqSum / b.count;
          const px = (b.rpm / targetMaxRpm) * (w - 24 * dpr) + 12 * dpr;
          const pyHp = h - padBottom - (avgHp / combinedMax) * plotH;
          const pyTq = h - padBottom - (avgTq / combinedMax) * plotH;
          pointsHp.push({ x: px, y: pyHp });
          pointsTq.push({ x: px, y: pyTq });
        }

        // 中點二次貝茲曲線插值演算法 (Midpoint Quadratic Spline)
        const renderSmoothSpline = (pts: { x: number; y: number }[], strokeStyle: string, lineWidth: number) => {
          if (pts.length < 2) return;
          ctx.beginPath();
          ctx.strokeStyle = strokeStyle;
          ctx.lineWidth = lineWidth;
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 0; i < pts.length - 1; i++) {
            const midX = (pts[i].x + pts[i + 1].x) / 2;
            const midY = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
          }
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          ctx.stroke();
        };

        // (A) 繪製扭力平滑曲線 (Secondary)
        renderSmoothSpline(pointsTq, secondaryHex, 2.2 * dpr);

        // (B) 繪製馬力平滑曲線 (Primary)
        renderSmoothSpline(pointsHp, primaryHex, 2.5 * dpr);
      }

      // 4. 繪製特徵標記線 (Peak Power, Peak Torque, Cutoff)
      if (currentState.observedPeakPower) {
        const px = (currentState.observedPeakPower.rpm / targetMaxRpm) * (w - 24 * dpr) + 12 * dpr;
        ctx.strokeStyle = primaryHex;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, padTop); ctx.lineTo(px, h - padBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (currentState.observedPeakTorque) {
        const px = (currentState.observedPeakTorque.rpm / targetMaxRpm) * (w - 24 * dpr) + 12 * dpr;
        ctx.strokeStyle = secondaryHex;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, padTop); ctx.lineTo(px, h - padBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (currentState.effectiveRedline) {
        const px = (currentState.effectiveRedline / targetMaxRpm) * (w - 24 * dpr) + 12 * dpr;
        ctx.strokeStyle = '#ff3366';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, padTop); ctx.lineTo(px, h - padBottom);
        ctx.stroke();
        ctx.fillStyle = '#ff3366';
        ctx.font = `${Math.round(8 * dpr)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`CUTOFF: ${currentState.effectiveRedline}`, px, padTop - 6 * dpr);
      }

      // 5. 繪製當前作用中轉速點 (Active Marker)
      if (rawRpm > 300) {
        const activeX = (Math.min(targetMaxRpm, rawRpm) / targetMaxRpm) * (w - 24 * dpr) + 12 * dpr;
        ctx.beginPath();
        ctx.arc(activeX, h - padBottom - 2 * dpr, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = isWot ? '#00e676' : 'rgba(255,255,255,0.4)';
        ctx.shadowColor = isWot ? '#00e676' : 'transparent';
        ctx.shadowBlur = 8 * dpr;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 6. 底部 16 Bins 覆蓋直方條 (16-Bin Coverage Histogram)
      const binY = h - 12 * dpr;
      const binH = 4 * dpr;
      const totalWidth = w - 24 * dpr;
      const binWidth = (totalWidth - 15 * 2 * dpr) / 16;
      const coveredBinSet = new Set(currentState.bins.map((b) => b.index));

      for (let i = 0; i < 16; i++) {
        const bx = 12 * dpr + i * (binWidth + 2 * dpr);
        const isCovered = coveredBinSet.has(i);
        ctx.fillStyle = isCovered ? '#00e676' : isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx, binY, binWidth, binH);
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
        borderColor: 'var(--glass-border) !important',
      }}
    >
      <canvas ref={canvasRef} className="w-100 h-100 d-block" style={{ width: '100%', height: '100%' }} />
      <div
        className="position-absolute top-0 start-0 end-0 p-2 d-flex justify-content-between align-items-center pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, var(--surface-1), transparent)' }}
      >
        <div className="d-flex align-items-center gap-3 fs-8">
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: 'var(--primary)' }} />
            <span className="font-monospace fw-bold text-primary">{t('POWER')}</span>
          </div>
          <div className="d-flex align-items-center gap-1">
            <span className="d-inline-block rounded-circle" style={{ width: '8px', height: '8px', background: 'var(--secondary)' }} />
            <span className="font-monospace fw-bold text-secondary">{t('TORQUE')}</span>
          </div>
        </div>
        <div className="fs-8 text-secondary font-monospace">
          {state.effectiveRedline
            ? `LIMIT: ${Math.round(state.effectiveRedline)} RPM`
            : state.engineMaxRpm
              ? `MAX: ${Math.round(state.engineMaxRpm)} RPM`
              : ''}
        </div>
      </div>
    </div>
  );
});
