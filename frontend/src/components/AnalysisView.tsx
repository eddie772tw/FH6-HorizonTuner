import React, { useState, useEffect } from 'react';
import { useTelemetryRecorder, AnalysisDataPoint, LapSummary } from '../context/TelemetryRecorderContext';
import { useSettings } from '../context/SettingsContext';
import TrackMapCanvas from './TrackMapCanvas';
import { CustomChannelItem } from './CustomChannelEditor';
import DynamicChartGrid, { ChartSlotConfig, DEFAULT_CHART_SLOTS } from './DynamicChartGrid';
import ChartEditModal from './ChartEditModal';

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
  const [primaryLap, setPrimaryLap] = useState<number>(0);
  const [compareLap, setCompareLap] = useState<number>(-1);
  const [compareSessionData, setCompareSessionData] = useState<AnalysisDataPoint[]>([]);
  const [fullSessionTrackData, setFullSessionTrackData] = useState<AnalysisDataPoint[]>([]);

  // Custom Math Channels & 4 Chart Slots state
  const [customChannels, setCustomChannels] = useState<CustomChannelItem[]>([]);
  const [chartSlots, setChartSlots] = useState<ChartSlotConfig[]>(DEFAULT_CHART_SLOTS);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  // Initialized flag for auto-save prevention on first load
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // Playback Timeline state
  const [playbackIndex] = useState<number>(-1);

  // Fetch initial telemetry session & layout config on mount
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      const data = await fetchCurrentSessionData(primaryLap);
      setFullSessionTrackData(data);

      const savedConfig = await loadAnalysisConfig();
      if (savedConfig) {
        if (savedConfig.activeMetric) setSelectedMetric(savedConfig.activeMetric as MetricType);
        if (savedConfig.customMathChannels) setCustomChannels(savedConfig.customMathChannels);
        if (savedConfig.slots && savedConfig.slots.length === 4) {
          setChartSlots(savedConfig.slots as ChartSlotConfig[]);
        }
      }
      setIsConfigLoaded(true);
      setIsLoading(false);
    };
    initData();
  }, []);

  // Silent Debounced Auto-Save Layout Config when state changes
  useEffect(() => {
    if (!isConfigLoaded) return;
    const timer = setTimeout(async () => {
      const config = {
        activeMetric: selectedMetric,
        customMathChannels: customChannels,
        slots: chartSlots,
        enabledCharts: ["track_map", "chart_grid"]
      };
      await saveAnalysisConfig(config);
    }, 800);

    return () => clearTimeout(timer);
  }, [selectedMetric, customChannels, chartSlots, isConfigLoaded]);

  // During Live Recording, periodically (every 5s) fetch full session data to refresh track map base path
  useEffect(() => {
    let intervalId: any = null;
    if (isRecording) {
      intervalId = setInterval(async () => {
        const fullPoints = await fetchCurrentSessionData(0);
        if (fullPoints && fullPoints.length > 0) {
          setFullSessionTrackData(fullPoints);
        }
      }, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isRecording]);

  const activeSession = loadedSession || currentSession;

  // Load Lap Summaries & Full Track Base Data when selected Session changes
  useEffect(() => {
    const fetchLapsAndFullTrack = async () => {
      if (selectedFilename !== 'current' && selectedFilename !== 'local') {
        const laps = await loadSessionLaps(selectedFilename);
        setLapsList(laps);

        const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${encodeURIComponent(selectedFilename)}?lap=0`);
        const data = await res.json();
        if (Array.isArray(data)) setFullSessionTrackData(data);
      } else {
        setLapsList([]);
      }
    };
    fetchLapsAndFullTrack();
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

  const formatTrackCanvasData = (points: AnalysisDataPoint[]) => {
    if (points.length === 0) return [];
    let metricMax = 0.1;
    points.forEach(p => {
      let v = p.SpeedMetersPerSecond;
      if (selectedMetric === 'throttle') v = p.AccelInput / 255;
      else if (selectedMetric === 'brake') v = p.BrakeInput / 255;
      else if (selectedMetric === 'grip') v = Math.max(...p.TireSlipRatio.map(Math.abs));
      else if (selectedMetric === 'suspension') v = p.SuspTravel[0];
      if (v > metricMax) metricMax = v;
    });

    return points.map(p => {
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
  };

  const activeCanvasData = formatTrackCanvasData(activeSession);
  const baseCanvasData = formatTrackCanvasData(fullSessionTrackData);
  const isSavedSession = selectedFilename !== 'current' && selectedFilename !== 'local';

  const handleSaveSlotFromModal = (updatedSlot: ChartSlotConfig) => {
    if (editingSlotIndex !== null) {
      const nextSlots = [...chartSlots];
      nextSlots[editingSlotIndex] = updatedSlot;
      setChartSlots(nextSlots);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
      
      {/* Toolbar - Pure Title Without MoTeC Aligned */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ color: 'var(--primary)', marginBottom: '0.3rem' }}>{t("Post-Race Analysis")}</h2>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {t("Status")}: {isRecording ? (
              <span style={{ color: '#ff003c', fontWeight: 'bold' }}>
                {t("Recording...")} ({recordingCount} {t("samples")})
              </span>
            ) : (
              `${t("Idle")} (${activeSession.length} ${t("samples")})`
            )}
            {selectedFilename !== 'current' && selectedFilename !== 'local' && ` | ${t("Loaded Session")}: ${selectedFilename}`}
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
              MoTeC CSV {t("Export")}
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
          {/* Track Map Canvas Section */}
          <div className="glass-panel" style={{ minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem 1rem' }}>
              <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{t("Track Map")}</h4>
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
              <TrackMapCanvas
                data={activeCanvasData}
                fullTrackData={baseCanvasData}
                currentPlaybackIndex={playbackIndex}
                selectedMetricLabel={selectedMetric}
                isRecording={isRecording}
                isSavedSession={isSavedSession}
              />
            </div>
          </div>

          {/* 4 Customizable Multi-Dimensional Chart Slots Grid */}
          <DynamicChartGrid
            slots={chartSlots}
            onOpenEditModal={(idx) => setEditingSlotIndex(idx)}
            activeSession={activeSession}
            compareSessionData={compareSessionData}
            customChannels={customChannels}
            isRecording={isRecording}
          />
        </>
      )}

      {/* Chart Edit Modal with Multi-Chart Type Preview */}
      {editingSlotIndex !== null && chartSlots[editingSlotIndex] && (
        <ChartEditModal
          slot={chartSlots[editingSlotIndex]}
          isOpen={editingSlotIndex !== null}
          onClose={() => setEditingSlotIndex(null)}
          onSaveSlot={handleSaveSlotFromModal}
          customChannels={customChannels}
          sampleData={activeSession}
        />
      )}
    </div>
  );
};

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
