import React, { memo, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useSettings } from '../../../context/SettingsContext';
import { DiagnosisReport } from '../../../utils/tuningDiagnosis';

interface DiagnosisPanelProps {
  diagnosisReport: DiagnosisReport | null;
  telemetryPoints: any[];
}

const DiagnosisPanelComponent: React.FC<DiagnosisPanelProps> = ({ diagnosisReport, telemetryPoints }) => {
  const { settings, convertSpeed, t } = useSettings();

  // [PERF] Memoize the downsampled telemetry data using a native for-loop
  // to prevent re-allocating a new array and closure on every React render
  // via inline .filter() method, reducing GC pressure and UI stutter.
  const filteredTelemetryPoints = useMemo(() => {
    const result = [];
    for (let i = 0; i < (telemetryPoints?.length || 0); i += 4) {
      result.push(telemetryPoints[i]);
    }
    return result;
  }, [telemetryPoints]);

  if (!diagnosisReport) {
    return (
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        {t("No telemetry file loaded. Please go to Step 3 to select and analyze a session first.")}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '1.5rem', alignItems: 'start' }}>
      {/* Left Side: Dynamic Data Visualizations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Jump height graph (Only for DangerSign or detected jump) */}
        {diagnosisReport.jumpAnalysis && (
          <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>🚀 {t("Danger Sign Height & Airtime Profile")}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}>
              <div>
                <div style={{ color: 'gray' }}>{t("Max Jump Height")}</div>
                <div style={{ fontSize: '1.1rem', color: '#00ffff', fontWeight: 'bold' }}>
                  {settings.units.rideHeight === 'in' 
                    ? `${(diagnosisReport.jumpAnalysis.maxHeightDelta * 3.28084).toFixed(1)} ft` 
                    : `${diagnosisReport.jumpAnalysis.maxHeightDelta.toFixed(1)} m`}
                </div>
              </div>
              <div>
                <div style={{ color: 'gray' }}>{t("Airtime")}</div>
                <div style={{ fontSize: '1.1rem', color: '#00ffff', fontWeight: 'bold' }}>{diagnosisReport.jumpAnalysis.airtime} s</div>
              </div>
              <div>
                <div style={{ color: 'gray' }}>{t("Landing Force")}</div>
                <div style={{ fontSize: '1.1rem', color: diagnosisReport.jumpAnalysis.landingSuspensionMax >= 0.98 ? '#ff3d00' : 'white', fontWeight: 'bold' }}>
                  {diagnosisReport.jumpAnalysis.maxLandingImpactG.toFixed(1)} G
                </div>
              </div>
            </div>
            <div style={{ height: '180px', width: '100%', marginTop: '0.4rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredTelemetryPoints} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
                  <defs>
                    <linearGradient id="heightColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00b4ff" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#00b4ff" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" fontSize={9} />
                  <YAxis stroke="rgba(255,255,255,0.4)" fontSize={9} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }} />
                  <Area isAnimationActive={false} type="monotone" dataKey="PositionY" stroke="#00b4ff" fillOpacity={1} fill="url(#heightColor)" strokeWidth={2} name="PositionY" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Drift Stability Panel */}
        {diagnosisReport.driftAnalysis && (
          <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>💨 {t("Drift Angle & Stability Performance")}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}>
              <div>
                <div style={{ color: 'gray' }}>{t("Avg Drift Angle")}</div>
                <div style={{ fontSize: '1.1rem', color: '#ff9f00', fontWeight: 'bold' }}>{diagnosisReport.driftAnalysis.avgDriftAngle}°</div>
              </div>
              <div>
                <div style={{ color: 'gray' }}>{t("Drift Stability")}</div>
                <div style={{ fontSize: '1.1rem', color: diagnosisReport.driftAnalysis.driftStability >= 75 ? '#00e676' : 'yellow', fontWeight: 'bold' }}>
                  {diagnosisReport.driftAnalysis.driftStability}%
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>{t("Drift Time Ratio")}</div>
                <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>{diagnosisReport.driftAnalysis.driftTimePercent}%</div>
              </div>
            </div>
          </div>
        )}

        {/* Speed Cornering and Powerband efficiency */}
        {diagnosisReport.speedAnalysis && (
          <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>{t("Cornering Speed & Powerband Overlap")}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: 'var(--surface-1)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>{t("Max Speed")}</div>
                <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                  {convertSpeed(diagnosisReport.speedAnalysis.maxSpeed / 3.6).value.toFixed(1)} {convertSpeed(1/3.6).label}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>{t("Corner Speed Loss")}</div>
                <div style={{ fontSize: '1.1rem', color: diagnosisReport.speedAnalysis.speedDropPercent > 35 ? '#ff5f5f' : 'var(--text-primary)', fontWeight: 'bold' }}>
                  {diagnosisReport.speedAnalysis.speedDropPercent}%
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>{t("Powerband Overlap")}</div>
                <div style={{ fontSize: '1.1rem', color: diagnosisReport.speedAnalysis.powerbandEfficiency >= 70 ? '#00e676' : 'yellow', fontWeight: 'bold' }}>
                  {diagnosisReport.speedAnalysis.powerbandEfficiency}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Suspension Travel Chart */}
        <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '0.95rem' }}>{t("Suspension Damping Travel & Bottom-Out Rates")}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--surface-1)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>{t("Front Max Travel:")}</span> <strong style={{ color: 'var(--text-primary)' }}>{(diagnosisReport.suspension.frontMaxTravel * 100).toFixed(0)}%</strong>
              <div style={{ color: diagnosisReport.suspension.frontBottomOutRate > 1.5 ? '#ff3d00' : '#00e676', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                {t("Front Bottom-Out Rate:")} {diagnosisReport.suspension.frontBottomOutRate}%
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>{t("Rear Max Travel:")}</span> <strong style={{ color: 'var(--text-primary)' }}>{(diagnosisReport.suspension.rearMaxTravel * 100).toFixed(0)}%</strong>
              <div style={{ color: diagnosisReport.suspension.rearBottomOutRate > 1.5 ? '#ff3d00' : '#00e676', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                {t("Rear Bottom-Out Rate:")} {diagnosisReport.suspension.rearBottomOutRate}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Specific Correction Advice */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Automatic corrections */}
        <div className="glass-panel" style={{ padding: '1.2rem', border: '1px solid rgba(0, 180, 255, 0.2)', background: 'rgba(0, 180, 255, 0.03)' }}>
          <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', fontSize: '0.95rem' }}>🔧 {t("Recommended Correction Settings")}</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '300px', overflowY: 'auto' }}>
            {diagnosisReport.suspension.advice.map((adv, idx) => (
              <div key={`susp-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #ffaa00', background: 'rgba(255,170,0,0.03)' }}>{adv}</div>
            ))}
            {diagnosisReport.jumpAnalysis?.advice.map((adv, idx) => (
              <div key={`jump-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #00b4ff', background: 'rgba(0,180,255,0.03)' }}>{adv}</div>
            ))}
            {diagnosisReport.driftAnalysis?.advice.map((adv, idx) => (
              <div key={`drift-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #ff9f00', background: 'rgba(255,159,0,0.03)' }}>{adv}</div>
            ))}
            {diagnosisReport.speedAnalysis?.advice.map((adv, idx) => (
              <div key={`speed-adv-${idx}`} style={{ fontSize: '0.85rem', lineHeight: '1.3', padding: '0.4rem', borderLeft: '3px solid #00e676', background: 'rgba(0,230,118,0.03)' }}>{adv}</div>
            ))}
          </div>
        </div>

        {/* Manual Diagnostic Guide Zone */}
        <div className="glass-panel" style={{ padding: '1.2rem', background: 'rgba(255, 170, 0, 0.03)', border: '1px solid rgba(255, 170, 0, 0.15)' }}>
          <h4 style={{ margin: '0 0 0.8rem 0', color: '#ffaa00', fontSize: '0.95rem' }}>📖 {t("Manual Telemetry Diagnostic Guide")}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
            <div>
              <strong style={{ color: 'white' }}>{t("1. Camber Temperature Difference:")}</strong><br />
              {t("Forza UDP telemetry does not provide inner/center/outer tire temps. During high lateral G cornering, open game telemetry UI and check FL/FR/RL/RR tire temp blocks. Outer side temp should be slightly warmer than inner (ideal diff: 2-5°C). If outer side is too hot, increase negative Camber (e.g. -1.5 to -2.0).")}
            </div>
            <div>
              <strong style={{ color: 'white' }}>{t("2. Tire Pressure Status:")}</strong><br />
              {t("Forza UDP telemetry does not output tire pressure. Drive 2-3 laps and check tire temperature color. Light green is optimal; light blue is cold (under-inflated); orange/red is hot (over-inflated). Adjust cold tire pressure accordingly by +/- 0.1 Bar.")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DiagnosisPanel = memo(DiagnosisPanelComponent);
