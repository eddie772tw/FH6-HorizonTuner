import React, { useRef, useEffect, useState, useMemo } from 'react';
import { simplifyPathRDP, Point2D } from '../utils/rdpSimplifier';

export interface TrackPoint extends Point2D {
  val: number;        // Normalized metric value (0.0 to 1.0)
  raw: any;           // Original raw telemetry data point
}

interface TrackMapCanvasProps {
  data: TrackPoint[];
  fullTrackData?: TrackPoint[]; // Full circuit track data for base layer
  currentPlaybackIndex?: number;
  selectedMetricLabel?: string;
  isRecording?: boolean;
  isSavedSession?: boolean;      // True when viewing loaded/history saved sessions
  onPointHover?: (point: any | null) => void;
}

const TrackMapCanvas: React.FC<TrackMapCanvasProps> = ({
  data,
  fullTrackData,
  currentPlaybackIndex = -1,
  selectedMetricLabel = 'Speed',
  isRecording = false,
  isSavedSession = false,
  onPointHover
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<TrackPoint | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // In Freeroam (isRecording === false && isSavedSession === false), retain only past 30s
  // In Saved/Loaded Sessions or Recording Mode, render full complete path!
  const filteredData = useMemo(() => {
    if (isRecording || isSavedSession || data.length === 0) return data;
    const latestTime = data[data.length - 1]?.raw?.time ?? 0;
    const cutoffTime = latestTime - 30.0;
    
    let startIndex = 0;
    for (let i = 0; i < data.length; i++) {
      if ((data[i].raw?.time ?? 0) >= cutoffTime) {
        startIndex = i;
        break;
      }
    }
    return data.slice(startIndex);
  }, [data, isRecording, isSavedSession]);

  // RDP Simplification for active path
  const simplifiedActiveData = useMemo(() => {
    if (filteredData.length <= 100) return filteredData;
    return simplifyPathRDP(filteredData, 0.3);
  }, [filteredData]);

  // RDP Simplification for full circuit base path
  const simplifiedBaseData = useMemo(() => {
    const baseSource = (fullTrackData && fullTrackData.length > 0) ? fullTrackData : filteredData;
    if (baseSource.length <= 100) return baseSource;
    return simplifyPathRDP(baseSource, 0.3);
  }, [fullTrackData, filteredData]);

  // Compute Bounding Box from Base Circuit Data to keep canvas scale stable
  const bounds = useMemo(() => {
    const source = simplifiedBaseData.length > 0 ? simplifiedBaseData : simplifiedActiveData;
    if (source.length === 0) return { minX: 0, maxX: 1, minZ: 0, maxZ: 1, width: 1, height: 1 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of source) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxZ - minZ);
    return { minX, maxX, minZ, maxZ, width, height };
  }, [simplifiedBaseData, simplifiedActiveData]);

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

  // Render Canvas with Dual-Layer Architecture & Heading Arrow
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (simplifiedActiveData.length === 0 && simplifiedBaseData.length === 0)) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Grid Background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < rect.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // LAYER 1: Base Full Circuit Track Path
    if (simplifiedBaseData.length > 1) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      const firstC = worldToCanvas(simplifiedBaseData[0].x, simplifiedBaseData[0].z, rect.width, rect.height);
      ctx.moveTo(firstC.cx, firstC.cy);
      for (let i = 1; i < simplifiedBaseData.length; i++) {
        const c = worldToCanvas(simplifiedBaseData[i].x, simplifiedBaseData[i].z, rect.width, rect.height);
        ctx.lineTo(c.cx, c.cy);
      }
      ctx.stroke();
    }

    // LAYER 2: Active Lap Metric Rainbow Vector Line Path
    if (simplifiedActiveData.length > 1) {
      ctx.lineWidth = 4;
      for (let i = 0; i < simplifiedActiveData.length - 1; i++) {
        const p1 = simplifiedActiveData[i];
        const p2 = simplifiedActiveData[i + 1];

        const c1 = worldToCanvas(p1.x, p1.z, rect.width, rect.height);
        const c2 = worldToCanvas(p2.x, p2.z, rect.width, rect.height);

        ctx.beginPath();
        ctx.moveTo(c1.cx, c1.cy);
        ctx.lineTo(c2.cx, c2.cy);

        ctx.strokeStyle = getHeatmapColor(p1.val);
        ctx.stroke();
      }
    }

    // LAYER 3: Current Vehicle Position Marker with Heading Arrow Indicator
    const targetCarIdx = currentPlaybackIndex >= 0 ? currentPlaybackIndex : filteredData.length - 1;
    if (targetCarIdx >= 0 && filteredData[targetCarIdx]) {
      const carP = filteredData[targetCarIdx];
      const carC = worldToCanvas(carP.x, carP.z, rect.width, rect.height);

      let headingAngle = carP.raw?.Yaw ?? 0.0;
      if (headingAngle === 0 && targetCarIdx > 0) {
        const prevP = filteredData[targetCarIdx - 1];
        headingAngle = Math.atan2(carP.z - prevP.z, carP.x - prevP.x);
      }

      ctx.beginPath();
      ctx.arc(carC.cx, carC.cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.3)';
      ctx.fill();

      ctx.save();
      ctx.translate(carC.cx, carC.cy);
      ctx.rotate(headingAngle);

      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -6);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 6);
      ctx.closePath();

      ctx.fillStyle = '#00f0ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [simplifiedActiveData, simplifiedBaseData, bounds, currentPlaybackIndex, filteredData]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || filteredData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let closestDist = Infinity;
    let closestPoint: TrackPoint | null = null;

    const source = simplifiedActiveData.length > 0 ? simplifiedActiveData : simplifiedBaseData;

    for (const p of source) {
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
