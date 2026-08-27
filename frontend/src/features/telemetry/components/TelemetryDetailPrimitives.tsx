import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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

export const TrendChart: React.FC<{
  title: string;
  data: TelemetryChartPoint[];
  lines: ChartLine[];
  emptyLabel: string;
}> = ({ title, data, lines, emptyLabel }) => (
  <div className="telemetry-detail-view__chart glass-panel p-2">
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h4 className="fs-6 text-primary m-0">{title}</h4>
      <span className="text-body-secondary fs-8">30 s</span>
    </div>
    {data.length === 0 || !data.some((point) => lines.some((line) => point[line.dataKey] !== null)) ? (
      <div className="telemetry-detail-view__empty text-body-secondary">{emptyLabel}</div>
    ) : (
      <div className="telemetry-detail-view__chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="var(--divider)" strokeDasharray="3 3" />
            <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{ fontSize: 10 }} unit="s" />
            <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
              labelFormatter={(value) => `${value} s`}
            />
            <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
            {lines.map((line) => (
              <Line key={line.dataKey} type="monotone" dataKey={line.dataKey} name={line.label} stroke={line.color} dot={false} strokeWidth={2} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
);
