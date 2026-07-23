import React from 'react';
import { AnalysisDataPoint } from '../context/TelemetryRecorderContext';
import { CustomChannelItem } from './CustomChannelEditor';
import { useSettings } from '../context/SettingsContext';
import { ChannelConfigItem, ChartType, transformTelemetryData } from './ChartEditModal';
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export type DomainType = 'time' | 'distance' | 'lap';

export interface ChartSlotConfig {
  id: string;
  title: string;
  chartType?: ChartType;
  domain: DomainType;
  channels: ChannelConfigItem[];
}

interface DynamicChartGridProps {
  slots: ChartSlotConfig[];
  onOpenEditModal: (slotIndex: number) => void;
  activeSession: AnalysisDataPoint[];
  compareSessionData: AnalysisDataPoint[];
  customChannels: CustomChannelItem[];
  isRecording?: boolean;
}

const COLOR_SWATCHES = [
  '#00ff00', '#00f0ff', '#ff003c', '#ffaa00', '#7000ff', '#ffffff', '#ff00ea', '#00ffaa'
];

export const DEFAULT_CHART_SLOTS: ChartSlotConfig[] = [
  {
    id: 'slot_1',
    title: 'Lap Delta & Speed Comparison',
    chartType: 'line',
    domain: 'distance',
    channels: [
      { id: 'c1', name: 'Speed', formula: 'Speed', color: '#00ff00', strokeWidth: 2, isDashed: false },
      { id: 'c2', name: 'CompareSpeed', formula: 'CompareSpeed', color: '#00f0ff', strokeWidth: 2, isDashed: true },
      { id: 'c3', name: 'SpeedDelta', formula: 'SpeedDelta', color: '#ff003c', strokeWidth: 2, isDashed: false },
    ]
  },
  {
    id: 'slot_2',
    title: 'Driver Inputs (Throttle / Brake / Gear)',
    chartType: 'line',
    domain: 'time',
    channels: [
      { id: 'c4', name: 'Throttle', formula: 'Throttle', color: '#00ff00', strokeWidth: 2, isDashed: false },
      { id: 'c5', name: 'Brake', formula: 'Brake', color: '#ff003c', strokeWidth: 2, isDashed: false },
    ]
  },
  {
    id: 'slot_3',
    title: 'Cornering G-Force Dynamics',
    chartType: 'radar',
    domain: 'distance',
    channels: [
      { id: 'c6', name: 'LatG', formula: 'LatG', color: '#ffaa00', strokeWidth: 2, isDashed: false },
      { id: 'c7', name: 'LonG', formula: 'LonG', color: '#7000ff', strokeWidth: 2, isDashed: false },
    ]
  },
  {
    id: 'slot_4',
    title: 'Gear Usage Ratio',
    chartType: 'pie',
    domain: 'time',
    channels: [
      { id: 'c8', name: 'Gear', formula: 'Gear', color: '#00f0ff', strokeWidth: 2, isDashed: false }
    ]
  }
];

const DynamicChartGrid: React.FC<DynamicChartGridProps> = ({
  slots,
  onOpenEditModal,
  activeSession,
  customChannels,
  isRecording = false
}) => {
  const { t } = useSettings();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(48%, 1fr))', gap: '1rem', width: '100%' }}>
      {slots.map((slot, sIdx) => {
        const cType: ChartType = slot.chartType || 'line';
        const chartData = transformTelemetryData(cType, slot.domain, slot.channels || [], activeSession, customChannels);
        const xUnit = slot.domain === 'distance' ? 'm' : slot.domain === 'lap' ? 'Lap' : 's';
        const channels = slot.channels || [];

        return (
          <div key={slot.id} className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '340px' }}>
            
            {/* Clean Card Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                {slot.title} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({cType.toUpperCase()})</span>
              </span>

              <button
                onClick={() => onOpenEditModal(sIdx)}
                style={{
                  background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px',
                  padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                {t("Settings / Edit")}
              </button>
            </div>

            {/* Race Performance Mode Indicator */}
            {isRecording ? (
              <div style={{
                flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
                background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)',
                color: 'var(--text-secondary)', fontSize: '0.85rem'
              }}>
                [ {t("Recording Telemetry... Charts paused to optimize performance")} ]
              </div>
            ) : (
              /* Multi-Chart Type Render */
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {cType === 'pie' ? (
                    <PieChart>
                      <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label>
                        {chartData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLOR_SWATCHES[index % COLOR_SWATCHES.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                      <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: '0.75rem' }} />
                    </PieChart>
                  ) : cType === 'radar' ? (
                    <RadarChart cx="50%" cy="50%" outerRadius={70} data={chartData}>
                      <PolarGrid stroke="rgba(255,255,255,0.1)" />
                      <PolarAngleAxis dataKey="metric" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                      <PolarRadiusAxis stroke="var(--text-secondary)" tick={{ fontSize: 8 }} />
                      <Radar name={slot.title} dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.4} />
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                    </RadarChart>
                  ) : cType === 'histogram' ? (
                    <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="xDomain" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                      <Bar dataKey="Frequency" fill="var(--primary)" />
                    </BarChart>
                  ) : cType === 'bar' ? (
                    <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="xDomain" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} unit={xUnit} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                      <Legend verticalAlign="top" height={26} iconSize={10} wrapperStyle={{ fontSize: '0.75rem' }} />
                      {channels.map(ch => (
                        <Bar key={ch.id} dataKey={ch.name} fill={ch.color} />
                      ))}
                    </BarChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="xDomain" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} unit={xUnit} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                      <Legend verticalAlign="top" height={26} iconSize={10} wrapperStyle={{ fontSize: '0.75rem' }} />
                      {channels.map(ch => (
                        <Line key={ch.id} isAnimationActive={false} type="monotone" dataKey={ch.name} name={ch.name} stroke={ch.color || '#00ff00'} strokeWidth={ch.strokeWidth || 2} strokeDasharray={ch.isDashed ? '4 4' : undefined} dot={false} />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DynamicChartGrid;
