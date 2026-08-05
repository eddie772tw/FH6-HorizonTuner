import React, { useState, useEffect } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';
import { useTelemetry } from '../../../hooks/useTelemetry';
import { evaluateTireTelemetryDiagnosis } from '../../../utils/tuningDiagnosis';
import { ChassisTuningResult } from '../../../utils/tuningMath';

interface Step5TelemetryCalibrationProps {
  selectedRaceGoal: string;
  carParams: CarParams | null;
  chassisTuning: ChassisTuningResult | null;
  targetPhot: number;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'white',
  padding: '0.4rem 0.6rem',
  borderRadius: '6px',
  fontSize: '0.9rem',
  width: '100px',
  textAlign: 'right'
};

const selectStyle: React.CSSProperties = {
  background: 'black',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'white',
  padding: '0.4rem 0.6rem',
  borderRadius: '6px',
  fontSize: '0.85rem',
  width: '100%'
};

export const Step5TelemetryCalibration: React.FC<Step5TelemetryCalibrationProps> = ({
  selectedRaceGoal,
  carParams,
  chassisTuning,
  targetPhot
}) => {
  const { t } = useSettings();
  const { data: telemetry, isConnected } = useTelemetry();

  // Telemetry Inputs state
  const [photF, setPhotF] = useState<number>(33.5);
  const [photR, setPhotR] = useState<number>(32.5);
  const [tempF, setTempF] = useState<number>(92);
  const [tempR, setTempR] = useState<number>(88);
  const [handlingIssue, setHandlingIssue] = useState<string>('none');
  const [autoSyncTemp, setAutoSyncTemp] = useState<boolean>(true);

  // Auto sync live tire temperatures from UDP Telemetry if connected & enabled
  useEffect(() => {
    if (autoSyncTemp && telemetry && Array.isArray(telemetry.TireTemp) && telemetry.TireTemp.length >= 4) {
      const fl = telemetry.TireTemp[0] || 0;
      const fr = telemetry.TireTemp[1] || 0;
      const rl = telemetry.TireTemp[2] || 0;
      const rr = telemetry.TireTemp[3] || 0;

      if (fl > 0 || fr > 0 || rl > 0 || rr > 0) {
        const avgF = Math.round((fl + fr) / 2);
        const avgR = Math.round((rl + rr) / 2);
        setTempF(avgF);
        setTempR(avgR);
      }
    }
  }, [telemetry, autoSyncTemp]);

  if (!carParams) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', color: 'gray' }}>
        {t("Please define basic vehicle parameters in Step 1 first.")}
      </div>
    );
  }

  // Calculate closed-loop diagnosis
  const diagResult = evaluateTireTelemetryDiagnosis({
    photF,
    photR,
    tempF,
    tempR,
    targetPhot: targetPhot || 32.5,
    handlingIssue,
    chassis: chassisTuning
  });

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      
      {/* Header & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
            Step 5: {t("Dynamic Telemetry Closed-Loop Calibration")} ({selectedRaceGoal})
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {t("Closed-loop telemetry diagnosis with live temperature sync and pressure fine-tuning")}
          </p>
        </div>


        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.4)', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ height: '8px', width: '8px', borderRadius: '50%', background: isConnected ? '#00e676' : 'gray' }} />
          <span style={{ color: isConnected ? '#00e676' : 'gray', fontWeight: 600 }}>
            {isConnected ? t("UDP Telemetry Active") : t("UDP Offline / Manual Mode")}
          </span>
        </div>
      </div>

      {/* Prominent Text Banner regarding Telemetry Tire Pressure vs Temperature */}
      <div style={{ background: 'rgba(0, 180, 255, 0.08)', border: '1px solid rgba(0, 180, 255, 0.2)', padding: '0.9rem 1.2rem', borderRadius: '8px', fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
        <strong style={{ color: '#00b4d8' }}>{t("Telemetry Input Notice:")} </strong>
        {t("Forza UDP telemetry stream provides live 4-wheel tire temperatures (auto-synced below), but does NOT export real-time tire pressures. Please open the in-game Telemetry HUD after 2 laps of test driving, note your observed Hot Pressures (Phot), and enter them below for closed-loop diagnosis.")}
      </div>

      {/* Grid: Inputs (Left) & Diagnosis Outputs (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: '1.2rem' }}>
        
        {/* Left Column: Telemetry Readings Form */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ margin: 0, color: 'white', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t("Observed Telemetry Data")}</span>
            <label style={{ fontSize: '0.75rem', color: '#00b4d8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input 
                type="checkbox" 
                checked={autoSyncTemp} 
                onChange={e => setAutoSyncTemp(e.target.checked)} 
              />
              {t("Auto Sync Temps")}
            </label>
          </h4>

          {/* 1. Hot Pressure Inputs (PSI) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              1. {t("Observed Hot Pressures (Phot) (PSI)")}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.8rem', color: 'gray' }}>{t("Front Hot")}</span>
                <input 
                  type="number" 
                  value={photF} 
                  step="0.1" 
                  onChange={e => setPhotF(parseFloat(e.target.value) || 0)} 
                  style={{ ...inputStyle, border: '1px solid #00b4d8' }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.8rem', color: 'gray' }}>{t("Rear Hot")}</span>
                <input 
                  type="number" 
                  value={photR} 
                  step="0.1" 
                  onChange={e => setPhotR(parseFloat(e.target.value) || 0)} 
                  style={{ ...inputStyle, border: '1px solid #00b4d8' }} 
                />
              </div>
            </div>
          </div>

          {/* 2. Tire Temperature Inputs (deg C) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              2. {t("Axle Average Temperatures (°C)")}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.8rem', color: 'gray' }}>{t("Front Avg Temp")}</span>
                <input 
                  type="number" 
                  value={tempF} 
                  step="1" 
                  onChange={e => setTempF(parseFloat(e.target.value) || 0)} 
                  style={{ ...inputStyle }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ fontSize: '0.8rem', color: 'gray' }}>{t("Rear Avg Temp")}</span>
                <input 
                  type="number" 
                  value={tempR} 
                  step="1" 
                  onChange={e => setTempR(parseFloat(e.target.value) || 0)} 
                  style={{ ...inputStyle }} 
                />
              </div>
            </div>
          </div>

          {/* 3. Observed Handling Anomaly */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              3. {t("Dynamic Handling Anomaly")}
            </span>
            <select 
              value={handlingIssue} 
              onChange={e => setHandlingIssue(e.target.value)} 
              style={selectStyle}
            >
              <option value="none">{t("Balanced / Neutral Handling")}</option>
              <option value="understeer_entry">{t("Understeer on Entry")}</option>
              <option value="understeer_mid">{t("Understeer at Corner Apex")}</option>
              <option value="oversteer_snap">{t("Snap Oversteer / Tail Out")}</option>
              <option value="braking_lockup">{t("Front Wheel Lockup under Braking")}</option>
              <option value="cold_tires">{t("Tires Too Cold / Cannot Heat Up")}</option>
            </select>
          </div>
        </div>

        {/* Right Column: Closed-Loop Micro-adjustments Report */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Health Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
            
            {/* Axle Delta Temp */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.7rem', color: 'gray', display: 'block' }}>{t("Axle Temp Delta")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'block', margin: '0.2rem 0' }}>
                {diagResult.deltaTaxle >= 0 ? '+' : ''}{diagResult.deltaTaxle} °C
              </span>
              <span style={{ fontSize: '0.7rem', color: diagResult.axleBalanceStatus === 'balanced' ? '#00e676' : (diagResult.axleBalanceStatus === 'front_overheat' ? '#ff2a5f' : '#ffb703') }}>
                {diagResult.axleBalanceStatus === 'balanced' && t("Balanced")}
                {diagResult.axleBalanceStatus === 'front_overheat' && t("Front Overheat")}
                {diagResult.axleBalanceStatus === 'rear_overheat' && t("Rear Overheat")}
              </span>
            </div>

            {/* Front Hot Bias */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.7rem', color: 'gray', display: 'block' }}>{t("Front Hot Bias")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'block', margin: '0.2rem 0' }}>
                {diagResult.biasF >= 0 ? '+' : ''}{diagResult.biasF} PSI
              </span>
              <span style={{ fontSize: '0.7rem', color: Math.abs(diagResult.biasF) <= 0.3 ? '#00e676' : '#ff2a5f' }}>
                {Math.abs(diagResult.biasF) <= 0.3 ? t("On Target") : (diagResult.biasF > 0 ? t("High") : t("Low"))}
              </span>
            </div>

            {/* Rear Hot Bias */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.7rem', color: 'gray', display: 'block' }}>{t("Rear Hot Bias")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'block', margin: '0.2rem 0' }}>
                {diagResult.biasR >= 0 ? '+' : ''}{diagResult.biasR} PSI
              </span>
              <span style={{ fontSize: '0.7rem', color: Math.abs(diagResult.biasR) <= 0.3 ? '#00e676' : '#ff2a5f' }}>
                {Math.abs(diagResult.biasR) <= 0.3 ? t("On Target") : (diagResult.biasR > 0 ? t("High") : t("Low"))}
              </span>
            </div>

          </div>

          {/* Actionable Micro-Adjustments Card */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1 }}>
            <h4 style={{ margin: 0, color: 'white', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t("Actionable Micro-Adjustments")}</span>
              <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', borderRadius: '4px', background: diagResult.isConverged ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 42, 95, 0.2)', color: diagResult.isConverged ? '#00e676' : '#ff2a5f', fontWeight: 'bold' }}>
                {diagResult.isConverged ? t("Converged") : t("Adjustment Required")}
              </span>
            </h4>

            {/* Directive 1: Cold Pressure */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '6px', borderLeft: '3px solid #00b4d8' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00b4d8', display: 'block', marginBottom: '0.2rem' }}>
                {t("Priority 1: Cold Tire Pressure Directive")}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'white', lineHeight: '1.4' }}>
                {diagResult.primaryPressureAdvice}
              </span>
            </div>

            {/* Directive 2: Suspension & Geometry */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '6px', borderLeft: '3px solid #ffb703' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ffb703', display: 'block', marginBottom: '0.2rem' }}>
                {t("Priority 2: Alignment & Suspension Linkage Directive")}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'white', lineHeight: '1.4' }}>
                {diagResult.secondarySuspensionAdvice}
              </span>
            </div>

            {/* Convergence Note */}
            <div style={{ fontSize: '0.75rem', color: 'gray', marginTop: 'auto', paddingTop: '0.4rem' }}>
              {t("Iterative loop: After applying micro-adjustments in-game, re-test drive for 2 laps to ensure hot pressure converges within target range.")}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
