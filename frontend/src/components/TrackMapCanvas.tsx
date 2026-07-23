import React, { useRef, useEffect, useState, useMemo } from 'react';
import { simplifyPathRDP, Point2D } from '../utils/rdpSimplifier';

export interface TrackPoint extends Point2D {
  val: number;        // Normalized metric value (0.0 to 1.0)
  raw: any;           // Original raw telemetry data point
}

interface TrackMapCanvasProps {
  data: TrackPoint[];
  currentPlaybackIndex?: number;
  selectedMetricLabel?: string;
  onPointHover?: (point: any | null) => void;
}

const TrackMapCanvas: React.FC<TrackMapCanvasProps> = ({
  data,
  currentPlaybackIndex = -1,
  selectedMetricLabel = 'Speed',
  onPointHover
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<TrackPoint | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // RDP Vector Line Simplification for super fast rendering
  const simplifiedData = useMemo(() => {
    if (data.length <= 100) return data;
    return simplifyPathRDP(data, 0.3); // 0.3m tolerance
  }, [data]);

  // Compute Bounding Box
  const bounds = useMemo(() => {
    if (simplifiedData.length === 0) return { minX: 0, maxX: 1, minZ: 0, maxZ: 1, width: 1, height: 1 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of simplifiedData) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxZ - minZ);
    return { minX, maxX, minZ, maxZ, width, height };
  }, [simplifiedData]);

  // Map world (x, z) to Canvas pixel coordinates
  const worldToCanvas = (x: number, z: number, canvasWidth: number, canvasHeight: number) => {
    const padding = 40;
    const availWidth = canvasWidth - padding * 2;
    const availHeight = canvasHeight - padding * 2;

    const scale = Math.min(availWidth / bounds.width, availHeight / bounds.height);
    const cx = padding + (x - bounds.minX) * scale + (availWidth - bounds.width * scale) / 2;
    const cy = padding + (z - bounds.minZ) * scale + (availHeight - bounds.height * scale) / 2;

    return { cx, cy };
  };

  const getHeatmapColor = (val: number) => {
    const hue = (1 - Math.max(0, Math.min(1, val))) * 240;
    return `hsl(${hue}, 100%, 50%)`;
  };

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || simplifiedData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Adapt device pixel ratio for High-DPI screens
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw Track Grid Background Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < rect.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
    }

    // Draw Continuous Rainbow Vector Line Path
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;

    for (let i = 0; i < simplifiedData.length - 1; i++) {
      const p1 = simplifiedData[i];
      const p2 = simplifiedData[i + 1];

      const c1 = worldToCanvas(p1.x, p1.z, rect.width, rect.height);
      const c2 = worldToCanvas(p2.x, p2.z, rect.width, rect.height);

      ctx.beginPath();
      ctx.moveTo(c1.cx, c1.cy);
      ctx.lineTo(c2.cx, c2.cy);

      ctx.strokeStyle = getHeatmapColor(p1.val);
      ctx.stroke();
    }

    // Draw Current Playback Car Marker
    if (currentPlaybackIndex >= 0 && data[currentPlaybackIndex]) {
      const carP = data[currentPlaybackIndex];
      const carC = worldToCanvas(carP.x, carP.z, rect.width, rect.height);

      // Outer glow pulse
      ctx.beginPath();
      ctx.arc(carC.cx, carC.cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 0, 60, 0.3)';
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(carC.cx, carC.cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#00f0ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }, [simplifiedData, bounds, currentPlaybackIndex, data]);

  // Handle Mouse Move for Hover Detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let closestDist = Infinity;
    let closestPoint: TrackPoint | null = null;

    for (const p of simplifiedData) {
      const c = worldToCanvas(p.x, p.z, rect.width, rect.height);
      const dist = Math.hypot(c.cx - mouseX, c.cy - mouseY);
      if (dist < closestDist && dist < 20) {
        closestDist = dist;
        closestPoint = p;
      }
    }

    if (closestPoint) {
      setHoveredPoint(closestPoint);
      setHoverPos({ x: mouseX, y: mouseY });
      if (onPointHover) onPointHover(closestPoint.raw);
    } else {
      setHoveredPoint(null);
      setHoverPos(null);
      if (onPointHover) onPointHover(null);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredPoint(null); setHoverPos(null); }}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      />

      {/* Hover Tooltip Overlay */}
      {hoveredPoint && hoverPos && (
        <div style={{
          position: 'absolute',
          left: hoverPos.x + 12,
          top: hoverPos.y - 12,
          background: 'rgba(10, 10, 18, 0.95)',
          border: '1px solid var(--primary)',
          borderRadius: '6px',
          padding: '0.5rem 0.75rem',
          fontSize: '0.8rem',
          color: '#fff',
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: 10
        }}>
          <div><strong>{selectedMetricLabel}:</strong> {(hoveredPoint.val * 100).toFixed(0)}%</div>
          <div>Time: {hoveredPoint.raw?.time?.toFixed(1) ?? 0}s</div>
          <div>Speed: {((hoveredPoint.raw?.SpeedMetersPerSecond ?? 0) * 3.6).toFixed(1)} km/h</div>
        </div>
      )}
    </div>
  );
};

export default TrackMapCanvas;
