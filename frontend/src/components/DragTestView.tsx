import React, { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

interface DragPoint {
  time: number;
  SpeedMetersPerSecond: number;
  CurrentEngineRpm: number;
  Gear: number;
  AccelInput: number;
  BrakeInput: number;
  TorqueNewtons: number;
  PowerWatts: number;
  TireSlipRatio: number[];
}

interface ShiftDetail {
  from_gear: number;
  to_gear: number;
  n_before: number;
  n_after: number;
  rpm_drop: number;
  retention: number;
  shift_time: number;
}

interface DragAnalysis {
  car_id?: string;
  car_name?: string;
  drivetrain: string;
  max_gear: number;
  max_speed_kmh: number;
  duration: number;
  launch_slip_percent: number;
  launch_recommendation: string;
  shifts: ShiftDetail[];
  shift_recommendations: string[];
  final_drive_recommendation: string;
  path_valid: boolean;
  max_deviation_meters: number;
  yaw_variance_rad: number;
  stability_diagnostics: string[];
  error?: string;
}

const DragTestView: React.FC = () => {
  const { convertSpeed, t } = useSettings();

  const [status, setStatus] = useState<'idle' | 'waiting' | 'recording' | 'finished'>('idle');
  const [pointsCount, setPointsCount] = useState(0);
  const [sessionData, setSessionData] = useState<DragPoint[]>([]);
  const [analysis, setAnalysis] = useState<DragAnalysis | null>(null);
  const [activeChart, setActiveChart] = useState<'speed_rpm' | 'slip'>('speed_rpm');
  const [isLoading, setIsLoading] = useState(false);

  // Comparison & Session States
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [selectedCompareFilename, setSelectedCompareFilename] = useState<string>('');
  const [compareData, setCompareData] = useState<DragPoint[]>([]);
  const [compareAnalysis, setCompareAnalysis] = useState<DragAnalysis | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Poll status from backend
  useEffect(() => {
    let isMounted = true;
    
    const checkStatus = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8001/api/drag/status');
        const data = await res.json();
        if (isMounted) {
          const newStatus = data.status;
          setPointsCount(data.points_count);
          
          if (newStatus !== status) {
            setStatus(newStatus);
            if (newStatus === 'finished') {
              fetchData();
            }
          }
        }
      } catch (e) {
        console.error('Failed to poll drag status:', e);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [status]);

  const fetchSessionsList = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/drag/sessions');
      const data = await res.json();
      setSessionsList(data);
    } catch (e) {
      console.error('Failed to fetch drag sessions:', e);
    }
  };

  useEffect(() => {
    fetchSessionsList();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [dataRes, analysisRes] = await Promise.all([
        fetch('http://127.0.0.1:8001/api/drag/data'),
        fetch('http://127.0.0.1:8001/api/drag/analysis')
      ]);
      const data = await dataRes.json();
      const analysisData = await analysisRes.json();
      
      setSessionData(data);
      setAnalysis(analysisData);
    } catch (e) {
      console.error('Failed to fetch drag data or analysis:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrepare = async () => {
    try {
      await fetch('http://127.0.0.1:8001/api/drag/prepare', { method: 'POST' });
      setStatus('waiting');
      setSessionData([]);
      setAnalysis(null);
      setSelectedCompareFilename('');
      setCompareData([]);
      setCompareAnalysis(null);
    } catch (e) {
      console.error('Failed to prepare drag test:', e);
    }
  };

  const handleClear = async () => {
    try {
      await fetch('http://127.0.0.1:8001/api/drag/clear', { method: 'POST' });
      setStatus('idle');
      setSessionData([]);
      setAnalysis(null);
      setSelectedCompareFilename('');
      setCompareData([]);
      setCompareAnalysis(null);
    } catch (e) {
      console.error('Failed to clear drag test:', e);
    }
  };

  const handleSaveSession = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('http://127.0.0.1:8001/api/drag/sessions/save', { method: 'POST' });
      const data = await res.json();
      if (data.message) {
        alert(t('Drag session saved successfully'));
        fetchSessionsList();
      } else if (data.error) {
        alert(data.error);
      }
    } catch (e) {
      console.error('Failed to save drag session:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompareSelect = async (filename: string) => {
    setSelectedCompareFilename(filename);
    if (!filename) {
      setCompareData([]);
      setCompareAnalysis(null);
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/drag/sessions/${filename}`);
      const data = await res.json();
      if (data.data && data.analysis) {
        setCompareData(data.data);
        setCompareAnalysis(data.analysis);
      }
    } catch (e) {
      console.error('Failed to load compare session:', e);
    }
  };

  const handleDeleteSession = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t('Are you sure you want to delete this record?'))) {
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/drag/sessions/${filename}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.message) {
        fetchSessionsList();
        if (selectedCompareFilename === filename) {
          setSelectedCompareFilename('');
          setCompareData([]);
          setCompareAnalysis(null);
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  // Process and align data for Recharts using dual-series connectNulls approach
  const chartData = useMemo(() => {
    const data: any[] = [];
    
    // 1. Process current session
    if (sessionData.length > 0) {
      const step = Math.max(1, Math.ceil(sessionData.length / 1200));
      const dt = analysis?.drivetrain || 'RWD';
      
      for (let i = 0; i < sessionData.length; i += step) {
        const p = sessionData[i];
        const speedVal = convertSpeed(p.SpeedMetersPerSecond);
        
        let slipDiff = 0.0;
        if (dt === 'RWD') {
          slipDiff = Math.abs(p.TireSlipRatio[2] - p.TireSlipRatio[3]);
        } else if (dt === 'FWD') {
          slipDiff = Math.abs(p.TireSlipRatio[0] - p.TireSlipRatio[1]);
        } else {
          slipDiff = (Math.abs(p.TireSlipRatio[0] - p.TireSlipRatio[1]) + Math.abs(p.TireSlipRatio[2] - p.TireSlipRatio[3])) / 2;
        }
        
        data.push({
          time: p.time,
          speed: Number(speedVal.value.toFixed(1)),
          rpm: Math.round(p.CurrentEngineRpm),
          gear: p.Gear,
          throttle: Math.round((p.AccelInput / 255) * 100),
          fl_slip: Number((p.TireSlipRatio[0] * 100).toFixed(1)),
          fr_slip: Number((p.TireSlipRatio[1] * 100).toFixed(1)),
          rl_slip: Number((p.TireSlipRatio[2] * 100).toFixed(1)),
          rr_slip: Number((p.TireSlipRatio[3] * 100).toFixed(1)),
          slip_diff: Number((slipDiff * 100).toFixed(1))
        });
      }
    }
    
    // 2. Process compare session (points will be plotted on same time-axis)
    if (compareData.length > 0 && compareAnalysis) {
      const step = Math.max(1, Math.ceil(compareData.length / 1200));
      const dt = compareAnalysis.drivetrain || 'RWD';
      
      for (let i = 0; i < compareData.length; i += step) {
        const p = compareData[i];
        const speedVal = convertSpeed(p.SpeedMetersPerSecond);
        
        let slipDiff = 0.0;
        if (dt === 'RWD') {
          slipDiff = Math.abs(p.TireSlipRatio[2] - p.TireSlipRatio[3]);
        } else if (dt === 'FWD') {
          slipDiff = Math.abs(p.TireSlipRatio[0] - p.TireSlipRatio[1]);
        } else {
          slipDiff = (Math.abs(p.TireSlipRatio[0] - p.TireSlipRatio[1]) + Math.abs(p.TireSlipRatio[2] - p.TireSlipRatio[3])) / 2;
        }
        
        data.push({
          time: p.time,
          compare_speed: Number(speedVal.value.toFixed(1)),
          compare_rpm: Math.round(p.CurrentEngineRpm),
          compare_gear: p.Gear,
          compare_slip_diff: Number((slipDiff * 100).toFixed(1))
        });
      }
    }
    
    return data.sort((a, b) => a.time - b.time);
  }, [sessionData, compareData, convertSpeed, analysis?.drivetrain, compareAnalysis]);

  const speedUnit = useMemo(() => {
    if (sessionData.length === 0) return 'km/h';
    return convertSpeed(sessionData[0].SpeedMetersPerSecond).label;
  }, [sessionData, convertSpeed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minHeight: '600px' }}>
      
      {/* SECTION 1: Status & Controller */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{t("Drag Test Analysis")}</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t("Analyze launch grip, gear shift RPM drops, and final drive ratio matching.")}
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Comparison Dropdown */}
          {(status === 'idle' || status === 'finished') && sessionsList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Compare with History")}:</span>
              <select 
                value={selectedCompareFilename} 
                onChange={(e) => handleCompareSelect(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'white',
                  padding: '0.45rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  outline: 'none',
                  maxWidth: '240px',
                  cursor: 'pointer'
                }}
              >
                <option value="">{t("None")}</option>
                {sessionsList.map((s) => {
                  const dateStr = new Date(s.timestamp * 1000).toLocaleDateString([], {month: '2-digit', day: '2-digit'}) + ' ' + new Date(s.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                  return (
                    <option key={s.filename} value={s.filename}>
                      [{dateStr}] {s.car_name} ({s.max_speed_kmh} km/h)
                    </option>
                  );
                })}
              </select>
              {selectedCompareFilename && (
                <button 
                  onClick={(e) => handleDeleteSession(selectedCompareFilename, e)}
                  style={{
                    background: 'rgba(255,0,60,0.15)',
                    border: '1px solid rgba(255,0,60,0.3)',
                    color: '#ff3366',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {t("Delete")}
                </button>
              )}
            </div>
          )}

          {status === 'idle' && (
            <button className="btn-primary" onClick={handlePrepare} style={{ padding: '0.6rem 1.5rem', fontWeight: 600, borderRadius: '6px', background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer' }}>
              {t("Start Test")}
            </button>
          )}
          
          {status === 'waiting' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span className="pulse-text" style={{ color: '#ffcc00', fontWeight: 700, fontSize: '0.9rem' }}>
                ⚠️ {t("Waiting for Launch...")}
              </span>
              <button className="btn-secondary" onClick={handleClear} style={{ padding: '0.5rem 1rem', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>
                {t("Cancel")}
              </button>
            </div>
          )}
          
          {status === 'recording' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff003c', boxShadow: '0 0 8px #ff003c' }} className="pulse-dot" />
                <span style={{ color: '#ff003c', fontWeight: 700, fontSize: '0.9rem' }}>
                  {t("RECORDING")} ({pointsCount} pts)
                </span>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t("Release throttle to finish.")}
              </span>
            </div>
          )}
          
          {status === 'finished' && (
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button 
                className="btn-primary" 
                onClick={handleSaveSession} 
                disabled={isSaving}
                style={{ 
                  padding: '0.6rem 1.2rem', fontWeight: 600, borderRadius: '6px', 
                  background: '#00ff66', border: 'none', color: '#111', cursor: 'pointer',
                  opacity: isSaving ? 0.5 : 1
                }}
              >
                {isSaving ? t("Saving...") : t("Save Test")}
              </button>
              <button className="btn-primary" onClick={handlePrepare} style={{ padding: '0.6rem 1.2rem', fontWeight: 600, borderRadius: '6px', background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer' }}>
                {t("New Test")}
              </button>
              <button className="btn-secondary" onClick={handleClear} style={{ padding: '0.6rem 1.2rem', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>
                {t("Clear Data")}
              </button>
            </div>
          )}
        </div>
      </div>

      {analysis && !analysis.path_valid && (
        <div style={{ padding: '0.8rem 1.2rem', background: 'rgba(255, 0, 60, 0.12)', border: '1px solid rgba(255, 0, 60, 0.25)', borderRadius: '8px', color: '#ff3366', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span>⚠️</span>
          <div>
            <strong>{t("Path Validity Warning")}:</strong> {t("Detected significant path deviation")} ({analysis.max_deviation_meters}m). {t("This test may contain turns or severe loss of control, which can distort gearing analysis. Please select a straight road and try again.")}
          </div>
        </div>
      )}

      {/* SECTION 2: Guiding & Instructions (If Idle/Waiting) */}
      {(status === 'idle' || status === 'waiting') && (
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem' }}>🚦</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '500px' }}>
            <h4 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{t("How to perform a Drag Test:")}</h4>
            <ol style={{ textAlign: 'left', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.2rem' }}>
              <li>{t("Click the 'Ready for Test' button above.")}</li>
              <li>{t("Bring your car to a complete stop (0 km/h) in the game.")}</li>
              <li>{t("Floor the throttle (100% Accel) to launch. Recording starts automatically.")}</li>
              <li>{t("Keep accelerating through the gears to test your ratios.")}</li>
              <li>{t("Release the throttle completely when done. The test will automatically stop after 0.8 seconds and generate an optimization report.")}</li>
            </ol>
          </div>
          {status === 'waiting' && (
            <div style={{ marginTop: '1.5rem', padding: '1rem 2rem', background: 'rgba(255, 204, 0, 0.1)', border: '1px solid rgba(255, 204, 0, 0.3)', borderRadius: '8px', color: '#ffcc00', fontWeight: 600, fontSize: '0.95rem' }}>
              {t("Currently waiting for vehicle launch. Please floor the throttle in 1st gear.")}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: Recording Status (If Recording) */}
      {status === 'recording' && (
        <div className="glass-panel" style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <div className="pulse-ring" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px solid #ff003c', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.8rem', color: '#ff003c', fontWeight: 'bold' }}>
            REC
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '1.3rem', color: 'white' }}>{t("Recording Acceleration Data...")}</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {t("Do not release the throttle until you want to finish the test.")}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1rem 2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t("Recorded Frames")}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>{pointsCount}</div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t("Current Gear")}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>{t("Active")}</div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: Analysis & Charts (If Finished) */}
      {status === 'finished' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', flex: 1 }}>
          
          {/* LEFT COLUMN: Charts */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>{t("Telemetry Visualization")}</h4>
              
              <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.2rem', borderRadius: '6px' }}>
                <button 
                  onClick={() => setActiveChart('speed_rpm')}
                  style={{
                    padding: '0.3rem 0.8rem', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer',
                    background: activeChart === 'speed_rpm' ? 'var(--primary)' : 'transparent',
                    color: activeChart === 'speed_rpm' ? 'white' : 'var(--text-secondary)',
                    fontWeight: 600
                  }}
                >
                  {t("Speed & RPM")}
                </button>
                <button 
                  onClick={() => setActiveChart('slip')}
                  style={{
                    padding: '0.3rem 0.8rem', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer',
                    background: activeChart === 'slip' ? 'var(--primary)' : 'transparent',
                    color: activeChart === 'slip' ? 'white' : 'var(--text-secondary)',
                    fontWeight: 600
                  }}
                >
                  {t("Tire Slip")}
                </button>
              </div>
            </div>

            {isLoading ? (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '350px', color: 'var(--text-secondary)' }}>
                {t("Loading analysis...")}
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: '350px', position: 'relative' }}>
                {activeChart === 'speed_rpm' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="time" type="number" name="Time" unit="s" stroke="var(--text-secondary)" tick={{fontSize: 11}} />
                      
                      {/* Left YAxis for Speed */}
                      <YAxis yAxisId="left" stroke="#00f0ff" tick={{fontSize: 11}} label={{ value: `${t("Speed")} (${speedUnit})`, angle: -90, position: 'insideLeft', style: {textAnchor: 'middle', fill: '#00f0ff', fontSize: 11, fontWeight: 600}, offset: 5 }} />
                      
                      {/* Right YAxis for RPM */}
                      <YAxis yAxisId="right" orientation="right" stroke="#ff003c" tick={{fontSize: 11}} label={{ value: 'RPM', angle: 90, position: 'insideRight', style: {textAnchor: 'middle', fill: '#ff003c', fontSize: 11, fontWeight: 600}, offset: 5 }} />
                      
                      <Tooltip 
                        contentStyle={{ background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px' }}
                        labelFormatter={(label) => `${t("Time")}: ${Number(label).toFixed(3)}s`}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: 12}} />
                      
                      <Line yAxisId="left" type="monotone" dataKey="speed" name={t("Speed")} stroke="#00f0ff" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                      <Line yAxisId="right" type="monotone" dataKey="rpm" name="RPM" stroke="#ff003c" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                      <Line yAxisId="left" type="step" dataKey="gear" name={t("Gear")} stroke="#ffaa00" strokeWidth={1.5} dot={false} />
                      
                      {compareAnalysis && (
                        <>
                          <Line yAxisId="left" type="monotone" dataKey="compare_speed" name={`${t("Compare Speed")} (${compareAnalysis.car_name})`} stroke="#00b0d0" strokeWidth={1.5} strokeDasharray="4 4" connectNulls dot={false} />
                          <Line yAxisId="right" type="monotone" dataKey="compare_rpm" name={`Compare RPM (${compareAnalysis.car_name})`} stroke="#d00030" strokeWidth={1.2} strokeDasharray="4 4" connectNulls dot={false} />
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="time" type="number" name="Time" unit="s" stroke="var(--text-secondary)" tick={{fontSize: 11}} />
                      <YAxis stroke="var(--text-secondary)" tick={{fontSize: 11}} label={{ value: `${t("Slip Ratio")} (%)`, angle: -90, position: 'insideLeft', style: {textAnchor: 'middle', fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600}, offset: 5 }} />
                      <Tooltip 
                        contentStyle={{ background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px' }}
                        labelFormatter={(label) => `${t("Time")}: ${Number(label).toFixed(3)}s`}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: 12}} />
                      
                      <Line type="monotone" dataKey="fl_slip" name={t("FL Slip")} stroke="#387908" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="fr_slip" name={t("FR Slip")} stroke="#ff7300" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="rl_slip" name={t("RL Slip")} stroke="#00f0ff" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="rr_slip" name={t("RR Slip")} stroke="#ff003c" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="slip_diff" name={t("Slip Difference")} stroke="#ffcc00" strokeWidth={2.5} strokeDasharray="3 3" dot={false} />
                      {compareAnalysis && (
                        <Line type="monotone" dataKey="compare_slip_diff" name={`${t("Compare Slip Diff")} (${compareAnalysis.car_name})`} stroke="#e6b800" strokeWidth={1.5} strokeDasharray="4 4" connectNulls dot={false} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Analysis & Recommendations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Session Stats Summary */}
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>{t("Run Summary")}</h4>
              {analysis && (
                compareAnalysis ? (
                  /* Comparison Table View */
                  <div style={{ overflowX: 'auto', marginTop: '0.4rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left', background: 'rgba(255,255,255,0.01)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '0.5rem 0.4rem' }}>{t("Metrics")}</th>
                          <th style={{ padding: '0.5rem 0.4rem', color: '#00f0ff' }}>{t("Current Run")}</th>
                          <th style={{ padding: '0.5rem 0.4rem', color: '#ffaa00' }}>{t("Compared Run")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-secondary)' }}>{t("Car Model")}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: 'white' }}>{analysis.car_name}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: 'white' }}>{compareAnalysis.car_name}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-secondary)' }}>{t("Max Speed")}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: '#00f0ff' }}>
                            {analysis.max_speed_kmh} km/h
                          </td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: '#ffaa00' }}>
                            {compareAnalysis.max_speed_kmh} km/h
                            <span style={{ 
                              fontSize: '0.75rem', marginLeft: '0.5rem',
                              color: analysis.max_speed_kmh >= compareAnalysis.max_speed_kmh ? '#ff003c' : '#00ff00' 
                            }}>
                              ({analysis.max_speed_kmh >= compareAnalysis.max_speed_kmh ? '-' : '+'}{(Math.abs(analysis.max_speed_kmh - compareAnalysis.max_speed_kmh)).toFixed(1)})
                            </span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-secondary)' }}>{t("Test Duration")}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: 'white' }}>
                            {analysis.duration} s
                          </td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: 'white' }}>
                            {compareAnalysis.duration} s
                            <span style={{ 
                              fontSize: '0.75rem', marginLeft: '0.5rem',
                              color: analysis.duration <= compareAnalysis.duration ? '#00ff00' : '#ff003c' 
                            }}>
                              ({analysis.duration <= compareAnalysis.duration ? '-' : '+'}{(Math.abs(analysis.duration - compareAnalysis.duration)).toFixed(2)}s)
                            </span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-secondary)' }}>{t("Avg Launch Slip")}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: analysis.launch_slip_percent > 18 ? '#ff003c' : '#00ff00' }}>
                            {analysis.launch_slip_percent}%
                          </td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: compareAnalysis.launch_slip_percent > 18 ? '#ff003c' : '#00ff00' }}>
                            {compareAnalysis.launch_slip_percent}%
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-secondary)' }}>{t("Drivetrain")}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: 'white' }}>{analysis.drivetrain}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: 'white' }}>{compareAnalysis.drivetrain}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Standard Grid View */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.4rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Max Speed")}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00f0ff' }}>
                        {analysis.max_speed_kmh} <span style={{ fontSize: '0.8rem' }}>km/h</span>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Test Duration")}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>
                        {analysis.duration} <span style={{ fontSize: '0.8rem' }}>s</span>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Drivetrain")}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffaa00' }}>
                        {analysis.drivetrain}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Avg Launch Slip")}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: analysis.launch_slip_percent > 18 ? '#ff003c' : '#00ff00' }}>
                        {analysis.launch_slip_percent}%
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Path Deviation")}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: analysis.path_valid ? '#00ff00' : '#ff003c' }}>
                        {analysis.max_deviation_meters} <span style={{ fontSize: '0.8rem' }}>m</span>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t("Yaw Variance")}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>
                        {(analysis.yaw_variance_rad * (180 / Math.PI)).toFixed(1)} <span style={{ fontSize: '0.8rem' }}>°</span>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Gearing Optimization Recommendations */}
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflowY: 'auto', maxHeight: '450px' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                ⚙️ {t("Gearing Tuning Assist")}
              </h4>
              
              {analysis ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', fontSize: '0.85rem', lineHeight: '1.5' }}>
                  
                  {/* 1. Launch / 1st Gear */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 600, color: '#00f0ff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      🟢 {t("1st Gear & Launch")}
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-primary)', background: 'rgba(0,240,255,0.03)', padding: '0.6rem', borderRadius: '6px', borderLeft: '3px solid #00f0ff' }}>
                      {analysis.launch_recommendation}
                    </p>
                  </div>
                  
                  {/* 2. Shifts & Gear Steps */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 600, color: '#ff003c', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      🔴 {t("Individual Gear Ratios")}
                    </div>
                    
                    {/* Shifts Details Table */}
                    {analysis.shifts && analysis.shifts.length > 0 && (
                      <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '0.4rem' }}>{t("Shift")}</th>
                              <th style={{ padding: '0.4rem' }}>{t("Before RPM")}</th>
                              <th style={{ padding: '0.4rem' }}>{t("After RPM")}</th>
                              <th style={{ padding: '0.4rem' }}>{t("RPM Drop")}</th>
                              <th style={{ padding: '0.4rem' }}>{t("Retention")}</th>
                              <th style={{ padding: '0.4rem' }}>{t("Duration")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.shifts.map((s, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.4rem', fontWeight: 600, color: 'white' }}>{s.from_gear} → {s.to_gear}</td>
                                <td style={{ padding: '0.4rem' }}>{s.n_before}</td>
                                <td style={{ padding: '0.4rem' }}>{s.n_after}</td>
                                <td style={{ padding: '0.4rem', color: 'var(--text-secondary)' }}>-{s.rpm_drop}</td>
                                <td style={{ padding: '0.4rem', fontWeight: 600, color: '#ffcc00' }}>{(s.retention * 100).toFixed(1)}%</td>
                                <td style={{ padding: '0.4rem' }}>{s.shift_time}s</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    
                    {analysis.shift_recommendations && analysis.shift_recommendations.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {analysis.shift_recommendations.map((rec, idx) => (
                          <p key={idx} style={{ margin: 0, color: 'var(--text-primary)', background: 'rgba(255,0,60,0.03)', padding: '0.6rem', borderRadius: '6px', borderLeft: '3px solid #ff003c' }}>
                            {rec}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', textAlign: 'center' }}>
                        ✅ {t("All gear ratios step smoothly. No significant RPM drops detected.")}
                      </p>
                    )}
                  </div>
                  
                  {/* 3. Final Drive */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 600, color: '#ffaa00', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      🟡 {t("Final Drive Ratio")}
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-primary)', background: 'rgba(255,170,0,0.03)', padding: '0.6rem', borderRadius: '6px', borderLeft: '3px solid #ffaa00' }}>
                      {analysis.final_drive_recommendation}
                    </p>
                  </div>
                  
                  {/* 4. Stability & Symmetry */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 600, color: '#ffcc00', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      ⚖️ {t("Stability & Straight-line Diagnostics")}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {analysis.stability_diagnostics && analysis.stability_diagnostics.map((diag, idx) => {
                        const isWarning = diag.includes("差速器") || diag.includes("環境提示");
                        return (
                          <p key={idx} style={{ 
                            margin: 0, color: 'var(--text-primary)', 
                            background: isWarning ? 'rgba(255,170,0,0.03)' : 'rgba(0,255,100,0.03)', 
                            padding: '0.6rem', borderRadius: '6px', 
                            borderLeft: isWarning ? '3px solid #ffcc00' : '3px solid #00ff66' 
                          }}>
                            {diag}
                          </p>
                        );
                      })}
                    </div>
                  </div>

                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, color: 'var(--text-secondary)' }}>
                  {t("No recommendations generated yet.")}
                </div>
              )}
            </div>

          </div>
          
        </div>
      )}
    </div>
  );
};

export default DragTestView;
