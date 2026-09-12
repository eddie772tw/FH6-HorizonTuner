import React, { useRef, useEffect, useMemo, useState } from "react";
import { AnalysisDataPoint } from "../../context/TelemetryRecorderContext";
import { useSettings } from "../../context/SettingsContext";

interface LapDeltaCanvasProps {
  primaryLapData: AnalysisDataPoint[];
  compareLapData?: AnalysisDataPoint[];
  primaryLapNumber: number;
  compareLapNumber?: number;
}

const LapDeltaCanvas: React.FC<LapDeltaCanvasProps> = ({
  primaryLapData,
  compareLapData = [],
  primaryLapNumber,
  compareLapNumber = -1,
}) => {
  const { t } = useSettings();
  const usablePoint = (point: AnalysisDataPoint): point is AnalysisDataPoint & {
    time: number;
    SpeedMetersPerSecond: number;
    AccelInput: number;
    BrakeInput: number;
  } =>
    typeof point.time === "number" && Number.isFinite(point.time) &&
    typeof point.SpeedMetersPerSecond === "number" && Number.isFinite(point.SpeedMetersPerSecond) &&
    typeof point.AccelInput === "number" && Number.isFinite(point.AccelInput) &&
    typeof point.BrakeInput === "number" && Number.isFinite(point.BrakeInput);
  const primaryPoints = useMemo(
    () => primaryLapData.filter(usablePoint),
    [primaryLapData],
  );
  const comparePoints = useMemo(
    () => compareLapData.filter(usablePoint),
    [compareLapData],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    pct: number;
    primarySpeed: number;
    compareSpeed?: number;
    throttle: number;
    brake: number;
  } | null>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Handle high DPR displays
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

    if (primaryPoints.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("No lap data to display."), width / 2, height / 2);
      return;
    }

    const padding = { top: 25, bottom: 25, left: 45, right: 20 };
    const chartW = width - padding.left - padding.right;
    const chartH = (height - padding.top - padding.bottom) / 2;

    const primaryDenom = Math.max(1, primaryPoints.length - 1);
    const compareDenom = Math.max(1, comparePoints.length - 1);

    // Speed Chart (Top)
    const speedTop = padding.top;

    let maxSpeed = 120;
    for (let i = 0; i < primaryPoints.length; i++) {
      const speed = primaryPoints[i].SpeedMetersPerSecond * 3.6;
      if (speed > maxSpeed) {
        maxSpeed = speed;
      }
    }
    for (let i = 0; i < comparePoints.length; i++) {
      const speed = comparePoints[i].SpeedMetersPerSecond * 3.6;
      if (speed > maxSpeed) {
        maxSpeed = speed;
      }
    }

    // Grid lines for speed
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = speedTop + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const speedVal = Math.round(maxSpeed - (maxSpeed / 4) * i);
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${speedVal}`, padding.left - 6, y + 3);
    }

    // Label Top Chart
    ctx.fillStyle = "var(--primary)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${t("Speed")} (km/h)`, padding.left, speedTop - 8);

    // Draw Compare Speed (Dashed Cyan)
    if (comparePoints.length > 0) {
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < comparePoints.length; i++) {
        const x = padding.left + (i / compareDenom) * chartW;
        const spd = comparePoints[i].SpeedMetersPerSecond * 3.6;
        const y = speedTop + chartH - (spd / maxSpeed) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (comparePoints.length === 1) {
        const spd = comparePoints[0].SpeedMetersPerSecond * 3.6;
        const y = speedTop + chartH - (spd / maxSpeed) * chartH;
        ctx.fillStyle = "#00f0ff";
        ctx.beginPath();
        ctx.arc(padding.left, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Draw Primary Speed (Solid Neon Green)
    ctx.strokeStyle = "#00ffaa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < primaryPoints.length; i++) {
      const x = padding.left + (i / primaryDenom) * chartW;
      const spd = primaryPoints[i].SpeedMetersPerSecond * 3.6;
      const y = speedTop + chartH - (spd / maxSpeed) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (primaryPoints.length === 1) {
      const spd = primaryPoints[0].SpeedMetersPerSecond * 3.6;
      const y = speedTop + chartH - (spd / maxSpeed) * chartH;
      ctx.fillStyle = "#00ffaa";
      ctx.beginPath();
      ctx.arc(padding.left, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Pedal Inputs Chart (Bottom)
    const pedalTop = speedTop + chartH + 25;
    const pedalH = chartH - 10;

    // Grid lines for Pedals
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = pedalTop + (pedalH / 2) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const pctVal = 100 - i * 50;
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${pctVal}%`, padding.left - 6, y + 3);
    }

    // Label Bottom Chart
    ctx.fillStyle = "var(--text-primary)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${t("Throttle & Brake Inputs")}`, padding.left, pedalTop - 8);

    // Draw Throttle (Green Fill + Line)
    ctx.strokeStyle = "#00ffaa";
    ctx.fillStyle = "rgba(0, 255, 170, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, pedalTop + pedalH);
    for (let i = 0; i < primaryPoints.length; i++) {
      const x = padding.left + (i / primaryDenom) * chartW;
      const thr = primaryPoints[i].AccelInput / 255;
      const y = pedalTop + pedalH - thr * pedalH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + (primaryPoints.length === 1 ? 0 : chartW), pedalTop + pedalH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw Brake (Red Fill + Line)
    ctx.strokeStyle = "#ff003c";
    ctx.fillStyle = "rgba(255, 0, 60, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, pedalTop + pedalH);
    for (let i = 0; i < primaryPoints.length; i++) {
      const x = padding.left + (i / primaryDenom) * chartW;
      const brk = primaryPoints[i].BrakeInput / 255;
      const y = pedalTop + pedalH - brk * pedalH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + (primaryPoints.length === 1 ? 0 : chartW), pedalTop + pedalH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // X Axis Distance Label
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("0% " + t("Lap Distance"), padding.left + 20, height - 6);
    ctx.fillText("50%", padding.left + chartW / 2, height - 6);
    ctx.fillText("100%", padding.left + chartW - 20, height - 6);
    };

    draw();

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        draw();
      });
      observer.observe(container);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [primaryPoints, comparePoints, primaryLapNumber, compareLapNumber, t]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || primaryPoints.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const paddingLeft = 45;
    const paddingRight = 20;
    const chartW = rect.width - paddingLeft - paddingRight;

    const relX = Math.max(0, Math.min(chartW, x - paddingLeft));
    const ratio = relX / chartW;
    const primaryIdx = Math.min(primaryPoints.length - 1, Math.floor(ratio * primaryPoints.length));
    const pPoint = primaryPoints[primaryIdx];

    let cSpeed: number | undefined = undefined;
    if (comparePoints.length > 0) {
      const compIdx = Math.min(comparePoints.length - 1, Math.floor(ratio * comparePoints.length));
      cSpeed = comparePoints[compIdx].SpeedMetersPerSecond * 3.6;
    }

    setHoverInfo({
      pct: Math.round(ratio * 100),
      primarySpeed: Math.round(pPoint.SpeedMetersPerSecond * 3.6),
      compareSpeed: cSpeed !== undefined ? Math.round(cSpeed) : undefined,
      throttle: Math.round((pPoint.AccelInput / 255) * 100),
      brake: Math.round((pPoint.BrakeInput / 255) * 100),
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  return (
    <div
      ref={containerRef}
      className="glass-panel"
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        height: "360px",
        position: "relative",
      }}
    >
      {/* Header with Legend & Hover Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <span style={{ fontWeight: "bold", color: "var(--text-primary)", fontSize: "0.95rem" }}>
            {t("Speed & Input Delta")}
          </span>
          <span style={{ fontSize: "0.75rem", color: "#00ffaa", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "10px", height: "3px", background: "#00ffaa", display: "inline-block" }} />
            {primaryLapNumber === 0 ? t("Current Session") : `Lap ${primaryLapNumber}`}
          </span>
          {compareLapNumber > 0 && (
            <span style={{ fontSize: "0.75rem", color: "#00f0ff", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "3px", background: "#00f0ff", borderTop: "1px dashed #00f0ff", display: "inline-block" }} />
              vs Lap {compareLapNumber}
            </span>
          )}
        </div>

        {/* Hover Snapshot Badge */}
        {hoverInfo && (
          <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", background: "rgba(0,0,0,0.4)", padding: "0.2rem 0.6rem", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ color: "var(--text-secondary)" }}>{hoverInfo.pct}% | </span>
            <span style={{ color: "#00ffaa" }}>{hoverInfo.primarySpeed} km/h </span>
            {hoverInfo.compareSpeed !== undefined && (
              <span style={{ color: "#00f0ff" }}>
                (vs {hoverInfo.compareSpeed} km/h, Δ {(hoverInfo.primarySpeed - hoverInfo.compareSpeed > 0 ? "+" : "") + (hoverInfo.primarySpeed - hoverInfo.compareSpeed)} km/h)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", width: "100%", height: "100%" }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        />
      </div>
    </div>
  );
};

export default LapDeltaCanvas;
