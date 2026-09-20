import React, { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { useSettings } from '../../../context/SettingsContext';
import { computeGearingChartData } from './gearingChartData';

interface GearingTunerProps {
  tuning: any;
  updateSection?: (section: any, field: string, value: any) => void;
  numGears: number;
  carParams?: any;
  gearingMethod?: string;
  showCorrections?: boolean;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  color: 'var(--input-text)',
  borderRadius: '4px'
};

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const GearingTunerComponent: React.FC<GearingTunerProps> = ({
  tuning,
  updateSection,
  numGears,
  carParams,
  showCorrections = true
}) => {
  const { settings, convertSpeed, t } = useSettings();
  const speedLabel = settings.units.speed === 'mph' ? 'mph' : 'km/h';
  const displaySpeed = (kmh: number) => settings.units.speed === 'mph' ? kmh * 0.621371 : kmh;
  const speedToKmh = (value: number) => settings.units.speed === 'mph' ? value / 0.621371 : value;

  // Compute speed-rpm chart data with shift-chained starting points (Gear N starts at Gear N-1 cutoffRpm speed)
  const { chartData, xMax, yMax, cutoffRpm } = useMemo(() => {
    // 1. Calculate Rear Tire Radius in meters
    let tireRadiusM = 0.32;
    if (carParams?.rearTireWidth && carParams?.rearTireAspect && carParams?.rearTireRim) {
      const wallMm = (carParams.rearTireWidth * carParams.rearTireAspect) / 100;
      const rimMm = carParams.rearTireRim * 25.4;
      const diameterM = (wallMm * 2 + rimMm) / 1000;
      tireRadiusM = diameterM / 2;
    }

    const effectiveRedline = tuning?.gearing?.effectiveRedline || carParams?.effectiveRedline;

    return computeGearingChartData({
      numGears,
      gears: tuning?.gearing?.gears || [],
      finalDrive: tuning?.gearing?.finalDrive || 3.40,
      maxRpm: tuning?.gearing?.maxRpm,
      effectiveRedline,
      maxHpRpm: carParams?.maxHpRpm,
      tireRadiusM,
      speedUnit: settings.units.speed,
      convertSpeed,
      simulatedTopSpeed: tuning?.gearing?.simulatedTopSpeed,
      softMaxSpeed: tuning?.gearing?.softMaxSpeed
    });
  }, [
    tuning?.gearing?.finalDrive,
    tuning?.gearing?.gears,
    tuning?.gearing?.maxRpm,
    tuning?.gearing?.effectiveRedline,
    tuning?.gearing?.simulatedTopSpeed,
    tuning?.gearing?.softMaxSpeed,
    numGears,
    carParams,
    settings.units.speed,
    convertSpeed
  ]);

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem', marginTop: '0.5rem' }}>
      <div style={{ marginBottom: '0.8rem' }}>
        <h4 style={{ margin: 0, color: 'white', fontSize: '0.95rem' }}>{t("AEGO Optimized Gear Ratios & Dynamic Curve")}</h4>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.2rem', alignItems: 'start' }}>

        {/* Left Column: Final Drive & Gears Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '320px', overflowY: 'auto' }}>
            <div style={{ ...formRowStyle, marginBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>{t("Final Drive Ratio (FD)")}</span>
              <input
                type="number" step="0.01" value={tuning.gearing.finalDrive}
                readOnly
                title={t("Auto-calculated by AEGO algorithm")}
                style={{ ...inputStyle, width: '80px', padding: '0.3rem', fontSize: '0.9rem', textAlign: 'right', border: '1px solid var(--primary)', opacity: 0.85, cursor: 'not-allowed' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Array.from({length: numGears}).map((_, i) => (
                <div key={`gear-in-${i}`} style={{ ...formRowStyle, background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Gear")} {i + 1}</span>
                  <input
                    type="number" step="0.01" value={tuning.gearing.gears[i] || 0.0}
                    readOnly
                    title={t("Auto-calculated by AEGO algorithm")}
                    style={{ ...inputStyle, width: '65px', padding: '0.25rem', fontSize: '0.85rem', textAlign: 'right', opacity: 0.85, cursor: 'not-allowed' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Secondary Correction Mechanism Input Card */}
          {showCorrections && <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.6rem' }}>
              {t("Secondary Correction Mechanism")}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                  {t("Simulated Top Speed")} ({speedLabel})
                </label>
                <input
                  type="number"
                  placeholder="e.g. 280"
                  value={tuning?.gearing?.simulatedTopSpeed ? displaySpeed(tuning.gearing.simulatedTopSpeed).toFixed(1) : ''}
                  onChange={e => updateSection && updateSection('gearing', 'simulatedTopSpeed', e.target.value ? speedToKmh(parseFloat(e.target.value)) : undefined)}
                  style={{ ...inputStyle, width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                  title={t("In-game simulated or actual top speed under baseline gearing to correct aero & grip drag")}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                  {t("Soft Max Speed Cap")} ({speedLabel})
                </label>
                <input
                  type="number"
                  placeholder="e.g. 310"
                  value={tuning?.gearing?.softMaxSpeed ? displaySpeed(tuning.gearing.softMaxSpeed).toFixed(1) : ''}
                  onChange={e => updateSection && updateSection('gearing', 'softMaxSpeed', e.target.value ? speedToKmh(parseFloat(e.target.value)) : undefined)}
                  style={{ ...inputStyle, width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                  title={t("Speed limits on the X-axis right end of the in-game transmission preview chart")}
                />
              </div>
            </div>
          </div>}

        </div>

        {/* Right Column: Speed-RPM LineChart Graph */}
        <div style={{ height: '440px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.8rem', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 15, right: 15, bottom: 5, left: -15 }}>
              <XAxis dataKey="speed" type="number" domain={[0, xMax || 400]} stroke="rgba(255,255,255,0.4)" fontSize={10} unit={` ${speedLabel}`} />
              <YAxis type="number" domain={[0, yMax || 9000]} stroke="rgba(255,255,255,0.4)" fontSize={10} unit=" RPM" />
              {/* 3. Effective Powerband Highlight Range (Semi-transparent background area) */}
              {Boolean(carParams?.maxHpRpm && carParams?.maxTorqueRpm) && (
                <ReferenceArea
                  y1={Math.min(carParams.maxTorqueRpm, carParams.maxHpRpm)}
                  y2={Math.max(carParams.maxTorqueRpm, carParams.maxHpRpm)}
                  fill="rgba(0, 230, 118, 0.08)"
                  stroke="rgba(0, 230, 118, 0.25)"
                  strokeDasharray="2 2"
                  label={{ value: t("Effective Powerband"), fill: 'rgba(0, 230, 118, 0.6)', fontSize: 10, position: 'insideTopLeft' }}
                />
              )}

              {/* 0. Rev Limiter / Cutoff RPM horizontal dashed line */}
              {Boolean(cutoffRpm && cutoffRpm > 0) && (
                <ReferenceLine
                  y={cutoffRpm}
                  stroke="#ff1744"
                  strokeDasharray="4 2"
                  label={{
                    value: `${t("Rev Limiter")}: ${Math.round(cutoffRpm)} RPM`,
                    fill: '#ff1744',
                    fontSize: 10,
                    position: 'insideTopRight'
                  }}
                />
              )}

              {/* 1. Max HP horizontal dashed line */}
              {carParams?.maxHpRpm && (
                <ReferenceLine
                  y={carParams.maxHpRpm}
                  stroke="#ff3d00"
                  strokeDasharray="3 3"
                  label={{ value: `${t("Max HP")}: ${Math.round(carParams.maxHpRpm)} RPM`, fill: '#ff3d00', fontSize: 10, position: 'top' }}
                />
              )}

              {/* 2. Max Torque horizontal dashed line */}
              {carParams?.maxTorqueRpm && (
                <ReferenceLine
                  y={carParams.maxTorqueRpm}
                  stroke="#ffaa00"
                  strokeDasharray="3 3"
                  label={{ value: `${t("Max Torque")}: ${Math.round(carParams.maxTorqueRpm)} RPM`, fill: '#ffaa00', fontSize: 10, position: 'bottom' }}
                />
              )}

              {/* 4. Simulated Top Speed Vertical Reference Line */}
              {Boolean(tuning?.gearing?.simulatedTopSpeed && tuning.gearing.simulatedTopSpeed > 0) && (
                <ReferenceLine
                  x={displaySpeed(tuning.gearing.simulatedTopSpeed)}
                  stroke="#00e5ff"
                  strokeDasharray="3 3"
                  label={{ value: `${t("Simulated Top Speed")}: ${displaySpeed(tuning.gearing.simulatedTopSpeed).toFixed(1)} ${speedLabel}`, fill: '#00e5ff', fontSize: 10, position: 'insideTopLeft' }}
                />
              )}

              {/* 5. Soft Max Speed Cap Vertical Reference Line */}
              {Boolean(tuning?.gearing?.softMaxSpeed && tuning.gearing.softMaxSpeed > 0) && (
                <ReferenceLine
                  x={displaySpeed(tuning.gearing.softMaxSpeed)}
                  stroke="#d500f9"
                  strokeDasharray="4 4"
                  label={{ value: `${t("Soft Cap")}: ${displaySpeed(tuning.gearing.softMaxSpeed).toFixed(1)} ${speedLabel}`, fill: '#d500f9', fontSize: 10, position: 'insideTopRight' }}
                />
              )}

              {Array.from({length: numGears}).map((_, i) => (
                <Line
                  key={`gear-graph-${i}`}
                  type="linear"
                  dataKey={`gear${i+1}`}
                  stroke={`hsl(${i * 45}, 85%, 60%)`}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={true}
                  name={`${i + 1} Gear`}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
};

export const GearingTuner = memo(GearingTunerComponent);
