import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useTelemetryRecorder, AnalysisDataPoint } from '../context/TelemetryRecorderContext';
import { useSettings } from '../context/SettingsContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, BarChart, Bar, AreaChart, Area, ReferenceLine
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
    clearCurrentSession,
    saveCurrentSessionToBackend,
    fetchCurrentSessionData,
    loadSavedSession,
    deleteSavedSession
  } = useTelemetryRecorder();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { convertSpeed, convertTemp, settings, t } = useSettings();
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('speed');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState<string>('current');
  const [selectedLap, setSelectedLap] = useState<number | 'all'>('all');

  // Playback Timeline states
  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Fetch latest telemetry session data from backend when the view mounts
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      await fetchCurrentSessionData();
      setIsLoading(false);
    };
    initData();
  }, []);

  const rawSession = loadedSession || currentSession;

  const availableLaps = useMemo(() => {
    const laps = new Set<number>();
    rawSession.forEach(p => {
      if (p.CurrentLap !== undefined && p.CurrentLap > 0) {
        laps.add(p.CurrentLap);
      }
    });
    return Array.from(laps).sort((a, b) => a - b);
  }, [rawSession]);

  useEffect(() => {
    if (availableLaps.length > 0 && selectedLap === 'all') {
      setSelectedLap(availableLaps[0]);
    }
  }, [availableLaps, selectedLap]);

  const activeSession = useMemo(() => {
    if (selectedLap === 'all') return rawSession;
    return rawSession.filter(p => p.CurrentLap === selectedLap);
  }, [rawSession, selectedLap]);

  // Playback timer effect
  useEffect(() => {
    let timer: any;
    if (isPlaying && activeSession.length > 0) {
      timer = setInterval(() => {
        setPlaybackIndex(prev => {
          const next = prev + playbackSpeed;
          if (next >= activeSession.length) {
            setIsPlaying(false);
            return activeSession.length - 1;
          }
          return next;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, activeSession.length]);

  // Handle saving the current session to a local JSON file (backup option)
  const handleSaveLocal = () => {
    if (activeSession.length === 0) {
      alert(t("No data to save."));
      return;
    }
    const dataStr = JSON.stringify(activeSession);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fh6_telemetry_session_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle saving the current session to the backend directory
  const handleSaveToBackend = async () => {
    if (!loadedSession || loadedSession.length === 0) {
      alert(t("No data to save."));
      return;
    }
    setIsLoading(true);
    const filename = await saveCurrentSessionToBackend();
    setIsLoading(false);
    if (filename) {
      alert(`${t("Session saved successfully")}! (${filename})`);
      setSelectedFilename(filename);
    } else {
      alert(t("Failed to save session."));
    }
  };

  // Handle loading a local JSON file (backup option)
  const handleLoadLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setLoadedSession(json);
          setSelectedFilename('local');
        } else {
          alert(t("Invalid file format."));
        }
      } catch (err) {
        alert(t("Failed to parse JSON file."));
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle dropdown selection to switch between current recording and saved backend sessions
  const handleDropdownChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedFilename(val);
    
    setIsLoading(true);
    if (val === 'current') {
      setLoadedSession(null);
      await fetchCurrentSessionData();
    } else if (val !== 'local') {
      await loadSavedSession(val);
    }
    setIsLoading(false);
  };

  // Handle deleting the currently selected backend session
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

  // --- PANEL 1: Slip Angle vs Slip Ratio Heatmap ---
  const slipData = useMemo(() => {
    const data: any[] = [];
    const step = Math.max(1, Math.floor(activeSession.length / 1500));
    for (let i = 0; i < activeSession.length; i += step) {
      const p = activeSession[i];
      for (let w = 0; w < 4; w++) {
        data.push({
          angle: Number(Math.abs(p.TireSlipAngle[w] * (180 / Math.PI)).toFixed(2)),
          ratio: Number(Math.abs(p.TireSlipRatio[w]).toFixed(3)),
          wheel: w
        });
      }
    }
    return data;
  }, [activeSession]);

  // --- PANEL 2: Tire Temperature Distribution ---
  const tireTempDist = useMemo(() => {
    if (activeSession.length === 0) return [];
    const isC = settings.units.temperature === 'C';
    
    const tempBuckets = isC 
      ? [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140]
      : [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300];

    const counts = tempBuckets.map(temp => ({
      tempLabel: `${temp}${isC ? '°C' : '°F'}`,
      tempVal: temp,
      FL: 0, FR: 0, RL: 0, RR: 0
    }));

    activeSession.forEach(p => {
      p.TireTemp.forEach((tF, idx) => {
        const val = isC ? (tF - 32) * 5 / 9 : tF;
        let bIdx = tempBuckets.findIndex(b => val <= b);
        if (bIdx === -1) bIdx = tempBuckets.length - 1;
        
        const key = idx === 0 ? 'FL' : idx === 1 ? 'FR' : idx === 2 ? 'RL' : 'RR';
        counts[bIdx][key]++;
      });
    });

    const totalSamples = activeSession.length;
    return counts.map(c => ({
      ...c,
      FL: Number(((c.FL / totalSamples) * 100).toFixed(1)),
      FR: Number(((c.FR / totalSamples) * 100).toFixed(1)),
      RL: Number(((c.RL / totalSamples) * 100).toFixed(1)),
      RR: Number(((c.RR / totalSamples) * 100).toFixed(1)),
    }));
  }, [activeSession, settings.units.temperature]);

  // --- PANEL 3: Suspension Travel Distribution ---
  const suspTravelDist = useMemo(() => {
    if (activeSession.length === 0) return [];
    
    const buckets = Array(10).fill(0).map((_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      FL: 0, FR: 0, RL: 0, RR: 0
    }));

    activeSession.forEach(p => {
      p.SuspTravel.forEach((travel, idx) => {
        let bIdx = Math.floor(travel * 10);
        if (bIdx > 9) bIdx = 9;
        if (bIdx < 0) bIdx = 0;
        const key = idx === 0 ? 'FL' : idx === 1 ? 'FR' : idx === 2 ? 'RL' : 'RR';
        buckets[bIdx][key]++;
      });
    });

    const totalSamples = activeSession.length;
    return buckets.map(b => ({
      ...b,
      FL: Number(((b.FL / totalSamples) * 100).toFixed(1)),
      FR: Number(((b.FR / totalSamples) * 100).toFixed(1)),
      RL: Number(((b.RL / totalSamples) * 100).toFixed(1)),
      RR: Number(((b.RR / totalSamples) * 100).toFixed(1)),
    }));
  }, [activeSession]);

  // --- PANEL 4: G-G Diagram & Friction Circle ---
  const ggData = useMemo(() => {
    const points: any[] = [];
    const step = Math.max(1, Math.floor(activeSession.length / 1200));
    
    for (let i = 0; i < activeSession.length; i += step) {
      const p = activeSession[i];
      points.push({
        latG: Number((p.AccelerationX / 9.81).toFixed(3)),
        lonG: Number((p.AccelerationZ / 9.81).toFixed(3))
      });
    }

    const sectors = Array(8).fill(null).map((_, idx) => {
      const centerAngle = -Math.PI + (idx * Math.PI) / 4;
      return { centerAngle, maxR: 0.1, x: 0.1 * Math.cos(centerAngle), y: 0.1 * Math.sin(centerAngle) };
    });

    activeSession.forEach(p => {
      const x = p.AccelerationX / 9.81;
      const y = p.AccelerationZ / 9.81;
      const r = Math.sqrt(x * x + y * y);
      if (r < 0.1) return;

      let angle = Math.atan2(y, x);
      let sectorIdx = Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8;
      
      if (r > sectors[sectorIdx].maxR) {
        sectors[sectorIdx].maxR = r;
        sectors[sectorIdx].x = x;
        sectors[sectorIdx].y = y;
      }
    });

    const polygon = sectors.map(s => ({ latG: s.x, lonG: s.y }));
    polygon.push({ latG: sectors[0].x, lonG: sectors[0].y });

    return { points, polygon };
  }, [activeSession]);

  // --- PANEL 5: Combined Driver Inputs & Gear Chart ---
  const inputsChartData = useMemo(() => {
    const step = Math.max(1, Math.floor(activeSession.length / 1000));
    return activeSession.filter((_, idx) => idx % step === 0).map(p => ({
      time: p.time,
      throttle: Number(((p.AccelInput / 255) * 100).toFixed(0)),
      brake: Number(((p.BrakeInput / 255) * 100).toFixed(0)),
      gear: p.Gear
    }));
  }, [activeSession]);

  // --- PANEL 6: Track Map Multi-Metric Heatmap & Custom Tooltip ---
  const trackMapData = useMemo(() => {
    if (activeSession.length === 0) return [];
    
    let speedMax = 0.1;
    let gripMax = 0.1;
    let suspMax = 0.1;
    
    activeSession.forEach(p => {
      const speed = p.SpeedMetersPerSecond;
      const grip = Math.max(...p.TireSlipRatio.map(Math.abs));
      const susp = Math.max(...p.SuspTravel);
      
      if (speed > speedMax) speedMax = speed;
      if (grip > gripMax) gripMax = grip;
      if (susp > suspMax) suspMax = susp;
    });

    const step = Math.max(1, Math.floor(activeSession.length / 2000));
    return activeSession.filter((_, idx) => idx % step === 0).map(p => {
      const speed = p.SpeedMetersPerSecond;
      const grip = Math.max(...p.TireSlipRatio.map(Math.abs));
      const susp = p.SuspTravel[0];
      
      let val = 0;
      if (selectedMetric === 'speed') val = speed / speedMax;
      else if (selectedMetric === 'throttle') val = p.AccelInput / 255;
      else if (selectedMetric === 'brake') val = p.BrakeInput / 255;
      else if (selectedMetric === 'grip') val = Math.min(1, grip / 1.2);
      else if (selectedMetric === 'suspension') val = susp;

      return {
        x: p.PositionX,
        z: p.PositionZ,
        val,
        raw: p
      };
    });
  }, [activeSession, selectedMetric]);

  const currentCarPos = useMemo(() => {
    if (playbackIndex === -1 || !activeSession[playbackIndex]) return [];
    const p = activeSession[playbackIndex];
    return [{ x: p.PositionX, z: p.PositionZ, val: 1, raw: p }];
  }, [activeSession, playbackIndex]);

  const getHeatmapColor = (val: number) => {
    const hue = (1 - val) * 240;
    return `hsl(${hue}, 100%, 50%)`;
  };

  const renderTrackDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    return <circle cx={cx} cy={cy} r={3.5} fill={getHeatmapColor(payload.val)} stroke="none" />;
  };

  const TrackMapTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload.raw as AnalysisDataPoint;
      const speedVal = convertSpeed(dataPoint.SpeedMetersPerSecond);
      const tempUnit = convertTemp(0).label;
      
      return (
        <div className="glass-panel" style={{
          padding: '0.8rem',
          backgroundColor: 'rgba(10, 10, 15, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
          fontSize: '0.85rem',
          color: 'var(--text-primary)',
          minWidth: '220px',
          lineHeight: '1.5'
        }}>
          <div style={{ fontWeight: 'bold', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.25rem', marginBottom: '0.4rem' }}>
            {t("Vehicle State")} ({dataPoint.time.toFixed(1)}s)
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t("Speed")}:</span>
            <span style={{ fontWeight: 'bold', color: '#fff' }}>{speedVal.value.toFixed(1)} {speedVal.label}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t("RPM")}:</span>
            <span style={{ fontWeight: 'bold', color: 'var(--secondary)' }}>{dataPoint.CurrentEngineRpm} RPM ({t("G")}{dataPoint.Gear})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t("Throttle/Brake")}:</span>
            <span style={{ fontWeight: 'bold' }}>
              <span style={{ color: '#00ff00' }}>{Math.round(dataPoint.AccelInput / 2.55)}%</span> / <span style={{ color: '#ff003c' }}>{Math.round(dataPoint.BrakeInput / 2.55)}%</span>
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t("G-Force")}:</span>
            <span style={{ fontWeight: 'bold', color: '#ffaa00' }}>
              Lat: {(dataPoint.AccelerationX / 9.81).toFixed(2)}G | Lon: {(dataPoint.AccelerationZ / 9.81).toFixed(2)}G
            </span>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '0.4rem', paddingTop: '0.4rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>{t("Tyre Temps (FL/FR/RL/RR)")}:</div>
            <div style={{ fontWeight: 'bold', color: '#7000ff', textAlign: 'right' }}>
              {dataPoint.TireTemp.map(tF => convertTemp(tF).value.toFixed(0)).join(' / ')} {tempUnit}
            </div>
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>{t("Suspension Travel (FL/FR/RL/RR)")}:</div>
            <div style={{ fontWeight: 'bold', color: '#00f0ff', textAlign: 'right' }}>
              {dataPoint.SuspTravel.map(s => Math.round(s * 100)).join(' / ')}%
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
      
      {/* Toolbar */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ color: 'var(--primary)', marginBottom: '0.3rem' }}>{t("Post-Race Analysis")}</h2>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {t("Status")}: {isRecording ? (
              <span style={{ color: '#ff003c', fontWeight: 'bold' }}>
                🔴 {t("Recording...")} ({recordingCount} {t("samples")})
              </span>
            ) : (
              `${t("Idle")} (${activeSession.length} ${t("samples")})`
            )}
            {selectedFilename !== 'current' && selectedFilename !== 'local' && ` | 📁 ${t("Loaded File")}: ${selectedFilename}`}
            {selectedFilename === 'local' && ` | 📁 ${t("Loaded Local File")}`}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          
          {/* Saved Sessions Dropdown */}
          {availableLaps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Select Lap")}:</span>
              <select
                value={selectedLap}
                onChange={(e) => setSelectedLap(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                style={selectStyle}
              >
                <option value="all">{t("All Laps")}</option>
                {availableLaps.map(lap => (
                  <option key={lap} value={lap}>{t("Lap")} {lap}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Select Session")}:</span>
            <select
              value={selectedFilename}
              onChange={handleDropdownChange}
              style={selectStyle}
            >
              <option value="current">{t("Current Recording")}</option>
              {savedSessions.map(s => {
                const dateStr = new Date(s.mtime * 1000).toLocaleString();
                return (
                  <option key={s.filename} value={s.filename}>
                    {dateStr} ({Math.round(s.size / 1024)} KB)
                  </option>
                );
              })}
              {selectedFilename === 'local' && (
                <option value="local">{t("Loaded Local File")}</option>
              )}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            {/* Save to Backend Button */}
            {selectedFilename === 'current' && loadedSession && loadedSession.length > 0 && (
              <button onClick={handleSaveToBackend} style={{ ...btnStyle, background: 'var(--primary)', color: '#000' }}>
                {t("Save to Backend")}
              </button>
            )}

            {/* Delete Session Button */}
            {selectedFilename !== 'current' && selectedFilename !== 'local' && (
              <button onClick={handleDeleteSession} style={{ ...btnStyle, background: '#ff003c', color: '#fff' }}>
                {t("Delete Saved")}
              </button>
            )}

            {/* Clear Current Button */}
            {selectedFilename === 'current' && (
              <button onClick={clearCurrentSession} style={{ ...btnStyle, background: 'var(--secondary)' }}>
                {t("Clear Current")}
              </button>
            )}

            {/* Local Backup Import/Export */}
            <button onClick={handleSaveLocal} style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
              {t("Export JSON")}
            </button>
            
            <input 
              type="file" 
              accept=".json" 
              ref={fileInputRef} 
              onChange={handleLoadLocal} 
              style={{ display: 'none' }} 
            />
            <button onClick={() => fileInputRef.current?.click()} style={{ ...btnStyle, background: 'rgba(255,255,255,0.05)', color: '#ccc', border: '1px solid rgba(255,255,255,0.1)' }}>
              {t("Import JSON")}
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', minHeight: '300px' }}>
          {t("Loading Session Data...")}
        </div>
      ) : activeSession.length === 0 ? (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', minHeight: '300px' }}>
          {t("No data recorded or loaded. Start racing to record telemetry or load a session file.")}
        </div>
      ) : (
        <>
          {/* Playback Timeline Panel */}
          <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', flexShrink: 0, marginBottom: '1rem', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ color: 'var(--primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⏱️ {t("Telemetry Playback Timeline") || "遙測數據重播時間軸 [開發預留接入點]"}
              </h4>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {playbackIndex === -1 ? t("Timeline Inactive") || "重播未啟用" : `${t("Replaying") || "重播中"}: ${activeSession[playbackIndex]?.time.toFixed(1)}s / ${activeSession[activeSession.length - 1]?.time.toFixed(1)}s (Index: ${playbackIndex})`}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {/* Play/Pause Button */}
              <button 
                onClick={() => {
                  if (playbackIndex === -1) setPlaybackIndex(0);
                  setIsPlaying(!isPlaying);
                }} 
                className="cyber-btn-glow"
                style={{ ...btnStyle, background: isPlaying ? 'var(--secondary)' : 'var(--primary)', color: isPlaying ? '#fff' : '#000', width: '100px', flexShrink: 0 }}
              >
                {isPlaying ? `⏸️ ${t("Pause") || "暫停"}` : `▶️ ${t("Play") || "播放"}`}
              </button>

              {/* Reset/Stop Button */}
              <button 
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackIndex(-1);
                }}
                style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }}
              >
                ⏹️ {t("Reset") || "重置"}
              </button>

              {/* Playback Speed select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Speed") || "速度"}:</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseInt(e.target.value))}
                  style={{ ...selectStyle, minWidth: '60px' }}
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={5}>5x</option>
                  <option value={10}>10x</option>
                </select>
              </div>

              {/* Timeline Slider */}
              <input
                type="range"
                min={0}
                max={activeSession.length - 1}
                value={playbackIndex === -1 ? 0 : playbackIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setPlaybackIndex(parseInt(e.target.value));
                }}
                style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer', height: '6px', borderRadius: '3px' }}
                disabled={activeSession.length === 0}
              />
            </div>

            {/* HUD Mini metrics for current playback index */}
            {playbackIndex !== -1 && activeSession[playbackIndex] && (() => {
              const p = activeSession[playbackIndex];
              const speedVal = convertSpeed(p.SpeedMetersPerSecond);
              return (
                <div style={{ 
                  display: 'flex', 
                  gap: '1rem', 
                  background: 'rgba(0,0,0,0.2)', 
                  padding: '0.6rem 1rem', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ flex: 1 }}><span style={{ color: 'var(--text-secondary)' }}>{t("Speed") || "時速"}:</span> <strong style={{ color: '#fff' }}>{speedVal.value.toFixed(1)} {speedVal.label}</strong></div>
                  <div style={{ flex: 1 }}><span style={{ color: 'var(--text-secondary)' }}>{t("RPM") || "轉速"}:</span> <strong style={{ color: 'var(--primary)' }}>{p.CurrentEngineRpm.toFixed(0)} RPM</strong></div>
                  <div style={{ flex: 1 }}><span style={{ color: 'var(--text-secondary)' }}>{t("Gear") || "檔位"}:</span> <strong style={{ color: 'var(--secondary)' }}>{t("G")}{p.Gear}</strong></div>
                  <div style={{ flex: 1 }}><span style={{ color: 'var(--text-secondary)' }}>{t("Throttle") || "油門"}:</span> <strong style={{ color: '#00ff00' }}>{Math.round(p.AccelInput / 2.55)}%</strong></div>
                  <div style={{ flex: 1 }}><span style={{ color: 'var(--text-secondary)' }}>{t("Brake") || "煞車"}:</span> <strong style={{ color: '#ff003c' }}>{Math.round(p.BrakeInput / 2.55)}%</strong></div>
                  <div style={{ flex: 1 }}><span style={{ color: 'var(--text-secondary)' }}>{t("G-Force") || "G力"}:</span> <strong style={{ color: '#ffaa00' }}>Lat: {(p.AccelerationX / 9.81).toFixed(2)}G | Lon: {(p.AccelerationZ / 9.81).toFixed(2)}G</strong></div>
                </div>
              );
            })()}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(48%, 1fr))',
            gap: '1rem',
            paddingBottom: '2rem'
          }}>
          
          {/* 1. Track Map Heatmap */}
          <div className="glass-panel" style={{ gridColumn: 'span 2', minHeight: '450px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{t("Track Map Multi-Metric Heatmap")}</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Analysis Metric")}:</span>
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
                  style={selectStyle}
                >
                  <option value="speed">{t("Speed")}</option>
                  <option value="throttle">{t("Throttle")}</option>
                  <option value="brake">{t("Brake")}</option>
                  <option value="grip">{t("Grip Limit (Slip)")}</option>
                  <option value="suspension">{t("Suspension Travel (FL)")}</option>
                </select>
              </div>
            </div>
            
            <div style={{ flex: 1, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis type="number" dataKey="x" name="PosX" domain={['dataMin - 50', 'dataMax + 50']} tick={false} axisLine={false} />
                  <YAxis type="number" dataKey="z" name="PosZ" domain={['dataMin - 50', 'dataMax + 50']} tick={false} axisLine={false} />
                  <ZAxis type="number" range={[49, 49]} />
                  <Tooltip content={<TrackMapTooltip />} trigger="hover" />
                  <Scatter name="Track Path" data={trackMapData} shape={renderTrackDot} />
                  {playbackIndex !== -1 && currentCarPos.length > 0 && (
                    <Scatter
                      name={t("Current Position") || "目前位置"}
                      data={currentCarPos}
                      fill="var(--secondary)"
                      shape={(props: any) => {
                        const { cx, cy } = props;
                        if (cx == null || cy == null) return null;
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={8}
                            fill="var(--secondary)"
                            stroke="#fff"
                            strokeWidth={2}
                            style={{ filter: 'drop-shadow(0 0 5px var(--secondary))' }}
                          />
                        );
                      }}
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.8rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
              <span style={{ color: '#00f0ff' }}>🔵 {t("Low / Cold")}</span>
              <span style={{ color: '#00ff00' }}>🟢 {t("Medium")}</span>
              <span style={{ color: '#ff003c' }}>🔴 {t("High / Limit")}</span>
            </div>
          </div>

          {/* 2. Driver Inputs & Gear Curve */}
          <ChartWidget title={t("Driver Inputs & Gear Curve")}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={inputsChartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 10}} label={{ value: t('Time (s)'), position: 'insideBottomRight', offset: -5 }} />
                <YAxis yAxisId="left" domain={[0, 100]} stroke="var(--text-secondary)" tick={{fontSize: 10}} unit="%" />
                <YAxis yAxisId="right" orientation="right" domain={[1, 10]} interval={1} stroke="var(--primary)" tick={{fontSize: 10}} label={{ value: t('Gear'), angle: 90, position: 'insideRight' }} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend verticalAlign="top" height={36}/>
                <Line yAxisId="left" type="monotone" dataKey="throttle" name={t("Throttle")} stroke="#00ff00" dot={false} strokeWidth={1.5} />
                <Line yAxisId="left" type="monotone" dataKey="brake" name={t("Brake")} stroke="#ff003c" dot={false} strokeWidth={1.5} />
                <Line yAxisId="right" type="stepAfter" dataKey="gear" name={t("Gear")} stroke="var(--primary)" dot={false} strokeWidth={2} />
                {playbackIndex !== -1 && activeSession[playbackIndex] && (
                  <ReferenceLine x={activeSession[playbackIndex].time} yAxisId="left" stroke="var(--secondary)" strokeWidth={2} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* 3. G-G Diagram & Friction Circle */}
          <ChartWidget title={t("G-G Diagram & Friction Circle")}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" dataKey="latG" name="Lat G" domain={[-2, 2]} stroke="var(--text-secondary)" tick={{fontSize: 10}} unit="G" />
                <YAxis type="number" dataKey="lonG" name="Lon G" domain={[-2, 2]} stroke="var(--text-secondary)" tick={{fontSize: 10}} unit="G" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend verticalAlign="top" height={36} />
                <Scatter name={t("G-G Limit")} data={ggData.polygon} fill="none" line={{ stroke: 'var(--primary)', strokeWidth: 2, strokeDasharray: '4 4' }} shape={() => null} />
                <Scatter name={t("Dynamic Gs")} data={ggData.points} fill="var(--secondary)" opacity={0.3} shape="circle" />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* 4. Slip Angle vs Slip Ratio Heatmap */}
          <ChartWidget title={t("Slip Angle vs. Slip Ratio Scatter (4 Wheels)")}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" dataKey="angle" name={t("Slip Angle")} domain={[0, 'auto']} stroke="var(--text-secondary)" tick={{fontSize: 10}} unit="°" />
                <YAxis type="number" dataKey="ratio" name={t("Slip Ratio")} domain={[0, 1.5]} stroke="var(--text-secondary)" tick={{fontSize: 10}} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Scatter name={t("Tyre Slip")} data={slipData} fill="#7000ff" opacity={0.15} shape="circle" />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* 5. Suspension Travel Distribution */}
          <ChartWidget title={t("Suspension Travel Distribution Histogram")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={suspTravelDist} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="range" stroke="var(--text-secondary)" tick={{fontSize: 9}} />
                <YAxis stroke="var(--text-secondary)" tick={{fontSize: 10}} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="FL" name="FL" fill="#00f0ff" />
                <Bar dataKey="FR" name="FR" fill="#ffaa00" />
                <Bar dataKey="RL" name="RL" fill="#ff003c" />
                <Bar dataKey="RR" name="RR" fill="#7000ff" />
              </BarChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* 6. Tire Temperature Distribution */}
          <ChartWidget title={t("Tire Temperature Distribution Curve")}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tireTempDist} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="tempLabel" stroke="var(--text-secondary)" tick={{fontSize: 9}} />
                <YAxis stroke="var(--text-secondary)" tick={{fontSize: 10}} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend verticalAlign="top" height={36} />
                <Area type="monotone" dataKey="FL" name="FL" stroke="#00f0ff" fill="#00f0ff" fillOpacity={0.05} />
                <Area type="monotone" dataKey="FR" name="FR" stroke="#ffaa00" fill="#ffaa00" fillOpacity={0.05} />
                <Area type="monotone" dataKey="RL" name="RL" stroke="#ff003c" fill="#ff003c" fillOpacity={0.05} />
                <Area type="monotone" dataKey="RR" name="RR" stroke="#7000ff" fill="#7000ff" fillOpacity={0.05} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartWidget>

        </div>
      </>
      )}
    </div>
  );
};

const ChartWidget: React.FC<{ title: string, children: React.ReactNode, height?: string }> = ({ title, children, height = '340px' }) => (
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
  padding: '0.5rem 1rem',
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
  minWidth: '150px'
};

export default AnalysisView;
