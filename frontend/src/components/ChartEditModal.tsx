import React, { useState } from 'react';
import { DomainType } from './DynamicChartGrid';
import { CustomChannelItem } from './CustomChannelEditor';
import { evaluateCustomMath } from '../utils/customMathEngine';
import { useSettings } from '../context/SettingsContext';
import { AnalysisDataPoint } from '../context/TelemetryRecorderContext';
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export type ChartType = 'line' | 'bar' | 'histogram' | 'radar' | 'pie';

export interface ChannelConfigItem {
  id: string;
  name: string;
  formula: string;
  color: string;
  strokeWidth: number;
  isDashed: boolean;
}

export interface ChartSlotConfig {
  id: string;
  title: string;
  chartType?: ChartType;
  domain: DomainType;
  channels: ChannelConfigItem[];
}

interface ChartEditModalProps {
  slot: ChartSlotConfig;
  isOpen: boolean;
  onClose: () => void;
  onSaveSlot: (updatedSlot: ChartSlotConfig) => void;
  customChannels: CustomChannelItem[];
  sampleData: AnalysisDataPoint[];
}

const COLOR_SWATCHES = [
  '#00ff00', '#00f0ff', '#ff003c', '#ffaa00', '#7000ff', '#ffffff', '#ff00ea', '#00ffaa'
];

const AVAILABLE_VARIABLES = [
  { key: 'Speed', desc: 'Vehicle Speed (km/h)' },
  { key: 'CompareSpeed', desc: 'Compare Lap Speed (km/h)' },
  { key: 'SpeedDelta', desc: 'Speed Difference Delta' },
  { key: 'RPM', desc: 'Engine RPM' },
  { key: 'Throttle', desc: 'Throttle Input (0-100%)' },
  { key: 'Brake', desc: 'Brake Input (0-100%)' },
  { key: 'Steer', desc: 'Steering Input (-100 to 100%)' },
  { key: 'LatG', desc: 'Lateral Acceleration (G)' },
  { key: 'LonG', desc: 'Longitudinal Acceleration (G)' },
  { key: 'Susp_FL', desc: 'FL Suspension Travel (%)' },
  { key: 'Susp_FR', desc: 'FR Suspension Travel (%)' },
  { key: 'Temp_FL', desc: 'FL Tire Temp (°C)' },
  { key: 'Temp_FR', desc: 'FR Tire Temp (°C)' },
];

export function transformTelemetryData(
  chartType: ChartType,
  domain: DomainType,
  channels: ChannelConfigItem[],
  sampleData: AnalysisDataPoint[],
  customChannels: CustomChannelItem[]
) {
  if (sampleData.length === 0) return [];

  // Helper context generator
  const getContext = (p: AnalysisDataPoint) => {
    const primarySpeedKmh = p.SpeedMetersPerSecond * 3.6;
    const mathCtx: Record<string, number> = {
      Speed: primarySpeedKmh,
      SpeedMetersPerSecond: p.SpeedMetersPerSecond,
      CompareSpeed: primarySpeedKmh * 0.95,
      SpeedDelta: primarySpeedKmh * 0.05,
      RPM: p.CurrentEngineRpm,
      CurrentEngineRpm: p.CurrentEngineRpm,
      Gear: p.Gear,
      Throttle: (p.AccelInput / 255) * 100,
      Brake: (p.BrakeInput / 255) * 100,
      AccelInput: p.AccelInput,
      BrakeInput: p.BrakeInput,
      Steer: (((p as any).SteerInput ?? 0) / 127) * 100,
      LatG: p.AccelerationX / 9.81,
      LonG: p.AccelerationZ / 9.81,
      AccelerationX: p.AccelerationX,
      AccelerationZ: p.AccelerationZ,
      Susp_FL: p.SuspTravel[0] * 100,
      Susp_FR: p.SuspTravel[1] * 100,
      Temp_FL: ((p.TireTemp[0] - 32) * 5) / 9,
      Temp_FR: ((p.TireTemp[1] - 32) * 5) / 9,
    };
    if (customChannels.length > 0) {
      customChannels.forEach(ch => {
        mathCtx[ch.name] = evaluateCustomMath(ch.formula, mathCtx);
      });
    }
    return mathCtx;
  };

  // MODE 1: PIE CHART (Gear Usage Ratio or Throttle Ratio)
  if (chartType === 'pie') {
    const counts: Record<string, number> = {};
    sampleData.forEach(p => {
      const gKey = `Gear ${p.Gear}`;
      counts[gKey] = (counts[gKey] || 0) + 1;
    });
    return Object.keys(counts).map((key, idx) => ({
      name: key,
      value: counts[key],
      color: COLOR_SWATCHES[idx % COLOR_SWATCHES.length]
    }));
  }

  // MODE 2: HISTOGRAM (Binning Distribution of primary channel)
  if (chartType === 'histogram') {
    const primaryCh = channels[0] || { formula: 'Throttle' };
    const values = sampleData.map(p => evaluateCustomMath(primaryCh.formula, getContext(p)));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const binsCount = 5;
    const binWidth = Math.max(1, (maxVal - minVal) / binsCount);

    const bins = Array.from({ length: binsCount }, (_, i) => ({
      range: `${(minVal + i * binWidth).toFixed(0)}-${(minVal + (i + 1) * binWidth).toFixed(0)}`,
      count: 0
    }));

    values.forEach(v => {
      let bIdx = Math.floor((v - minVal) / binWidth);
      if (bIdx >= binsCount) bIdx = binsCount - 1;
      if (bIdx < 0) bIdx = 0;
      bins[bIdx].count++;
    });

    return bins.map(b => ({ xDomain: b.range, Frequency: b.count }));
  }

  // MODE 3: RADAR CHART (Multi-Wheel / Vehicle Dynamic Balance)
  if (chartType === 'radar') {
    const averages: Record<string, number> = {};
    channels.forEach(ch => averages[ch.name] = 0);

    sampleData.forEach(p => {
      const ctx = getContext(p);
      channels.forEach(ch => {
        averages[ch.name] += evaluateCustomMath(ch.formula, ctx);
      });
    });

    return channels.map(ch => ({
      metric: ch.name,
      value: Number((averages[ch.name] / sampleData.length).toFixed(2))
    }));
  }

  // MODE 4 & 5: LINE & BAR CHART (TimeSeries / Distance Domain)
  const step = Math.max(1, Math.floor(sampleData.length / 200));
  return sampleData.filter((_, idx) => idx % step === 0).map(p => {
    let xVal = p.time;
    if (domain === 'distance') {
      xVal = Number((p.lap_distance ?? p.time * 20).toFixed(1));
    } else if (domain === 'lap') {
      xVal = p.LapNumber ?? 1;
    } else {
      xVal = Number(p.time.toFixed(1));
    }

    const ctx = getContext(p);
    const row: Record<string, any> = { xDomain: xVal };
    channels.forEach(ch => {
      row[ch.name] = Number(evaluateCustomMath(ch.formula, ctx).toFixed(2));
    });
    return row;
  });
}

const ChartEditModal: React.FC<ChartEditModalProps> = ({
  slot,
  isOpen,
  onClose,
  onSaveSlot,
  customChannels,
  sampleData
}) => {
  const { t } = useSettings();
  const [title, setTitle] = useState(slot.title);
  const [chartType, setChartType] = useState<ChartType>(slot.chartType || 'line');
  const [domain, setDomain] = useState<DomainType>(slot.domain);
  const [channels, setChannels] = useState<ChannelConfigItem[]>(slot.channels || []);

  React.useEffect(() => {
    setTitle(slot.title);
    setChartType(slot.chartType || 'line');
    setDomain(slot.domain);
    setChannels(slot.channels || []);
  }, [slot]);

  if (!isOpen) return null;

  const handleAddChannel = () => {
    const newCh: ChannelConfigItem = {
      id: `ch_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: `Channel ${channels.length + 1}`,
      formula: 'Speed',
      color: COLOR_SWATCHES[channels.length % COLOR_SWATCHES.length],
      strokeWidth: 2,
      isDashed: false
    };
    setChannels([...channels, newCh]);
  };

  const handleUpdateChannel = (index: number, updated: Partial<ChannelConfigItem>) => {
    const next = [...channels];
    next[index] = { ...next[index], ...updated };
    setChannels(next);
  };

  const handleRemoveChannel = (index: number) => {
    setChannels(channels.filter((_, idx) => idx !== index));
  };

  const handleSave = () => {
    onSaveSlot({
      ...slot,
      title: title.trim() || 'Custom Chart',
      chartType,
      domain,
      channels
    });
    onClose();
  };

  const previewData = transformTelemetryData(chartType, domain, channels, sampleData, customChannels);
  const xUnit = domain === 'distance' ? 'm' : domain === 'lap' ? 'Lap' : 's';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '1100px', height: '85vh',
        display: 'flex', flexDirection: 'column', padding: '1.5rem', gap: '1rem',
        border: '1px solid var(--primary)', boxShadow: '0 10px 40px rgba(0,0,0,0.8)'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
          <h3 style={{ color: 'var(--primary)', margin: 0 }}>{t("Chart Configuration & Live Preview")}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Two-Column Body */}
        <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
          
          {/* LEFT COLUMN: Settings & Channel Sub-cards (55%) */}
          <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
            
            {/* General Settings */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: '6px', display: 'flex', gap: '0.75rem' }}>
              <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Chart Title")}:</span>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Chart Type")}:</span>
                <select value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)} style={selectStyle}>
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="histogram">Histogram (Binning)</option>
                  <option value="radar">Radar (Spider)</option>
                  <option value="pie">Pie (Ratio)</option>
                </select>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("X-Domain")}:</span>
                <select value={domain} onChange={(e) => setDomain(e.target.value as DomainType)} style={selectStyle}>
                  <option value="distance">Distance (m)</option>
                  <option value="time">Time (s)</option>
                  <option value="lap">Lap Domain</option>
                </select>
              </div>
            </div>

            {/* Channels Header & Add Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                {t("Channel Lines List")} ({channels.length})
              </span>
              <button
                type="button"
                onClick={handleAddChannel}
                style={{ ...btnStyle, background: 'var(--primary)', color: '#000', padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                + {t("Add Channel Line")}
              </button>
            </div>

            {/* Per-Channel Sub-cards */}
            {channels.map((ch, idx) => (
              <div key={ch.id} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderLeft: `4px solid ${ch.color}`, borderRadius: '6px', padding: '0.75rem',
                display: 'flex', flexDirection: 'column', gap: '0.6rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: ch.color }}>Line #{idx + 1} ({ch.name})</span>
                  <button onClick={() => handleRemoveChannel(idx)} style={{ background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>×</button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" placeholder="Channel Label" value={ch.name} onChange={(e) => handleUpdateChannel(idx, { name: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                  <select onChange={(e) => { if (e.target.value) handleUpdateChannel(idx, { formula: e.target.value }); }} style={{ ...selectStyle, flex: 1.2 }} value="">
                    <option value="">-- Autocomplete Quick Select --</option>
                    {AVAILABLE_VARIABLES.map(v => (<option key={v.key} value={v.key}>{v.key} ({v.desc})</option>))}
                  </select>
                </div>

                <input type="text" placeholder="Formula (e.g. Speed * 3.6)" value={ch.formula} onChange={(e) => handleUpdateChannel(idx, { formula: e.target.value })} style={{ ...inputStyle, fontFamily: 'monospace', color: 'var(--secondary)' }} />

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    {COLOR_SWATCHES.map(c => (
                      <div key={c} onClick={() => handleUpdateChannel(idx, { color: c })} style={{ width: '16px', height: '16px', borderRadius: '50%', background: c, border: ch.color === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.5)', cursor: 'pointer' }} />
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.7rem', color: '#888' }}>Width:</span>
                    <select value={ch.strokeWidth} onChange={(e) => handleUpdateChannel(idx, { strokeWidth: parseInt(e.target.value) })} style={{ ...selectStyle, padding: '0.15rem 0.3rem', width: 'auto' }}>
                      <option value={1}>1px</option><option value={2}>2px</option><option value={3}>3px</option><option value={4}>4px</option>
                    </select>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#ccc', cursor: 'pointer' }}>
                    <input type="checkbox" checked={ch.isDashed} onChange={(e) => handleUpdateChannel(idx, { isDashed: e.target.checked })} /> Dashed
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT COLUMN: Realtime Multi-Chart Live Preview (45%) */}
          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>Live Preview: {title || 'Untitled'} ({chartType.toUpperCase()})</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Domain: {domain}</span>
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'pie' ? (
                  <PieChart>
                    <Pie data={previewData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label>
                      {previewData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLOR_SWATCHES[index % COLOR_SWATCHES.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                    <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: '0.75rem' }} />
                  </PieChart>
                ) : chartType === 'radar' ? (
                  <RadarChart cx="50%" cy="50%" outerRadius={70} data={previewData}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis dataKey="metric" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                    <PolarRadiusAxis stroke="var(--text-secondary)" tick={{ fontSize: 8 }} />
                    <Radar name={title} dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.4} />
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                  </RadarChart>
                ) : chartType === 'histogram' ? (
                  <BarChart data={previewData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="xDomain" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                    <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                    <Bar dataKey="Frequency" fill="var(--primary)" />
                  </BarChart>
                ) : chartType === 'bar' ? (
                  <BarChart data={previewData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
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
                  <LineChart data={previewData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="xDomain" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} unit={xUnit} />
                    <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                    <Legend verticalAlign="top" height={26} iconSize={10} wrapperStyle={{ fontSize: '0.75rem' }} />
                    {channels.map(ch => (
                      <Line key={ch.id} isAnimationActive={false} type="monotone" dataKey={ch.name} name={ch.name} stroke={ch.color} strokeWidth={ch.strokeWidth} strokeDasharray={ch.isDashed ? '4 4' : undefined} dot={false} />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.75rem' }}>
          <button onClick={onClose} style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>{t("Cancel")}</button>
          <button onClick={handleSave} style={{ ...btnStyle, background: 'var(--primary)', color: '#000' }}>{t("Save Configuration")}</button>
        </div>

      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '0.35rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', width: '100%', boxSizing: 'border-box'
};
const selectStyle: React.CSSProperties = {
  background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '0.35rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', width: '100%'
};
const btnStyle: React.CSSProperties = {
  padding: '0.4rem 1rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', border: 'none'
};

export default ChartEditModal;
