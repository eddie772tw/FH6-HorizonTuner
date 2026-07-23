import React, { useState, useEffect, useMemo } from 'react';
import { useTelemetryRecorder, AnalysisDataPoint, LapSummary } from '../context/TelemetryRecorderContext';
import { useSettings } from '../context/SettingsContext';
import TrackMapCanvas from './TrackMapCanvas';
import { evaluateCustomMath } from '../utils/customMathEngine';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

type MetricType = 'speed' | 'throttle' | 'brake' | 'grip' | 'suspension';

const AnalysisView: React.FC = () => {
  const {
    isRecording,
    recordingCount,
    currentSession,
    loadedSession,
    savedSessions,
    setLoadedSession,
    fetchCurrentSessionData,
    loadSavedSession,
    loadSessionLaps,
    deleteSavedSession,
    exportMoTecCsv,
    loadAnalysisConfig,
    saveAnalysisConfig
  } = useTelemetryRecorder();

  const { t } = useSettings();
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('speed');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState<string>('current');

  // Laps & Lap Comparison state
  const [lapsList, setLapsList] = useState<LapSummary[]>([]);
  const [primaryLap, setPrimaryLap] = useState<number>(0); // 0 = All Laps
  const [compareLap, setCompareLap] = useState<number>(-1); // -1 = None
  const [compareSessionData, setCompareSessionData] = useState<AnalysisDataPoint[]>([]);

  // Custom Math Channel state
  const [customFormula, setCustomFormula] = useState<string>('Speed * 3.6');
  const [customFormulaName, setCustomFormulaName] = useState<string>('Speed (km/h)');
  const [customChannels, setCustomChannels] = useState<Array<{ name: string; formula: string }>>([]);

  // Playback Timeline states
  const [playbackIndex] = useState<number>(-1);

  // Fetch initial telemetry session & layout config on mount
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      await fetchCurrentSessionData(primaryLap);
      const savedConfig = await loadAnalysisConfig();
      if (savedConfig) {
        if (savedConfig.activeMetric) setSelectedMetric(savedConfig.activeMetric as MetricType);
        if (savedConfig.customMathChannels) setCustomChannels(savedConfig.customMathChannels);
      }
      setIsLoading(false);
    };
    initData();
  }, []);

  const activeSession = loadedSession || currentSession;

  // Load Lap Summaries when selected Session changes
  useEffect(() => {
    const fetchLaps = async () => {
      if (selectedFilename !== 'current' && selectedFilename !== 'local') {
        const laps = await loadSessionLaps(selectedFilename);
        setLapsList(laps);
      } else {
        setLapsList([]);
      }
    };
    fetchLaps();
  }, [selectedFilename]);

  // Load Primary Lap Data when primaryLap dropdown changes
  useEffect(() => {
    const reloadPrimaryLap = async () => {
      setIsLoading(true);
      if (selectedFilename === 'current') {
        await fetchCurrentSessionData(primaryLap);
      } else if (selectedFilename !== 'local') {
        await loadSavedSession(selectedFilename, primaryLap);
      }
      setIsLoading(false);
    };
    reloadPrimaryLap();
  }, [primaryLap]);

  // Load Compare Lap Data when compareLap dropdown changes
  useEffect(() => {
    const fetchCompareData = async () => {
      if (compareLap > 0 && selectedFilename !== 'local') {
        if (selectedFilename === 'current') {
          const res = await fetch(`http://127.0.0.1:8001/api/analysis/data?lap=${compareLap}`);
          const data = await res.json();
          if (Array.isArray(data)) setCompareSessionData(data);
        } else {
          const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${encodeURIComponent(selectedFilename)}?lap=${compareLap}`);
          const data = await res.json();
          if (Array.isArray(data)) setCompareSessionData(data);
        }
      } else {
        setCompareSessionData([]);
      }
    };
    fetchCompareData();
  }, [compareLap, selectedFilename]);

  // Save Layout Configuration to backend user_configs
  const handleSaveConfig = async () => {
    const config = {
      activeMetric: selectedMetric,
      customMathChannels: customChannels,
      enabledCharts: ["track_map", "inputs_gear", "gg_diagram", "slip_scatter", "susp_dist", "temp_dist"]
    };
    const ok = await saveAnalysisConfig(config);
    if (ok) {
      alert(`${t("Analysis layout config saved to backend!")} (backend/user_configs/analysis_layout.json)`);
    } else {
      alert(t("Failed to save layout config."));
    }
  };

  const handleAddCustomChannel = () => {
    if (!customFormulaName || !customFormula) return;
    const next = [...customChannels, { name: customFormulaName, formula: customFormula }];
    setCustomChannels(next);
    setCustomFormulaName('');
    setCustomFormula('');
  };

  const handleDropdownChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedFilename(val);
    setPrimaryLap(0);
    setCompareLap(-1);
    
    setIsLoading(true);
    if (val === 'current') {
      setLoadedSession(null);
      await fetchCurrentSessionData(0);
    } else if (val !== 'local') {
      await loadSavedSession(val, 0);
    }
    setIsLoading(false);
  };

  const handleDeleteSession = async () => {
    if (selectedFilename === 'current' || selectedFilename === 'local') return;
    if (confirm(`${t("Are you sure you want to delete this session?")} (${selectedFilename})`)) {
      setIsLoading(true);
      const success = await deleteSavedSession(selectedFilename);
      if (success) {
        setLoadedSession(null);
        setSelectedFilename('current');
        await fetchCurrentSessionData();
      } else {
        alert(t("Failed to delete session."));
      }
      setIsLoading(false);
    }
  };

  // --- Track Map Data for Canvas ---
  const canvasTrackData = useMemo(() => {
    if (activeSession.length === 0) return [];
    let metricMax = 0.1;
    activeSession.forEach(p => {
      let v = p.SpeedMetersPerSecond;
      if (selectedMetric === 'throttle') v = p.AccelInput / 255;
      else if (selectedMetric === 'brake') v = p.BrakeInput / 255;
      else if (selectedMetric === 'grip') v = Math.max(...p.TireSlipRatio.map(Math.abs));
      else if (selectedMetric === 'suspension') v = p.SuspTravel[0];
      if (v > metricMax) metricMax = v;
    });

    return activeSession.map(p => {
      let v = p.SpeedMetersPerSecond;
      if (selectedMetric === 'throttle') v = p.AccelInput / 255;
      else if (selectedMetric === 'brake') v = p.BrakeInput / 255;
      else if (selectedMetric === 'grip') v = Math.max(...p.TireSlipRatio.map(Math.abs));
      else if (selectedMetric === 'suspension') v = p.SuspTravel[0];

      return {
        x: p.PositionX,
        z: p.PositionZ,
        val: metricMax > 0 ? v / metricMax : 0,
        raw: p
      };
    });
  }, [activeSession, selectedMetric]);

  // --- Lap-by-Lap Delta Comparison Chart Data ---
  const lapDeltaChartData = useMemo(() => {
    if (activeSession.length === 0) return [];
    const step = Math.max(1, Math.floor(activeSession.length / 500));
    
    return activeSession.filter((_, idx) => idx % step === 0).map((p, idx) => {
      const primarySpeedKmh = p.SpeedMetersPerSecond * 3.6;
      const compareP = compareSessionData[idx] || compareSessionData[compareSessionData.length - 1];
      const compareSpeedKmh = compareP ? compareP.SpeedMetersPerSecond * 3.6 : 0;
      const speedDelta = compareP ? primarySpeedKmh - compareSpeedKmh : 0;

      return {
        time: p.time,
        primarySpeed: Number(primarySpeedKmh.toFixed(1)),
        compareSpeed: Number(compareSpeedKmh.toFixed(1)),
        speedDelta: Number(speedDelta.toFixed(1)),
        primaryThrottle: Number(((p.AccelInput / 255) * 100).toFixed(0)),
        primaryBrake: Number(((p.BrakeInput / 255) * 100).toFixed(0))
      };
    });
  }, [activeSession, compareSessionData]);

  // --- Custom Math Channel Curve Data ---
  const customMathChartData = useMemo(() => {
    if (customChannels.length === 0 || activeSession.length === 0) return [];
    const step = Math.max(1, Math.floor(activeSession.length / 500));

    return activeSession.filter((_, idx) => idx % step === 0).map(p => {
      const ctx: Record<string, number> = {
        SpeedMetersPerSecond: p.SpeedMetersPerSecond,
        CurrentEngineRpm: p.CurrentEngineRpm,
        Gear: p.Gear,
        AccelInput: p.AccelInput,
        BrakeInput: p.BrakeInput,
        AccelerationX: p.AccelerationX,
        AccelerationZ: p.AccelerationZ,
        TireTemp_0: p.TireTemp[0] || 0,
        TireTemp_1: p.TireTemp[1] || 0,
        TireTemp_2: p.TireTemp[2] || 0,
        TireTemp_3: p.TireTemp[3] || 0,
      };

      const pointObj: Record<string, any> = { time: p.time };
      customChannels.forEach(ch => {
        pointObj[ch.name] = Number(evaluateCustomMath(ch.formula, ctx).toFixed(2));
      });
      return pointObj;
    });
  }, [activeSession, customChannels]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
      
      {/* Toolbar */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ color: 'var(--primary)', marginBottom: '0.3rem' }}>{t("Post-Race Analysis (MoTeC Aligned)")}</h2>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {t("Status")}: {isRecording ? (
              <span style={{ color: '#ff003c', fontWeight: 'bold' }}>
                🔴 {t("Recording...")} ({recordingCount} {t("samples")})
              </span>
            ) : (
              `${t("Idle")} (${activeSession.length} ${t("samples")})`
            )}
            {selectedFilename !== 'current' && selectedFilename !== 'local' && ` | 📁 ${t("Loaded Session")}: ${selectedFilename}`}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Saved Sessions Dropdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Select Session")}:</span>
            <select value={selectedFilename} onChange={handleDropdownChange} style={selectStyle}>
              <option value="current">{t("Current / Latest Session")}</option>
              {savedSessions.map(s => (
                <option key={s.filename} value={s.filename}>
                  {s.car_name || s.filename} ({s.total_laps ?? 0} Laps | Best: {s.best_lap_time?.toFixed(2) ?? 0}s)
                </option>
              ))}
            </select>
          </div>

          {/* Lap Selector */}
          {lapsList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Primary Lap")}:</span>
              <select value={primaryLap} onChange={(e) => setPrimaryLap(parseInt(e.target.value))} style={selectStyle}>
                <option value={0}>{t("All Laps")}</option>
                {lapsList.map(l => (
                  <option key={l.lap_number} value={l.lap_number}>
                    Lap {l.lap_number} ({l.lap_time.toFixed(2)}s | Max: {l.max_speed_kmh.toFixed(0)}km/h)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Compare Lap Selector */}
          {lapsList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Compare Lap")}:</span>
              <select value={compareLap} onChange={(e) => setCompareLap(parseInt(e.target.value))} style={selectStyle}>
                <option value={-1}>{t("None")}</option>
                {lapsList.map(l => (
                  <option key={l.lap_number} value={l.lap_number}>
                    vs Lap {l.lap_number} ({l.lap_time.toFixed(2)}s)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            {/* MoTeC CSV Export Button */}
            <button onClick={() => exportMoTecCsv(selectedFilename)} style={{ ...btnStyle, background: '#7000ff', color: '#fff' }}>
              📥 MoTeC CSV {t("Export")}
            </button>

            {/* Save Layout Config Button */}
            <button onClick={handleSaveConfig} style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
              💾 {t("Save Layout Config")}
            </button>

            {/* Delete Session Button */}
            {selectedFilename !== 'current' && selectedFilename !== 'local' && (
              <button onClick={handleDeleteSession} style={{ ...btnStyle, background: '#ff003c', color: '#fff' }}>
                {t("Delete")}
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', minHeight: '300px' }}>
          {t("Loading Telemetry Data...")}
        </div>
      ) : activeSession.length === 0 ? (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', minHeight: '300px' }}>
          {t("No data recorded. Start racing to record telemetry.")}
        </div>
      ) : (
        <>
          {/* Main Display Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(48%, 1fr))', gap: '1rem', paddingBottom: '2rem' }}>
            
            {/* 1. Track Map Canvas (RDP Vector Line) */}
            <div className="glass-panel" style={{ gridColumn: 'span 2', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>📍 {t("Track Map (RDP Vector Path)")}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Metric")}:</span>
                  <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value as MetricType)} style={selectStyle}>
                    <option value="speed">{t("Speed")}</option>
                    <option value="throttle">{t("Throttle")}</option>
                    <option value="brake">{t("Brake")}</option>
                    <option value="grip">{t("Grip Slip")}</option>
                    <option value="suspension">{t("Suspension")}</option>
                  </select>
                </div>
              </div>
              <div style={{ flex: 1, position: 'relative', minHeight: '350px' }}>
                <TrackMapCanvas data={canvasTrackData} currentPlaybackIndex={playbackIndex} selectedMetricLabel={selectedMetric} />
              </div>
            </div>

            {/* 2. Lap-by-Lap Delta Comparison Chart */}
            <ChartWidget title={`⚡ ${t("Lap Delta & Speed Comparison")} ${compareLap > 0 ? `(Lap ${primaryLap || 'All'} vs Lap ${compareLap})` : ''}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lapDeltaChartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 10}} label={{ value: t('Time (s)'), position: 'insideBottomRight', offset: -5 }} />
                  <YAxis yAxisId="left" stroke="var(--text-secondary)" tick={{fontSize: 10}} label={{ value: 'km/h', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#ff003c" tick={{fontSize: 10}} label={{ value: 'Delta (km/h)', angle: 90, position: 'insideRight' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                  <Legend verticalAlign="top" height={36}/>
                  <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="primarySpeed" name={`Lap ${primaryLap || 'Primary'} Speed`} stroke="#00ff00" dot={false} strokeWidth={2} />
                  {compareLap > 0 && (
                    <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="compareSpeed" name={`Lap ${compareLap} Speed`} stroke="#00f0ff" dot={false} strokeWidth={2} strokeDasharray="4 4" />
                  )}
                  {compareLap > 0 && (
                    <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="speedDelta" name="Speed Delta" stroke="#ff003c" dot={false} strokeWidth={1.5} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </ChartWidget>

            {/* 3. Custom Channel Formula Builder & Chart */}
            <ChartWidget title={`🧮 ${t("Custom Math Channel Chart")}`}>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Channel Name (e.g. DeltaG)"
                  value={customFormulaName}
                  onChange={(e) => setCustomFormulaName(e.target.value)}
                  style={{ ...selectStyle, flex: 1, minWidth: 0 }}
                />
                <input
                  type="text"
                  placeholder="Formula (e.g. AccelInput - BrakeInput)"
                  value={customFormula}
                  onChange={(e) => setCustomFormula(e.target.value)}
                  style={{ ...selectStyle, flex: 2, minWidth: 0 }}
                />
                <button onClick={handleAddCustomChannel} style={{ ...btnStyle, padding: '0.3rem 0.6rem' }}>+</button>
              </div>
              <ResponsiveContainer width="100%" height="80%">
                <LineChart data={customMathChartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 10}} />
                  <YAxis stroke="var(--text-secondary)" tick={{fontSize: 10}} />
                  <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                  <Legend verticalAlign="top" height={36}/>
                  {customChannels.map((ch, idx) => (
                    <Line key={ch.name} isAnimationActive={false} type="monotone" dataKey={ch.name} name={ch.name} stroke={idx % 2 === 0 ? '#ffaa00' : '#7000ff'} dot={false} strokeWidth={1.5} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartWidget>

          </div>
        </>
      )}
    </div>
  );
};

const ChartWidget: React.FC<{ title: string, children: React.ReactNode, height?: string }> = ({ title, children, height = '360px' }) => (
  <div className="glass-panel" style={{ height, display: 'flex', flexDirection: 'column', padding: '1.2rem' }}>
    <h4 style={{ marginBottom: '0.8rem', color: 'var(--text-primary)', marginTop: 0, fontSize: '0.95rem' }}>{title}</h4>
    <div style={{ flex: 1, minHeight: 0 }}>
      {children}
    </div>
  </div>
);

const btnStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '0.85rem',
  transition: 'all 0.2s',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const selectStyle: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.2)',
  padding: '0.4rem 0.6rem',
  borderRadius: '4px',
  fontSize: '0.85rem',
  cursor: 'pointer',
  minWidth: '130px'
};

export default AnalysisView;
