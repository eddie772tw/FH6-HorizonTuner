import React, { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { CarParams } from '../../../context/CarParamsContext';
import { useTelemetry } from '../../../hooks/useTelemetry';
import {
  evaluateTireTelemetryDiagnosis,
  buildBaselineSetup,
  AppliedTuningSetup,
  SpecificAdjustmentItem,
  TuningTelemetryEvent,
  collectTuningTelemetryEvents,
  revalidateTuningEventsOnSetupChange,
  isTireOverheated
} from '../../../utils/tuningDiagnosis';
import { ChassisTuningResult } from '../../../utils/tuningMath';
import { AppliedSetupTable } from './AppliedSetupTable';

interface Step5TelemetryCalibrationProps {
  selectedRaceGoal: string;
  carParams: CarParams | null;
  chassisTuning: ChassisTuningResult | null;
  alignment?: {
    camber: { front: number; rear: number };
    toe: { front: number | string; rear: number | string };
    caster: number;
    pcF?: number;
    pcR?: number;
  } | null;
  targetPhot?: number;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  color: 'var(--input-text)',
  padding: '0.35rem 0.5rem',
  borderRadius: '4px',
  fontSize: '0.85rem',
  width: '90px',
  textAlign: 'right'
};

const selectStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  color: 'var(--input-text)',
  padding: '0.35rem 0.5rem',
  borderRadius: '4px',
  fontSize: '0.85rem',
  width: '100%'
};

export const Step5TelemetryCalibration: React.FC<Step5TelemetryCalibrationProps> = ({
  selectedRaceGoal,
  carParams,
  chassisTuning,
  alignment,
  targetPhot = 32.5
}) => {
  const { convertTemp, convertTirePressureFromPsi, convertTirePressureToPsi, t } = useSettings();
  const { data: telemetry, isConnected } = useTelemetry();

  const tempUnitObj = convertTemp(0);
  const tempUnitLabel = tempUnitObj.label;
  const tempUnit: 'C' | 'F' = tempUnitLabel.includes('F') ? 'F' : 'C';
  const pressureUnitLabel = convertTirePressureFromPsi(1).label;

  // 1. Applied Setup Table State (Editable baseline for regression monitoring)
  const initialBaseline = useMemo(() => {
    return buildBaselineSetup(carParams, chassisTuning, alignment, targetPhot);
  }, [carParams, chassisTuning, alignment, targetPhot]);

  const [appliedSetup, setAppliedSetup] = useState<AppliedTuningSetup>(initialBaseline);
  const [tuningEvents, setTuningEvents] = useState<TuningTelemetryEvent[]>([]);
  const [eventFilter, setEventFilter] = useState<'active' | 'applied' | 'all'>('active');

  // Sync baseline when switching car
  useEffect(() => {
    setAppliedSetup(initialBaseline);
  }, [initialBaseline]);

  const handleSetupChange = (field: keyof AppliedTuningSetup, value: number) => {
    setAppliedSetup(prev => {
      const updated = { ...prev, [field]: value };
      setTuningEvents(events => revalidateTuningEventsOnSetupChange(events, updated));
      return updated;
    });
  };

  const handleResetSetup = () => {
    setAppliedSetup(initialBaseline);
    setTuningEvents(events => revalidateTuningEventsOnSetupChange(events, initialBaseline));
  };

  // 2. Optional Manual Inputs
  const [photF, setPhotF] = useState<number>(0);
  const [photR, setPhotR] = useState<number>(0);
  const [handlingIssue, setHandlingIssue] = useState<string>('none');
  const [showManualInputs, setShowManualInputs] = useState<boolean>(false);

  // 3. Extract live telemetry signals (Objective 60Hz UDP data)
  const telemetryGripMetrics = useMemo(() => {
    if (!telemetry) return null;
    const slipRatio = Array.isArray(telemetry.TireSlipRatio) ? telemetry.TireSlipRatio : [0, 0, 0, 0];
    const slipAngle = Array.isArray(telemetry.TireSlipAngle) ? telemetry.TireSlipAngle : [0, 0, 0, 0];
    const suspTravel = Array.isArray(telemetry.NormalizedSuspensionTravel) ? telemetry.NormalizedSuspensionTravel : [0, 0, 0, 0];
    const tireTemps = Array.isArray(telemetry.TireTemp) ? telemetry.TireTemp : [0, 0, 0, 0];

    const slipAngleDeg = slipAngle.map(a => Math.abs(a) * (180 / Math.PI));

    const toUserTemp = (fVal: number) => {
      if (tempUnit === 'C') return Math.round((fVal - 32) * 5 / 9);
      return Math.round(fVal);
    };

    const accelXG = (telemetry.AccelerationX || 0) / 9.81;
    const accelYG = (telemetry.AccelerationY || 0) / 9.81;
    const accelZG = (telemetry.AccelerationZ || 0) / 9.81;
    const speedKmh = (telemetry.SpeedMetersPerSecond || 0) * 3.6;
    const powerHp = (telemetry.PowerWatts || 0) / 745.7;
    const boostPsi = Math.max(0, telemetry.Boost || 0);

    return {
      avgSlipRatioF: (slipRatio[0] + slipRatio[1]) / 2,
      avgSlipRatioR: (slipRatio[2] + slipRatio[3]) / 2,
      maxSlipAngleF: Math.max(slipAngleDeg[0], slipAngleDeg[1]),
      maxSlipAngleR: Math.max(slipAngleDeg[2], slipAngleDeg[3]),
      maxSuspTravelF: Math.max(suspTravel[0], suspTravel[1]),
      maxSuspTravelR: Math.max(suspTravel[2], suspTravel[3]),
      suspTravelFL: suspTravel[0],
      suspTravelFR: suspTravel[1],
      suspTravelRL: suspTravel[2],
      suspTravelRR: suspTravel[3],
      slipAngleFL: slipAngleDeg[0],
      slipAngleFR: slipAngleDeg[1],
      slipAngleRL: slipAngleDeg[2],
      slipAngleRR: slipAngleDeg[3],
      slipRatioFL: slipRatio[0],
      slipRatioFR: slipRatio[1],
      slipRatioRL: slipRatio[2],
      slipRatioRR: slipRatio[3],
      tireTempFL: toUserTemp(tireTemps[0] || 0),
      tireTempFR: toUserTemp(tireTemps[1] || 0),
      tireTempRL: toUserTemp(tireTemps[2] || 0),
      tireTempRR: toUserTemp(tireTemps[3] || 0),
      accelXG,
      accelYG,
      accelZG,
      pitchRad: telemetry.Pitch || 0,
      rollRad: telemetry.Roll || 0,
      yawRad: telemetry.Yaw || 0,
      currentRpm: telemetry.CurrentEngineRpm,
      engineMaxRpm: telemetry.EngineMaxRpm,
      currentGear: telemetry.Gear,
      speedKmh,
      powerHp,
      torqueNm: telemetry.TorqueNewtons,
      boostPsi,
      steerInput: telemetry.SteerInput,
      accelInput: telemetry.AccelInput,
      brakeInput: telemetry.BrakeInput,
      clutchInput: telemetry.ClutchInput,
      handbrakeInput: telemetry.HandBrakeInput
    };
  }, [telemetry, tempUnit]);

  // Calculate closed-loop diagnosis driven primarily by objective telemetry
  const diagResult = useMemo(() => {
    return evaluateTireTelemetryDiagnosis({
      photF: photF > 0 ? photF : undefined,
      photR: photR > 0 ? photR : undefined,
      targetPhot,
      handlingIssue,
      tempUnit,
      currentSetup: appliedSetup,
      alignment,
      chassis: chassisTuning,
      telemetryGripMetrics
    });
  }, [photF, photR, targetPhot, handlingIssue, tempUnit, appliedSetup, alignment, chassisTuning, telemetryGripMetrics]);

  // Automatically accumulate test drive events into the session feed
  useEffect(() => {
    if (diagResult.specificAdjustments.length > 0) {
      setTuningEvents(prev => collectTuningTelemetryEvents(prev, diagResult, telemetry?.LapNumber));
    }
  }, [diagResult, telemetry?.LapNumber]);

  // Handle single adjustment adoption
  const handleApplyAdjustment = (item: SpecificAdjustmentItem) => {
    setAppliedSetup(prev => {
      const updated = {
        ...prev,
        [item.parameterKey]: item.target
      };
      setTuningEvents(events => revalidateTuningEventsOnSetupChange(events, updated));
      return updated;
    });
  };

  // Handle batch adjustments adoption
  const handleApplyAllAdjustments = (items: SpecificAdjustmentItem[]) => {
    setAppliedSetup(prev => {
      const updated = { ...prev };
      items.forEach(item => {
        (updated as any)[item.parameterKey] = item.target;
      });
      setTuningEvents(events => revalidateTuningEventsOnSetupChange(events, updated));
      return updated;
    });
  };

  const handleClearEvents = () => {
    setTuningEvents([]);
  };

  if (!carParams) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', color: 'gray' }}>
        {t("Please define basic vehicle parameters in Step 1 first.")}
      </div>
    );
  }

  const displayedPhotF = convertTirePressureFromPsi(photF);
  const displayedPhotR = convertTirePressureFromPsi(photR);
  const isAwd = carParams.drivetrain === 'AWD';

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      
      {/* Header & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
            Step 5: {t("Dynamic Telemetry Closed-Loop Calibration")} ({selectedRaceGoal})
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {t("Objective telemetry-driven closed-loop tuning with 4-wheel dynamics diagnosis, setup override and one-click recommendation adoption")}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.4)', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ height: '8px', width: '8px', borderRadius: '50%', background: isConnected ? '#00e676' : 'gray' }} />
          <span style={{ color: isConnected ? '#00e676' : 'gray', fontWeight: 600 }}>
            {isConnected ? t("UDP Telemetry Active (60Hz)") : t("UDP Offline / Static Mode")}
          </span>
        </div>
      </div>

      {/* Main Grid: Left (4-Wheel Telemetry Dashboard + Applied Setup Table) vs Right (Diagnosis & Actionable Advice) */}
      <div style={{ display: 'grid', gridTemplateColumns: '6fr 6fr', gap: '1.2rem' }}>

        {/* Left Column: Live Telemetry HUD + Applied Setup Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Card 1: 4-Wheel Objective Telemetry Live Monitor */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>
                {t("Objective 4-Wheel Telemetry Signals")}
              </span>
              <span style={{ fontSize: '0.72rem', color: isConnected ? '#00e676' : 'gray' }}>
                {isConnected ? t("Live Stream Synchronized") : t("Waiting for UDP Stream")}
              </span>
            </div>

            {/* 4-Wheel Dynamic Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>

              {/* Front Axle Box */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(0, 180, 255, 0.15)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00b4d8' }}>{t("Front Axle (FL / FR)")}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {t("Slip Angle")}: <strong>{telemetryGripMetrics?.maxSlipAngleF.toFixed(1) ?? '0.0'}°</strong>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.75rem', textAlign: 'center' }}>
                  <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.3rem', borderRadius: '4px' }}>
                    <span style={{ color: 'gray', display: 'block', fontSize: '0.68rem' }}>FL Temp</span>
                    <strong style={{ color: isTireOverheated(telemetryGripMetrics?.tireTempFL ?? 0, tempUnit) ? '#ff2a5f' : '#00b4d8' }}>
                      {telemetryGripMetrics?.tireTempFL ?? '-'}{tempUnitLabel}
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.3rem', borderRadius: '4px' }}>
                    <span style={{ color: 'gray', display: 'block', fontSize: '0.68rem' }}>FR Temp</span>
                    <strong style={{ color: isTireOverheated(telemetryGripMetrics?.tireTempFR ?? 0, tempUnit) ? '#ff2a5f' : '#00b4d8' }}>
                      {telemetryGripMetrics?.tireTempFR ?? '-'}{tempUnitLabel}
                    </strong>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'gray' }}>
                  <span>{t("Susp Travel")}: {((telemetryGripMetrics?.maxSuspTravelF ?? 0) * 100).toFixed(0)}%</span>
                  <span style={{ color: (telemetryGripMetrics?.avgSlipRatioF ?? 0) < -0.12 ? '#ff2a5f' : 'inherit' }}>
                    {t("Slip Ratio")}: {((telemetryGripMetrics?.avgSlipRatioF ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Rear Axle Box */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(255, 183, 3, 0.15)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ffb703' }}>{t("Rear Axle (RL / RR)")}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {t("Slip Angle")}: <strong>{telemetryGripMetrics?.maxSlipAngleR.toFixed(1) ?? '0.0'}°</strong>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.75rem', textAlign: 'center' }}>
                  <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.3rem', borderRadius: '4px' }}>
                    <span style={{ color: 'gray', display: 'block', fontSize: '0.68rem' }}>RL Temp</span>
                    <strong style={{ color: isTireOverheated(telemetryGripMetrics?.tireTempRL ?? 0, tempUnit) ? '#ff2a5f' : '#ffb703' }}>
                      {telemetryGripMetrics?.tireTempRL ?? '-'}{tempUnitLabel}
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.3rem', borderRadius: '4px' }}>
                    <span style={{ color: 'gray', display: 'block', fontSize: '0.68rem' }}>RR Temp</span>
                    <strong style={{ color: isTireOverheated(telemetryGripMetrics?.tireTempRR ?? 0, tempUnit) ? '#ff2a5f' : '#ffb703' }}>
                      {telemetryGripMetrics?.tireTempRR ?? '-'}{tempUnitLabel}
                    </strong>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'gray' }}>
                  <span>{t("Susp Travel")}: {((telemetryGripMetrics?.maxSuspTravelR ?? 0) * 100).toFixed(0)}%</span>
                  <span style={{ color: (telemetryGripMetrics?.avgSlipRatioR ?? 0) > 0.12 ? '#ff2a5f' : 'inherit' }}>
                    {t("Slip Ratio")}: {((telemetryGripMetrics?.avgSlipRatioR ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

            </div>

            {/* Optional Manual Observation Accordion / Toggle */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm w-100"
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
                onClick={() => setShowManualInputs(prev => !prev)}
              >
                {showManualInputs ? t("▲ Hide Optional Reference Observations") : t("▼ Optional: Enter Observed Hot Pressures (Phot) & Handling Anomaly")}
              </button>

              {showManualInputs && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.6rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'gray' }}>{t("Front Hot")} ({pressureUnitLabel}):</span>
                      <input
                        type="number"
                        step="0.1"
                        value={photF > 0 ? displayedPhotF.value.toFixed(1) : ''}
                        placeholder="e.g. 33.5"
                        onChange={e => setPhotF(convertTirePressureToPsi(parseFloat(e.target.value) || 0))}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'gray' }}>{t("Rear Hot")} ({pressureUnitLabel}):</span>
                      <input
                        type="number"
                        step="0.1"
                        value={photR > 0 ? displayedPhotR.value.toFixed(1) : ''}
                        placeholder="e.g. 32.5"
                        onChange={e => setPhotR(convertTirePressureToPsi(parseFloat(e.target.value) || 0))}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <select
                      value={handlingIssue}
                      onChange={e => setHandlingIssue(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="none">{t("Handling Feel: Balanced / Auto-detected from Telemetry")}</option>
                      <option value="understeer_entry">{t("Handling Feel: Understeer on Entry")}</option>
                      <option value="understeer_mid">{t("Handling Feel: Understeer at Corner Apex")}</option>
                      <option value="oversteer_snap">{t("Handling Feel: Snap Oversteer / Tail Out")}</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Card 2: Applied Setup Override Table */}
          <AppliedSetupTable
            setup={appliedSetup}
            onChange={handleSetupChange}
            onReset={handleResetSetup}
            isAwd={isAwd}
          />

        </div>

        {/* Right Column: Closed-Loop Micro-adjustments Report */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Health Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
            
            {/* Axle Delta Temp */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.7rem', color: 'gray', display: 'block' }}>{t("Axle Temp Delta")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'block', margin: '0.2rem 0' }}>
                {diagResult.deltaTaxle >= 0 ? '+' : ''}{diagResult.deltaTaxle} {tempUnitLabel}
              </span>
              <span style={{ fontSize: '0.7rem', color: diagResult.axleBalanceStatus === 'balanced' ? '#00e676' : (diagResult.axleBalanceStatus === 'front_overheat' ? '#ff2a5f' : '#ffb703') }}>
                {diagResult.axleBalanceStatus === 'balanced' && t("Balanced")}
                {diagResult.axleBalanceStatus === 'front_overheat' && t("Front Overheat")}
                {diagResult.axleBalanceStatus === 'rear_overheat' && t("Rear Overheat")}
              </span>
            </div>

            {/* Slip Angle Balance */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.7rem', color: 'gray', display: 'block' }}>{t("Steering Balance")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'block', margin: '0.2rem 0' }}>
                {telemetryGripMetrics ? `${((telemetryGripMetrics.maxSlipAngleF) - (telemetryGripMetrics.maxSlipAngleR)).toFixed(1)}°` : '0.0°'}
              </span>
              <span style={{ fontSize: '0.7rem', color: !telemetryGripMetrics || Math.abs(telemetryGripMetrics.maxSlipAngleF - telemetryGripMetrics.maxSlipAngleR) <= 2.5 ? '#00e676' : '#ffb703' }}>
                {!telemetryGripMetrics || Math.abs(telemetryGripMetrics.maxSlipAngleF - telemetryGripMetrics.maxSlipAngleR) <= 2.5
                  ? t("Neutral Grip")
                  : (telemetryGripMetrics.maxSlipAngleF > telemetryGripMetrics.maxSlipAngleR ? t("Understeer") : t("Oversteer"))}
              </span>
            </div>

            {/* Suspension Travel Health */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.7rem', color: 'gray', display: 'block' }}>{t("Suspension Travel")}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'block', margin: '0.2rem 0' }}>
                {telemetryGripMetrics ? `${(Math.max(telemetryGripMetrics.maxSuspTravelF, telemetryGripMetrics.maxSuspTravelR) * 100).toFixed(0)}%` : '0%'}
              </span>
              <span style={{ fontSize: '0.7rem', color: (telemetryGripMetrics?.maxSuspTravelF ?? 0) < 0.95 && (telemetryGripMetrics?.maxSuspTravelR ?? 0) < 0.95 ? '#00e676' : '#ff2a5f' }}>
                {(telemetryGripMetrics?.maxSuspTravelF ?? 0) < 0.95 && (telemetryGripMetrics?.maxSuspTravelR ?? 0) < 0.95 ? t("No Bottoming") : t("Bottom-out Hit")}
              </span>
            </div>

          </div>

          {/* Actionable Micro-Adjustments Card */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
              <h4 style={{ margin: 0, color: 'white', fontSize: '0.95rem' }}>
                {t("Actionable Micro-Adjustments")}
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {diagResult.specificAdjustments.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.15rem 0.6rem' }}
                    onClick={() => handleApplyAllAdjustments(diagResult.specificAdjustments)}
                  >
                    {t("Adopt All Suggestions")}
                  </button>
                )}
                <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', borderRadius: '4px', background: diagResult.isConverged ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 42, 95, 0.2)', color: diagResult.isConverged ? '#00e676' : '#ff2a5f', fontWeight: 'bold' }}>
                  {diagResult.isConverged ? t("Converged") : t("Adjustment Required")}
                </span>
              </div>
            </div>

            {/* Header / Phase Indicator */}
            {diagResult.detectedCornerPhase && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#00b4d8' }}>
                <span style={{ fontWeight: 'bold' }}>{t("Current Phase")}:</span>
                <span style={{ background: 'rgba(0, 180, 216, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(0, 180, 216, 0.3)' }}>
                  {diagResult.detectedCornerPhase}
                </span>
              </div>
            )}

            {/* Directive 1: Primary Telemetry Directive */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '6px', borderLeft: '3px solid #00b4d8' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00b4d8', display: 'block', marginBottom: '0.2rem' }}>
                {t("Telemetry Closed-Loop Directive")}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'white', lineHeight: '1.4' }}>
                {diagResult.primaryTelemetryDirective}
              </span>
            </div>

            {/* HIGHLIGHT: Single Key Primary Recommendation Card */}
            {diagResult.primaryRecommendedAdjustment && (
              <div style={{ background: 'linear-gradient(135deg, rgba(0, 230, 118, 0.12), rgba(0, 180, 216, 0.12))', border: '1px solid rgba(0, 230, 118, 0.4)', borderRadius: '8px', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ background: '#00e676', color: '#000', fontSize: '0.7rem', fontWeight: 'bold', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                      {t("PRIMARY SINGLE ADJUSTMENT")}
                    </span>
                    {diagResult.primaryRecommendedAdjustment.confidence && (
                      <span style={{ fontSize: '0.72rem', color: '#00e676', fontWeight: 'bold' }}>
                        {t("Confidence")}: {diagResult.primaryRecommendedAdjustment.confidence}%
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.8rem', fontWeight: 'bold' }}
                    onClick={() => handleApplyAdjustment(diagResult.primaryRecommendedAdjustment!)}
                  >
                    {t("Adopt Single Key Setup")}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'white' }}>
                    {diagResult.primaryRecommendedAdjustment.name}:
                  </span>
                  <strong style={{ fontSize: '1.05rem', color: '#00e676' }}>
                    {diagResult.primaryRecommendedAdjustment.current.toFixed(diagResult.primaryRecommendedAdjustment.unit === '°' ? 2 : 1)}{diagResult.primaryRecommendedAdjustment.unit} → {diagResult.primaryRecommendedAdjustment.target.toFixed(diagResult.primaryRecommendedAdjustment.unit === '°' ? 2 : 1)}{diagResult.primaryRecommendedAdjustment.unit}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: diagResult.primaryRecommendedAdjustment.delta > 0 ? '#00e676' : '#ff2a5f', fontWeight: 'bold' }}>
                    ({diagResult.primaryRecommendedAdjustment.delta > 0 ? `+${diagResult.primaryRecommendedAdjustment.delta}` : diagResult.primaryRecommendedAdjustment.delta})
                  </span>
                </div>

                {diagResult.primaryRecommendedAdjustment.crossTelemetryEvidence && (
                  <span style={{ fontSize: '0.75rem', color: '#00b4d8' }}>
                    {t("Cross-Telemetry Evidence")}: {diagResult.primaryRecommendedAdjustment.crossTelemetryEvidence}
                  </span>
                )}
                {diagResult.primaryRecommendedAdjustment.reason && (
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                    {diagResult.primaryRecommendedAdjustment.reason}
                  </span>
                )}
              </div>
            )}

            {/* Directive 2: Thermal & Balance Directive */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '6px', borderLeft: '3px solid #ffb703', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ffb703', display: 'block' }}>
                {t("Axle Balance & Thermal Equilibrium")}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'white', lineHeight: '1.4' }}>
                {diagResult.secondarySuspensionAdvice}
              </span>
            </div>

            {/* Actionable Telemetry Session Issue Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white' }}>
                    {t("Telemetry Issue & Tuning Feed")}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'gray' }}>
                    ({tuningEvents.length} {t("Events Captured")})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${eventFilter === 'active' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}
                    onClick={() => setEventFilter('active')}
                  >
                    {t("Active")} ({tuningEvents.filter(e => e.status === 'active').length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${eventFilter === 'applied' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}
                    onClick={() => setEventFilter('applied')}
                  >
                    {t("Applied")} ({tuningEvents.filter(e => e.status === 'applied').length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${eventFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}
                    onClick={() => setEventFilter('all')}
                  >
                    {t("All")}
                  </button>
                  {tuningEvents.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', marginLeft: '0.3rem' }}
                      onClick={handleClearEvents}
                    >
                      {t("Clear Feed")}
                    </button>
                  )}
                </div>
              </div>

              {/* Events List */}
              {tuningEvents.filter(e => eventFilter === 'all' || e.status === eventFilter).length === 0 ? (
                <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '6px', padding: '1rem', textAlign: 'center', color: 'gray', fontSize: '0.78rem' }}>
                  {eventFilter === 'active'
                    ? t("No pending active issues. Test drive on track; events will be logged and accumulated automatically in background.")
                    : t("No events under current filter.")}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                  {tuningEvents
                    .filter(e => eventFilter === 'all' || e.status === eventFilter)
                    .map(evt => {
                      const isApplied = evt.status === 'applied';
                      const isObsolete = evt.status === 'obsolete';

                      const severityColor =
                        evt.severity === 'critical' ? '#ff2a5f' :
                        evt.severity === 'high' ? '#ff7b00' :
                        evt.severity === 'medium' ? '#ffb703' : '#00b4d8';

                      return (
                        <div
                          key={evt.id}
                          style={{
                            background: isApplied ? 'rgba(0, 230, 118, 0.05)' : (evt.isConflicted ? 'rgba(255, 183, 3, 0.06)' : 'rgba(255, 255, 255, 0.03)'),
                            border: `1px solid ${isApplied ? 'rgba(0, 230, 118, 0.3)' : (evt.isConflicted ? 'rgba(255, 183, 3, 0.4)' : (isObsolete ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'))}`,
                            borderRadius: '6px',
                            padding: '0.6rem 0.8rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem'
                          }}
                        >
                          {/* Event Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: `${severityColor}22`, color: severityColor, border: `1px solid ${severityColor}44`, fontWeight: 'bold' }}>
                                {evt.severity.toUpperCase()}
                              </span>
                              <span style={{ fontSize: '0.72rem', background: 'rgba(0, 180, 216, 0.15)', color: '#00b4d8', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                {evt.phaseLabel}
                              </span>
                              {evt.isConflicted && (
                                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '3px', background: 'rgba(255, 183, 3, 0.2)', color: '#ffb703', fontWeight: 'bold' }}>
                                  ⚡ {t("Manual Decision")}
                                </span>
                              )}
                              {evt.lapNumber !== undefined && (
                                <span style={{ fontSize: '0.7rem', color: 'gray' }}>
                                  Lap {evt.lapNumber}
                                </span>
                              )}
                              <span style={{ fontSize: '0.7rem', color: 'gray' }}>
                                {evt.timeFormatted}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {evt.occurrences > 1 && (
                                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: 'rgba(255, 183, 3, 0.2)', color: '#ffb703', fontWeight: 'bold' }}>
                                  x{evt.occurrences} {t("times")}
                                </span>
                              )}
                              {isApplied && (
                                <span style={{ fontSize: '0.72rem', color: '#00e676', fontWeight: 'bold' }}>
                                  ✓ {t("Applied")}
                                </span>
                              )}
                              {!isApplied && !isObsolete && (
                                <button
                                  type="button"
                                  className="btn btn-outline-primary btn-sm"
                                  style={{ fontSize: '0.72rem', padding: '0.15rem 0.6rem', fontWeight: 600 }}
                                  onClick={() => handleApplyAdjustment(evt.adjustment)}
                                >
                                  {t("Adopt")}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Event Title & Evidence */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <strong style={{ fontSize: '0.85rem', color: isApplied ? '#00e676' : (evt.isConflicted ? '#ffb703' : 'white') }}>
                              {evt.title}: {evt.adjustment.name}
                            </strong>
                            <div style={{ fontSize: '0.8rem' }}>
                              <span style={{ color: 'gray' }}>{evt.adjustment.current.toFixed(evt.adjustment.unit === '°' ? 2 : 1)}{evt.adjustment.unit} → </span>
                              <strong style={{ color: isApplied ? '#00e676' : '#ffb703' }}>
                                {evt.adjustment.target.toFixed(evt.adjustment.unit === '°' ? 2 : 1)}{evt.adjustment.unit}
                              </strong>
                              <span style={{ fontSize: '0.72rem', color: evt.adjustment.delta > 0 ? '#00e676' : '#ff2a5f', marginLeft: '0.2rem' }}>
                                ({evt.adjustment.delta > 0 ? `+${evt.adjustment.delta}` : evt.adjustment.delta})
                              </span>
                            </div>
                          </div>

                          {evt.evidence && (
                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)' }}>
                              {evt.evidence}
                            </span>
                          )}
                          {evt.conflictNotice && (
                            <span style={{ fontSize: '0.72rem', color: '#ffb703', fontWeight: 600 }}>
                              {evt.conflictNotice}
                            </span>
                          )}
                          {evt.obsoleteReason && (
                            <span style={{ fontSize: '0.7rem', color: 'rgba(0,230,118,0.8)' }}>
                              {evt.obsoleteReason}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Live Telemetry Deep Dynamic Insights */}
            {diagResult.gripAnalysisAdvice.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '6px', borderLeft: '3px solid #00e676', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00e676', display: 'block' }}>
                  {t("Telemetry Dynamic Grip Insights")}
                </span>
                {diagResult.gripAnalysisAdvice.map((advice, idx) => (
                  <div key={idx} style={{ fontSize: '0.8rem', color: 'white', lineHeight: '1.4' }}>
                    {advice}
                  </div>
                ))}
              </div>
            )}

            {/* Iterative Regression Note */}
            <div style={{ fontSize: '0.75rem', color: 'gray', marginTop: 'auto', paddingTop: '0.4rem' }}>
              {t("Iterative loop: Apply adjustments to your vehicle in-game or via 'Adopt', test drive for 2 laps, and monitor telemetry convergence.")}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
