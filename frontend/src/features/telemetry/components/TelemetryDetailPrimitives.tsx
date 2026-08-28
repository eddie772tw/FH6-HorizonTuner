import React, { useEffect, useRef, useState } from 'react';
import { radiansToDegrees } from '../telemetryDetailMath';
import type { TelemetryChartPoint } from '../telemetryDetailMath';

export interface ChartLine {
  dataKey: string;
  label: string;
  color: string;
}

export const numberOrNull = (value: number | undefined | null): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

export const formatValue = (value: number | null | undefined, digits = 2): string => (
  numberOrNull(value) === null ? '--' : Number(value).toFixed(digits)
);

export const formatPercent = (value: number | null | undefined): string => (
  numberOrNull(value) === null ? '--' : `${(Number(value) * 100).toFixed(0)}%`
);

export const formatDegrees = (value: number | null | undefined): string => {
  const degrees = radiansToDegrees(numberOrNull(value));
  return degrees === null ? '--' : `${formatValue(degrees, 1)}°`;
};

export const formatRaceTime = (seconds: number | null | undefined): string => {
  const value = numberOrNull(seconds);
  if (value === null || value <= 0) return '--:--.---';
  const minutes = Math.floor(value / 60);
  const remainingSeconds = Math.floor(value % 60);
  const milliseconds = Math.floor((value % 1) * 1000);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

export const Metric: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-body' }) => (
  <div className="telemetry-detail-view__metric">
    <span className="text-body-secondary fs-8 text-uppercase">{label}</span>
    <strong className={`font-monospace fs-5 ${tone}`}>{value}</strong>
  </div>
);

interface ChartTheme {
  divider: string;
  text: string;
}

interface ChartLayout {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  plotWidth: number;
  plotHeight: number;
  min: number;
  max: number;
}

interface ChartHover {
  x: number;
  y: number;
  index: number;
}

const EMPTY_CHART_THEME: ChartTheme = {
  divider: 'rgba(255, 255, 255, 0.08)',
  text: 'rgba(255, 255, 255, 0.65)',
};

const getCssVariable = (style: CSSStyleDeclaration, name: string, fallback: string): string => (
  style.getPropertyValue(name).trim() || fallback
);

const resolveColor = (color: string, style: CSSStyleDeclaration): string => {
  const match = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(color.trim());
  if (!match) return color;
  return getCssVariable(style, match[1], match[2] ?? 'rgba(255, 255, 255, 0.8)');
};

const hasChartValues = (data: readonly TelemetryChartPoint[], lines: readonly ChartLine[]): boolean => {
  for (let dataIndex = 0; dataIndex < data.length; dataIndex += 1) {
    const point = data[dataIndex];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const value = point[lines[lineIndex].dataKey];
      if (typeof value === 'number' && Number.isFinite(value)) return true;
    }
  }
  return false;
};

const createChartLayout = (
  data: readonly TelemetryChartPoint[],
  lines: readonly ChartLine[],
  width: number,
  height: number,
): ChartLayout => {
  const left = 42;
  const right = 12;
  const top = 12;
  const bottom = 26;
  let min = Infinity;
  let max = -Infinity;

  for (let dataIndex = 0; dataIndex < data.length; dataIndex += 1) {
    const point = data[dataIndex];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const value = point[lines[lineIndex].dataKey];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    min -= padding;
    max += padding;
  } else {
    const padding = (max - min) * 0.08;
    min -= padding;
    max += padding;
  }

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth: Math.max(1, width - left - right),
    plotHeight: Math.max(1, height - top - bottom),
    min,
    max,
  };
};

const drawChart = (
  context: CanvasRenderingContext2D,
  data: readonly TelemetryChartPoint[],
  lines: readonly ChartLine[],
  layout: ChartLayout,
  theme: ChartTheme,
  style: CSSStyleDeclaration,
): void => {
  const { width, height, left, top, plotWidth, plotHeight, min, max } = layout;
  context.clearRect(0, 0, width, height);
  context.font = '10px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.fillStyle = theme.text;
  context.strokeStyle = theme.divider;
  context.lineWidth = 1;
  context.setLineDash([3, 4]);

  context.beginPath();
  for (let gridIndex = 0; gridIndex <= 4; gridIndex += 1) {
    const ratio = gridIndex / 4;
    const y = top + plotHeight * ratio;
    context.moveTo(left, y);
    context.lineTo(width - layout.right, y);
    context.fillText(formatValue(max - (max - min) * ratio, 2), left - 6, y);
  }
  for (let gridIndex = 0; gridIndex <= 4; gridIndex += 1) {
    const x = left + plotWidth * (gridIndex / 4);
    context.moveTo(x, top);
    context.lineTo(x, top + plotHeight);
  }
  context.stroke();
  context.setLineDash([]);

  context.textAlign = 'center';
  const lastTime = data.length > 0 ? data[data.length - 1].time : 0;
  for (let labelIndex = 0; labelIndex <= 2; labelIndex += 1) {
    const ratio = labelIndex / 2;
    const x = left + plotWidth * ratio;
    context.fillText(formatValue(lastTime * ratio, 1), x, height - 10);
  }

  const range = max - min || 1;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 2;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    context.strokeStyle = resolveColor(line.color, style);
    context.beginPath();
    let started = false;
    for (let dataIndex = 0; dataIndex < data.length; dataIndex += 1) {
      const value = data[dataIndex][line.dataKey];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const x = left + (data.length <= 1 ? 0 : dataIndex / (data.length - 1)) * plotWidth;
      const y = top + (1 - (value - min) / range) * plotHeight;
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }
    if (started) context.stroke();
  }
};

export const TrendChart: React.FC<{
  title: string;
  data: TelemetryChartPoint[];
  lines: ChartLine[];
  emptyLabel: string;
}> = React.memo(({ title, data, lines, emptyLabel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<readonly TelemetryChartPoint[]>(data);
  const linesRef = useRef<readonly ChartLine[]>(lines);
  const hasDataRef = useRef(hasChartValues(data, lines));
  const themeRef = useRef<ChartTheme>(EMPTY_CHART_THEME);
  const styleRef = useRef<CSSStyleDeclaration | null>(null);
  const layoutRef = useRef<ChartLayout | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const [hover, setHover] = useState<ChartHover | null>(null);
  const hasData = hasChartValues(data, lines);

  useEffect(() => {
    dataRef.current = data;
    linesRef.current = lines;
    hasDataRef.current = hasChartValues(data, lines);
    setHover(null);
    drawRef.current();
  }, [data, lines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const updateTheme = () => {
      const style = getComputedStyle(document.documentElement);
      styleRef.current = style;
      themeRef.current = {
        divider: getCssVariable(style, '--divider', EMPTY_CHART_THEME.divider),
        text: getCssVariable(style, '--text-secondary', EMPTY_CHART_THEME.text),
      };
      drawRef.current();
    };

    const render = () => {
      const width = canvas.clientWidth || container.clientWidth;
      const height = canvas.clientHeight || container.clientHeight;
      if (width <= 0 || height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.floor(width * dpr);
      const pixelHeight = Math.floor(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const layout = createChartLayout(dataRef.current, linesRef.current, width, height);
      layoutRef.current = layout;
      if (!hasDataRef.current) {
        context.clearRect(0, 0, width, height);
        return;
      }
      drawChart(context, dataRef.current, linesRef.current, layout, themeRef.current, styleRef.current ?? getComputedStyle(document.documentElement));
    };

    drawRef.current = render;
    updateTheme();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
      render();
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'style'] });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [hasData]);

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current;
    if (!layout || !hasDataRef.current || data.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(layout.left, Math.min(layout.left + layout.plotWidth, event.clientX - rect.left));
    const ratio = layout.plotWidth <= 0 ? 0 : (x - layout.left) / layout.plotWidth;
    const index = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
    setHover({ x, y: event.clientY - rect.top, index });
  };

  const hoveredPoint = hover ? data[hover.index] : undefined;
  return (
    <div className="telemetry-detail-view__chart glass-panel p-2" onMouseLeave={() => setHover(null)}>
      <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
        <h4 className="fs-6 text-primary m-0 text-truncate">{title}</h4>
        <span className="text-body-secondary fs-8 flex-shrink-0">30 s</span>
      </div>
      {!hasData ? (
        <div className="telemetry-detail-view__empty text-body-secondary">{emptyLabel}</div>
      ) : (
        <div ref={containerRef} className="telemetry-detail-view__chart-canvas position-relative">
          <canvas
            ref={canvasRef}
            className="w-100 h-100 d-block"
            role="img"
            aria-label={title}
            onMouseMove={handleMouseMove}
          />
          {hoveredPoint && hover && (
            <div
              className="telemetry-detail-view__chart-tooltip glass-panel"
              style={{ left: Math.min(hover.x + 10, layoutRef.current ? layoutRef.current.width - 170 : hover.x + 10), top: Math.max(4, hover.y - 44) }}
            >
              <div className="font-monospace text-body-secondary fs-8 mb-1">{formatValue(hoveredPoint.time, 1)} s</div>
              {lines.map((line) => (
                <div key={line.dataKey} className="d-flex justify-content-between gap-3 fs-8">
                  <span style={{ color: line.color }}>{line.label}</span>
                  <strong className="font-monospace">{formatValue(hoveredPoint[line.dataKey])}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {hasData && (
        <div className="telemetry-detail-view__chart-legend d-flex flex-wrap gap-2 mt-1" aria-label="Chart legend">
          {lines.map((line) => (
            <span key={line.dataKey} className="d-inline-flex align-items-center gap-1 fs-8 text-body-secondary">
              <span className="telemetry-detail-view__chart-legend-swatch" style={{ background: line.color }} />
              {line.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
