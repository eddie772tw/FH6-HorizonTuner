import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CarParams } from '../../../context/CarParamsContext';
import { ToggleSwitch } from './ToggleSwitch';
import { btnStyle } from './CommonStyles';

interface DynoChartProps {
  t: (key: string) => string;
  settings: any;
  updateSettings: (s: any) => void;
  carParams: CarParams;
  telemetryData: any;
  testState: 'ready' | 'waiting' | 'recording' | 'completed';
  runDuration: number | null;
  recommendedGear: { gear: number; ratio: number } | null;
  showClearConfirm: boolean;
  setShowClearConfirm: (v: boolean) => void;
  clearDynoCurve: () => Promise<void>;
  setActiveTab?: (tab: any) => void;
  dynoData: any[];
  getPowerLabel: () => string;
  getTorqueLabel: () => string;
}

export const DynoChart: React.FC<DynoChartProps> = ({
  t,
  settings,
  updateSettings,
  carParams,
  telemetryData,
  testState,
  runDuration,
  recommendedGear,
  showClearConfirm,
  setShowClearConfirm,
  clearDynoCurve,
  setActiveTab,
  dynoData,
  getPowerLabel,
  getTorqueLabel
}) => {
  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, minHeight: 0 }}>
      {/* Title row with toggles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.1rem' }}>{t("Live Dyno Curve")}</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setShowClearConfirm(true)}
            style={{
              ...btnStyle,
              background: 'rgba(255, 60, 60, 0.15)',
              color: '#ff6b6b',
              border: '1px solid rgba(255, 60, 60, 0.3)',
              fontSize: '0.8rem',
              padding: '0.3rem 0.6rem'
            }}
          >
            {t("Clear Data")}
          </button>
        </div>
      </div>

      {/* Toggle switches and Gearing controls row */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
        padding: '0.8rem',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '6px',
        fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <ToggleSwitch
            label={t("Dyno Record")}
            checked={settings.dyno_recording}
            onChange={(v) => updateSettings({ dyno_recording: v })}
            color="#00e676"
          />
          
          {settings.dyno_recording && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t("Target Test Gear")}:</span>
                <select
                  value={settings.dyno_test_gear ?? 4}
                  onChange={(e) => updateSettings({ dyno_test_gear: parseInt(e.target.value) })}
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value={0}>{t("Any Gear (Free Run)")}</option>
                  {[1,2,3,4,5,6,7,8,9,10].map(g => (
                    <option key={g} value={g}>{g} {t("st")}</option>
                  ))}
                </select>
              </div>
              
              <ToggleSwitch
                label={t("Filter Tire Slip")}
                checked={settings.dyno_filter_slip ?? true}
                onChange={(v) => updateSettings({ dyno_filter_slip: v })}
                color="#00b4ff"
              />
              
              <ToggleSwitch
                label={t("Filter Gear Shifting Spikes")}
                checked={settings.dyno_filter_transients ?? true}
                onChange={(v) => updateSettings({ dyno_filter_transients: v })}
                color="#00b4ff"
              />
            </>
          )}
        </div>
      </div>

      {/* Guided Dyno Wizard Panel */}
      {settings.dyno_recording && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />
              {t("Dyno Test Wizard")}
            </h3>
            
            {telemetryData && (
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>{t("GEAR")}: <strong style={{ color: 'white' }}>{telemetryData.Gear}</strong></span>
                <span>{t("RPM")}: <strong style={{ color: 'white' }}>{Math.round(telemetryData.CurrentEngineRpm || 0)}</strong></span>
                <span>{t("Throttle")}: <strong style={{ color: 'white' }}>{Math.round((telemetryData.AccelInput || 0) / 2.55)}%</strong></span>
              </div>
            )}
          </div>

          {/* Guided Status Card */}
          {(() => {
            if (!telemetryData) {
              return (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0.5rem 0', fontStyle: 'italic' }}>
                  {t("No car loaded or telemetry inactive. Start driving a car to auto-create profile!")}
                </div>
              );
            }

            const currentGear = telemetryData.Gear || 0;
            const currentRpm = telemetryData.CurrentEngineRpm || 0;
            const maxRpm = telemetryData.EngineMaxRpm || 8000;
            const accel = telemetryData.AccelInput || 0;
            const handbrake = telemetryData.HandBrakeInput || 0;
            const targetGear = settings.dyno_test_gear ?? 4;
            
            // Launch Control active check
            const isLaunching = currentGear === 1 && handbrake > 50 && accel > 200;
            if (isLaunching) {
              return (
                <div style={{
                  background: 'rgba(0, 180, 255, 0.1)',
                  border: '1px solid rgba(0, 180, 255, 0.3)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  color: '#33c5ff',
                  fontSize: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}>
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>🚀</span> {t("🚀 Launch Control Active! Recording paused.")}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: '0.85rem' }}>
                    {t("Launch Control Active. Please perform Dyno test in 4th/5th gear for accuracy.")}
                  </div>
                </div>
              );
            }

            // Slip check
            const drivetrain = carParams.drivetrain || "RWD";
            const slipRatios = telemetryData.TireSlipRatio || [0,0,0,0];
            let isSlipped = false;
            if (settings.dyno_filter_slip ?? true) {
              if (drivetrain === "RWD" && (Math.abs(slipRatios[2]) > 0.10 || Math.abs(slipRatios[3]) > 0.10)) isSlipped = true;
              else if (drivetrain === "FWD" && (Math.abs(slipRatios[0]) > 0.10 || Math.abs(slipRatios[1]) > 0.10)) isSlipped = true;
              else if (drivetrain === "AWD" && slipRatios.some((s: number) => Math.abs(s) > 0.10)) isSlipped = true;
            }

            if (isSlipped && testState === 'recording') {
              return (
                <div style={{
                  background: 'rgba(255, 170, 0, 0.1)',
                  border: '1px solid rgba(255, 170, 0, 0.3)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  color: '#ffaa00',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  animation: 'pulse 1s infinite alternate'
                }}>
                  {t("Tire Slip Detected! Recording paused.")}
                </div>
              );
            }

            switch (testState) {
              case 'ready':
                return (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem'
                  }}>
                    {targetGear === 0 
                      ? t("Ready! Perform a Full Throttle (WOT) run in any gear.") 
                      : t("Please shift to gear {gear} and slow down below 2,000 RPM.").replace('{gear}', targetGear.toString())}
                  </div>
                );
              case 'waiting':
                return (
                  <div style={{
                    background: 'rgba(0, 230, 118, 0.08)',
                    border: '1px solid rgba(0, 230, 118, 0.25)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    color: '#00e676',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}>
                    {t("Ready! Perform a Full Throttle (WOT) run on a straight.")}
                  </div>
                );
              case 'recording':
                const progress = Math.min(100, Math.max(0, ((currentRpm - 2000) / (maxRpm - 2000)) * 100));
                return (
                  <div style={{
                    background: 'rgba(255, 60, 60, 0.08)',
                    border: '1px solid rgba(255, 60, 60, 0.25)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    color: '#ff6b6b',
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    <div style={{ fontWeight: 600 }}>{t("Recording Dyno Curve... Keep Full Throttle!")}</div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: '#ff4444', transition: 'width 0.1s ease' }} />
                    </div>
                  </div>
                );
              case 'completed':
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{
                      background: 'rgba(0, 230, 118, 0.12)',
                      border: '1px solid rgba(0, 230, 118, 0.4)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      color: '#00e676',
                      fontSize: '0.85rem',
                      fontWeight: 600
                    }}>
                      {t("Dyno Run Completed! Check your new curve.")}
                    </div>
                    
                    {runDuration !== null && (
                      <div style={{ fontSize: '0.82rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {runDuration < 3.0 ? (
                          <span style={{ color: '#ffaa00' }}>
                            {t("Run duration too short ({sec}s). Gearing might be too short (high ratio). Low-gear inertial losses can underestimate horsepower. Consider tuning this gear longer (lower ratio) or using a higher gear.").replace('{sec}', runDuration.toFixed(1))}
                          </span>
                        ) : runDuration > 12.0 ? (
                          <span style={{ color: '#ffaa00' }}>
                            {t("Run duration too long ({sec}s). Aerodynamic drag at high speeds will underestimate high-RPM horsepower. Consider tuning this gear shorter (higher ratio) or using a lower gear.").replace('{sec}', runDuration.toFixed(1))}
                          </span>
                        ) : (
                          <span style={{ color: '#00e676' }}>
                            🏆 {t("Run duration optimal ({sec}s). Excellent Dyno measurement quality!").replace('{sec}', runDuration.toFixed(1))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
            }
          })()}

          {/* Gearing Optimization Recommendations or Warnings */}
          {recommendedGear ? (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.4rem',
              fontSize: '0.82rem',
              color: '#00b4ff',
              background: 'rgba(0, 180, 255, 0.05)',
              border: '1px solid rgba(0, 180, 255, 0.15)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px'
            }}>
              <span style={{ flexShrink: 0 }}>💡</span>
              <span>
                {t("Recommended Test Gear: {gear} (Ratio: {ratio}, closest to 1.00)")
                  .replace('{gear}', recommendedGear.gear.toString())
                  .replace('{ratio}', recommendedGear.ratio.toFixed(2))}
              </span>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.82rem',
              color: '#ffaa00',
              background: 'rgba(255, 170, 0, 0.05)',
              border: '1px solid rgba(255, 170, 0, 0.15)',
              padding: '0.75rem',
              borderRadius: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}>
                <span>{t("Gearing data not found for this car. The system cannot recommend the optimal test gear or perform precise diagnostics.")}</span>
              </div>
              <p style={{ margin: 0, opacity: 0.8, fontSize: '0.8rem', lineHeight: '1.4' }}>
                {t("Please complete your gearing setup in Tuning Setup -> Gearing first, save it, and then return here for the Dyno run.")}
              </p>
              {setActiveTab && (
                <button
                  onClick={() => setActiveTab('tuning')}
                  style={{
                    ...btnStyle,
                    background: 'rgba(255, 170, 0, 0.15)',
                    color: '#ffbb33',
                    border: '1px solid rgba(255, 170, 0, 0.3)',
                    fontSize: '0.8rem',
                    padding: '0.3rem 0.6rem',
                    alignSelf: 'flex-start',
                    marginTop: '0.2rem',
                    cursor: 'pointer'
                  }}
                >
                  {t("Go to Gearing Setup")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.85)',
          border: '1px solid rgba(255, 60, 60, 0.5)',
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <span style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>
            {t("⚠ Are you sure you want to clear all Dyno data for this car? This cannot be undone.")}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={async () => {
                await clearDynoCurve();
                setShowClearConfirm(false);
              }}
              style={{
                ...btnStyle,
                background: '#ff4444',
                color: 'white',
                fontSize: '0.85rem',
                padding: '0.35rem 0.75rem'
              }}
            >
              {t("Confirm Clear")}
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              style={{
                ...btnStyle,
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                padding: '0.35rem 0.75rem'
              }}
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
        {t("Drive the car at full throttle in-game to collect horsepower and torque data across RPM ranges. Each RPM point retains up to 50 historical records, filtered using IQR and weighted.")}
      </p>

      <div style={{ flex: 1, minHeight: 0 }}>
        {dynoData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dynoData} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis 
                dataKey="rpm" 
                stroke="var(--text-secondary)" 
                label={{ value: 'Engine RPM', position: 'bottom', fill: 'var(--text-secondary)', offset: -5 }} 
              />
              <YAxis 
                yAxisId="hp" 
                stroke="var(--accent)" 
                tick={false}
                label={{ value: `Power (${getPowerLabel()})`, angle: -90, position: 'insideLeft', fill: 'var(--accent)' }} 
              />
              <YAxis 
                yAxisId="torque" 
                orientation="right" 
                stroke="hsl(120, 80%, 60%)" 
                tick={false}
                label={{ value: `Torque (${getTorqueLabel()})`, angle: -90, position: 'insideRight', fill: 'hsl(120, 80%, 60%)' }} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }}
              />
              <Legend verticalAlign="top" height={24}/>

              {/* Disabled animation for performance on large dataset */}
              <Line isAnimationActive={false} yAxisId="hp" type="monotone" dataKey="hp" name={`Power (${getPowerLabel()})`} stroke="var(--accent)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
              <Line isAnimationActive={false} yAxisId="torque" type="monotone" dataKey="torque" name={`Torque (${getTorqueLabel()})`} stroke="hsl(120, 80%, 60%)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            {settings.dyno_recording
              ? t("No Dyno data collected yet. Please drive at full throttle in-game!")
              : t("Dyno recording is disabled. Enable it to start collecting data.")}
          </div>
        )}
      </div>
    </div>
  );
};
