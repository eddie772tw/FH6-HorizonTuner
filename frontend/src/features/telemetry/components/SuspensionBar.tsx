import React, { useEffect, useRef, useState } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { readCanvasTheme, observeCanvasTheme } from '../canvasTheme';
import { useSettings } from '../../../context/SettingsContext';
import { getSuspensionDisplayValue, type SuspensionTravelMode } from '../../../utils/suspensionTravel';
import {
  clearSuspensionTraceHistory, createSuspensionTraceHistory,
  SUSPENSION_TRACE_WINDOW_MS, updateSuspensionTraceHistory,
} from '../suspensionTrace';

// --- COMPONENT: SuspensionBar ---
interface SuspensionBarProps {
  title: string;
  isLeft: boolean;
  tireIdx: number;
  renderHistoryTrace?: boolean;
  displayMode?: SuspensionTravelMode;
}

const SuspensionBar: React.FC<SuspensionBarProps> = React.memo(({ title, isLeft, tireIdx, renderHistoryTrace = true, displayMode = 'relative' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const minRef = useRef<HTMLSpanElement>(null);
  const maxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const { t } = useSettings();
  
  const [history] = useState(createSuspensionTraceHistory);
  const minMax = useRef<{ min: number | null, max: number | null }>({ min: null, max: null });
  const prevCar = useRef<number | null>(null);
  const prevRace = useRef<number | null>(null);

  useEffect(() => {
    clearSuspensionTraceHistory(history);
    minMax.current = { min: null, max: null };
  }, [displayMode, history]);

  useEffect(() => {
    if (!renderHistoryTrace) {
      clearSuspensionTraceHistory(history);
    }
  }, [renderHistoryTrace, history]);

  useEffect(() => {
    let theme = readCanvasTheme();
    const stopThemeObserver = observeCanvasTheme(() => { theme = readCanvasTheme(); draw(); });

    const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const warningH = h * 0.08;
      ctx.fillStyle = theme.warningFill;
      ctx.fillRect(0, 0, w, warningH);
      ctx.fillRect(0, h - warningH, w, warningH);
      
      ctx.beginPath();
      ctx.setLineDash(theme.linear ? [] : [3, 3]);
      ctx.strokeStyle = theme.warningLine;
      ctx.lineWidth = 1;
      ctx.moveTo(0, warningH); ctx.lineTo(w, warningH);
      ctx.moveTo(0, h - warningH); ctx.lineTo(w, h - warningH);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const handleUpdate = (e: any) => {
      const liveData = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !liveData) return;
      
      if ((prevCar.current !== null && prevCar.current !== liveData.CarOrdinal) ||
          (prevRace.current !== null && prevRace.current !== liveData.IsRaceOn)) {
        clearSuspensionTraceHistory(history);
        minMax.current = { min: null, max: null };
      }
      prevCar.current = liveData.CarOrdinal;
      prevRace.current = liveData.IsRaceOn;

      if (liveData.IsRaceOn !== 1) return;
      
      const now = performance.now();

      const normalizedTravel = (liveData.NormalizedSuspensionTravel && liveData.NormalizedSuspensionTravel[tireIdx]) || 0;
      const absoluteMeters = (liveData.SuspensionTravelMeters && liveData.SuspensionTravelMeters[tireIdx]) || 0;
      const travel = getSuspensionDisplayValue(normalizedTravel, absoluteMeters, displayMode);
      
      if (minMax.current.min === null || minMax.current.max === null) {
        minMax.current.min = travel;
        minMax.current.max = travel;
      } else {
        if (travel < minMax.current.min) minMax.current.min = travel;
        if (travel > minMax.current.max) minMax.current.max = travel;
      }
      
      if (renderHistoryTrace) {
        updateSuspensionTraceHistory(history, normalizedTravel, now);
      } else {
        clearSuspensionTraceHistory(history);
      }

      const percent = Math.max(0, Math.min(100, normalizedTravel * 100));
      if (barRef.current) barRef.current.style.height = percent + '%';
      const precision = displayMode === 'absolute' ? 1 : 2;
      if (textRef.current) textRef.current.innerText = travel.toFixed(precision);
      if (unitRef.current) unitRef.current.innerText = displayMode === 'absolute' ? ' mm' : '';
      if (minRef.current) minRef.current.innerText = minMax.current.min !== null ? minMax.current.min.toFixed(precision) : '-';
      if (maxRef.current) maxRef.current.innerText = minMax.current.max !== null ? minMax.current.max.toFixed(precision) : '-';

      draw();
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const dpr = window.devicePixelRatio || 1;
          
          drawBackground(ctx, w, h);

          if (renderHistoryTrace && history.size > 0) {
            ctx.beginPath();
            if (theme.linear) ctx.strokeStyle = theme.primary;
            else {
              const grad = ctx.createLinearGradient(0, 0, 0, h);
              grad.addColorStop(0, theme.danger);
              grad.addColorStop(0.08, theme.primary);
              grad.addColorStop(0.92, theme.primary);
              grad.addColorStop(1, theme.danger);
              ctx.strokeStyle = grad;
            }
            ctx.lineWidth = 2 * dpr;
            ctx.lineJoin = 'round';
    
            const len = history.size;
            const latestIdx = (history.offset - 1 + len) % len;
            const maxT = history.samples[latestIdx].time;
            for (let k = 0; k < len; k++) {
              const idx = (history.offset + k) % len;
              const p = history.samples[idx];
              const x = w - ((maxT - p.time) / SUSPENSION_TRACE_WINDOW_MS) * w;
              const y = h - (p.travel * h);
              if (k === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }
      }
    };
    const resizeObserver = new ResizeObserver(entries => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      for (const { contentRect: { width, height } } of entries) {
        if (width > 0 && height > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          draw();
        }
      }
    });
    if (canvasContainerRef.current) resizeObserver.observe(canvasContainerRef.current);
    draw();
    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => {
      resizeObserver.disconnect();
      stopThemeObserver();
      telemetryEmitter.removeEventListener('update', handleUpdate);
    };
  }, [tireIdx, renderHistoryTrace, displayMode, history]);

  return (
    <div ref={containerRef} className="telemetry-instrument-panel p-2 rounded-3 border d-flex flex-column justify-content-between h-100 overflow-hidden" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
      <div className={`instrument-readout-label fw-bold text-body mb-1 fs-8 ${isLeft ? 'text-start' : 'text-end'}`}>{title}</div>
      <div className={`d-flex gap-2 align-items-center flex-grow-1 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`} style={{ height: '42px', minHeight: '38px' }}>
        <div className="position-relative h-100 border rounded-pill overflow-hidden flex-shrink-0" style={{ width: '20px', background: 'var(--surface-2)', borderColor: 'var(--glass-border) !important' }}>
          <div className="position-absolute" style={{ top: '50%', left: 0, right: 0, height: '1px', background: 'var(--divider)', zIndex: 2 }} />
          <div ref={barRef} className="position-absolute start-0 end-0 bottom-0 rounded-bottom-pill" style={{
            height: '50%',
            background: 'var(--primary)'
          }} />
        </div>
        <div ref={canvasContainerRef} className="flex-grow-1 h-100 position-relative opacity-75 overflow-hidden">
           <canvas ref={canvasRef} className="w-100 h-100 d-block" />
        </div>
      </div>
      <div className="d-flex justify-content-between mt-1 px-1 text-body-secondary fs-8 flex-shrink-0">
        <span>{t("Min")}: <span className="fw-bold font-monospace text-body" ref={minRef}>0.00</span></span>
        <span className="fw-bold font-monospace text-primary fs-7"><span ref={textRef}>0.00</span><span ref={unitRef}></span></span>
        <span>{t("Max")}: <span className="fw-bold font-monospace text-body" ref={maxRef}>0.00</span></span>
      </div>
    </div>
  );
});

export default SuspensionBar;
