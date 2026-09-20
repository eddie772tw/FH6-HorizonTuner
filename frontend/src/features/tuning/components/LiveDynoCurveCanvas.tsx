import { memo, useEffect, useRef } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { TuningMeasurementState } from '../tuningMeasurement';

/** Draw the session-owned accepted summary, including after leaving/re-entering Tune. */
export const LiveDynoCurveCanvas = memo(function LiveDynoCurveCanvas({ state, height = 180 }: {
  state: TuningMeasurementState; height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { convertPower, convertTorque, t } = useSettings();

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const draw = () => {
      const { width, height: h } = container.getBoundingClientRect();
      if (width <= 0 || h <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      const style = getComputedStyle(document.documentElement);
      const primary = style.getPropertyValue('--primary').trim();
      const secondary = style.getPropertyValue('--secondary').trim();
      const text = style.getPropertyValue('--text-secondary').trim();
      const divider = style.getPropertyValue('--divider').trim();
      const limit = state.engineMaxRpm;
      if (!limit) return;
      const left = 12, right = width - 12, top = 32, bottom = h - 26;
      const x = (rpm: number) => left + rpm / limit * (right - left);
      const bins = [...state.bins].sort((a, b) => a.averageRpm - b.averageRpm);
      const power = bins.map(bin => convertPower(bin.averagePowerWatts).value);
      const torque = bins.map(bin => convertTorque(bin.averageTorqueNewtons).value);
      // Independent axes keep curve shape stable when display units change.
      const maxPower = Math.max(1, ...power) * 1.1;
      const maxTorque = Math.max(1, ...torque) * 1.1;
      ctx.strokeStyle = divider;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = top + (bottom - top) * i / 4;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }
      if (state.powerbandStartRpm && state.powerbandEndRpm && state.powerbandEndRpm > state.powerbandStartRpm) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = primary;
        ctx.fillRect(x(state.powerbandStartRpm), top,
          x(Math.min(limit, state.powerbandEndRpm)) - x(state.powerbandStartRpm), bottom - top);
        ctx.globalAlpha = 1;
      }
      const curve = (values: number[], max: number, color: string) => {
        if (bins.length < 2) return;
        const y = (index: number) => bottom - values[index] / max * (bottom - top);
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x(bins[0].averageRpm), y(0));
        for (let i = 0; i < bins.length - 1; i++) {
          ctx.quadraticCurveTo(x(bins[i].averageRpm), y(i),
            (x(bins[i].averageRpm) + x(bins[i + 1].averageRpm)) / 2, (y(i) + y(i + 1)) / 2);
        }
        ctx.lineTo(x(bins[bins.length - 1].averageRpm), y(bins.length - 1)); ctx.stroke();
      };
      curve(power, maxPower, primary);
      curve(torque, maxTorque, secondary);
      for (const [rpm, color] of [
        [state.observedPeakPower?.rpm, primary], [state.observedPeakTorque?.rpm, secondary],
        [state.effectiveRedline, text],
      ] as const) {
        if (!rpm) continue;
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x(rpm), top); ctx.lineTo(x(rpm), bottom); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = bins.some(bin => bin.index === i) ? primary : divider;
        ctx.fillRect(left + i * (right - left) / 16, h - 16, Math.max(0, (right - left) / 16 - 2), 4);
      }
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(container);
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'data-bs-core', 'style'] });
    return () => { resize.disconnect(); theme.disconnect(); };
  }, [state, convertPower, convertTorque]);

  return <div ref={containerRef} className="position-relative w-100 rounded-3 overflow-hidden"
    style={{ height, background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
    <canvas ref={canvasRef} className="w-100 h-100 d-block" role="img"
      aria-label={t('Observed engine output')} />
    <div className="position-absolute top-0 start-0 end-0 px-2 d-flex justify-content-between small">
      <span style={{ color: 'var(--primary)' }}>{t('POWER')} ({convertPower(0).label})</span>
      <span style={{ color: 'var(--secondary)' }}>{t('TORQUE')} ({convertTorque(0).label})</span>
      <span>{state.effectiveRedline ? `${t('Effective limit')}: ${Math.round(state.effectiveRedline)} RPM` : ''}</span>
    </div>
  </div>;
});
