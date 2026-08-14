import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';
import {
  emptyQualifiedOutputPeaks,
  updateQualifiedOutputPeaks,
  type QualifiedOutputPeaks,
} from '../../../utils/qualifiedOutputPeaks';
import { formatRacePosition } from '../../../utils/telemetryDisplay';

const formatTime = (seconds: number) => {
  if (seconds <= 0) return "--:--.---";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const VehicleDynamicsDisplay: React.FC = React.memo(() => {
  const powerRef = useRef<HTMLSpanElement>(null);
  const powerContainerRef = useRef<HTMLDivElement>(null);
  const torqueRef = useRef<HTMLSpanElement>(null);
  const torqueContainerRef = useRef<HTMLDivElement>(null);
  const thirdStatValueRef = useRef<HTMLSpanElement>(null);
  const thirdStatContainerRef = useRef<HTMLDivElement>(null);

  const topSpeedRef = useRef<HTMLSpanElement>(null);
  const currentLapRef = useRef<HTMLSpanElement>(null);
  const lastLapRef = useRef<HTMLSpanElement>(null);
  const bestLapRef = useRef<HTMLSpanElement>(null);
  const racePositionRef = useRef<HTMLSpanElement>(null);

  const maxSpeedRecord = useRef<number>(0);
  const { t, convertPower, convertTorque, convertBoost, convertSpeed } = useSettings();
  const powerLabelRef = useRef<HTMLSpanElement>(null);
  const torqueLabelRef = useRef<HTMLSpanElement>(null);
  const peakPowerRef = useRef<HTMLSpanElement>(null);
  const peakTorqueRef = useRef<HTMLSpanElement>(null);
  const peakPowerRpmRef = useRef<HTMLDivElement>(null);
  const peakTorqueRpmRef = useRef<HTMLDivElement>(null);
  const thirdStatLabelRef = useRef<HTMLSpanElement>(null);
  const topSpeedLabelRef = useRef<HTMLSpanElement>(null);
  // 策略 C：用 ref 追蹤 EV 狀態，避免 useState 觸發 re-render
  const isEvRef = useRef(false);
  const peakOutputRef = useRef<QualifiedOutputPeaks>(emptyQualifiedOutputPeaks());
  const previousCarRef = useRef<number | undefined>(undefined);
  const previousRaceRef = useRef<number | undefined>(undefined);
  // EV 標籤 label的 ref
  const boostOrRegenLabelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (powerLabelRef.current) powerLabelRef.current.innerText = convertPower(0).label;
    if (torqueLabelRef.current) torqueLabelRef.current.innerText = convertTorque(0).label;
    if (topSpeedLabelRef.current) topSpeedLabelRef.current.innerText = convertSpeed(0).label;

    const handleUpdate = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;

      const isEV = data.EngineIdleRpm === 0;
      const powerData = convertPower(data.PowerWatts || 0);
      const torqueData = convertTorque(data.TorqueNewtons || 0);
      const isRegenActive = isEV && (powerData.value < 0 || torqueData.value < 0);
      const boostData = convertBoost(data.Boost || 0);
      const curSpeedData = convertSpeed(data.SpeedMetersPerSecond || 0);

      if (
        (previousCarRef.current !== undefined && previousCarRef.current !== data.CarOrdinal)
        || (previousRaceRef.current !== undefined && previousRaceRef.current !== data.IsRaceOn)
      ) {
        peakOutputRef.current = emptyQualifiedOutputPeaks();
        maxSpeedRecord.current = 0;
      }
      previousCarRef.current = data.CarOrdinal;
      previousRaceRef.current = data.IsRaceOn;
      peakOutputRef.current = updateQualifiedOutputPeaks(peakOutputRef.current, data);

      const peakPower = peakOutputRef.current.power;
      const peakTorque = peakOutputRef.current.torque;
      if (peakPowerRef.current) peakPowerRef.current.innerText = peakPower ? Math.round(convertPower(peakPower.value).value).toString() : '--';
      if (peakTorqueRef.current) peakTorqueRef.current.innerText = peakTorque ? Math.round(convertTorque(peakTorque.value).value).toString() : '--';
      if (peakPowerRpmRef.current) peakPowerRpmRef.current.innerText = peakPower ? `${Math.round(peakPower.rpm)} RPM` : '-- RPM';
      if (peakTorqueRpmRef.current) peakTorqueRpmRef.current.innerText = peakTorque ? `${Math.round(peakTorque.rpm)} RPM` : '-- RPM';

      if (curSpeedData.value > maxSpeedRecord.current) {
        maxSpeedRecord.current = curSpeedData.value;
      }

      if (powerRef.current) powerRef.current.innerText = Math.round(powerData.value).toString();
      if (powerContainerRef.current) {
        powerContainerRef.current.style.color = (isEV && powerData.value < 0) ? '#00ff88' : 'var(--text-primary)';
      }

      if (torqueRef.current) torqueRef.current.innerText = Math.round(torqueData.value).toString();
      if (torqueContainerRef.current) {
        torqueContainerRef.current.style.color = (isEV && torqueData.value < 0) ? '#00ff88' : 'var(--text-primary)';
      }

      if (isEV) {
        if (thirdStatValueRef.current) thirdStatValueRef.current.innerText = isRegenActive ? t("ON") : t("OFF");
        if (thirdStatLabelRef.current) thirdStatLabelRef.current.innerText = "";
        if (thirdStatContainerRef.current) thirdStatContainerRef.current.style.color = isRegenActive ? '#00ff88' : 'var(--text-primary)';
      } else {
        if (thirdStatValueRef.current) thirdStatValueRef.current.innerText = boostData.value.toFixed(1);
        if (thirdStatLabelRef.current) thirdStatLabelRef.current.innerText = boostData.label;
        if (thirdStatContainerRef.current) thirdStatContainerRef.current.style.color = boostData.value > 0 ? 'var(--secondary)' : 'var(--text-primary)';
      }

      if (topSpeedRef.current) topSpeedRef.current.innerText = Math.round(maxSpeedRecord.current).toString();

      const currentLap = data.CurrentLap || 0;
      const bestLap = data.BestLap || 0;
      const lastLap = data.LastLap || 0;

      if (currentLapRef.current) currentLapRef.current.innerText = formatTime(currentLap);
      if (lastLapRef.current) lastLapRef.current.innerText = formatTime(lastLap);
      if (bestLapRef.current) bestLapRef.current.innerText = formatTime(bestLap);
      if (racePositionRef.current) racePositionRef.current.innerText = formatRacePosition(data.RacePosition);

      // 策略 C：合併 EV 狀態偵測，只在狀態改變時更新 DOM label
      if (isEV !== isEvRef.current) {
        isEvRef.current = isEV;
        if (boostOrRegenLabelRef.current) {
          boostOrRegenLabelRef.current.innerText = isEV ? t("Regen") : t("Boost");
        }
      }
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => telemetryEmitter.removeEventListener('update', handleUpdate);
  }, [convertPower, convertTorque, convertBoost, convertSpeed, t]);

  return (
    <div className="d-flex flex-column justify-content-center h-100 gap-2 p-1">
      {/* Power / Torque / Boost Summary */}
      <div className="d-grid gap-2 border rounded-3 p-2" style={{ gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
        <div>
          <div className="text-body-secondary fs-8 fw-semibold text-uppercase">{t("Power")}</div>
          <div ref={powerContainerRef} className="fw-bold font-monospace" style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            <span ref={powerRef}>0</span><span ref={powerLabelRef} className="ms-1 fs-8 fw-normal text-body-secondary"></span>
          </div>
        </div>
        <div>
          <div className="text-body-secondary fs-8 fw-semibold text-uppercase">{t("Torque")}</div>
          <div ref={torqueContainerRef} className="fw-bold font-monospace" style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            <span ref={torqueRef}>0</span><span ref={torqueLabelRef} className="ms-1 fs-8 fw-normal text-body-secondary"></span>
          </div>
        </div>
        <div>
          <div ref={boostOrRegenLabelRef} className="text-body-secondary fs-8 fw-semibold text-uppercase">{t("Boost")}</div>
          <div ref={thirdStatContainerRef} className="fw-bold font-monospace" style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
             <span ref={thirdStatValueRef}>0</span><span ref={thirdStatLabelRef} className="ms-1 fs-8 fw-normal text-body-secondary"></span>
          </div>
        </div>
      </div>

      <div className="d-flex flex-column gap-1 p-2 border rounded-3" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
        <div className="d-grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div>
            <div className="text-primary fs-8 fw-semibold text-uppercase">{t("Max Power")}</div>
            <div className="font-monospace fw-bold"><span ref={peakPowerRef}>--</span> <span className="fs-8 fw-normal text-body-secondary">{convertPower(0).label}</span></div>
            <div ref={peakPowerRpmRef} className="font-monospace fs-8 text-body-secondary">-- RPM</div>
          </div>
          <div>
            <div className="text-secondary fs-8 fw-semibold text-uppercase">{t("Max Torque")}</div>
            <div className="font-monospace fw-bold"><span ref={peakTorqueRef}>--</span> <span className="fs-8 fw-normal text-body-secondary">{convertTorque(0).label}</span></div>
            <div ref={peakTorqueRpmRef} className="font-monospace fs-8 text-body-secondary">-- RPM</div>
          </div>
          <div>
            <div className="text-info fs-8 fw-semibold text-uppercase">{t("Top Speed")}</div>
            <div className="font-monospace fw-bold"><span ref={topSpeedRef}>0</span> <span ref={topSpeedLabelRef} className="fs-8 fw-normal text-body-secondary"></span></div>
          </div>
        </div>
      </div>

      {/* Lap Times Card */}
      <div className="d-flex flex-column gap-1 p-2 border rounded-3" style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border) !important' }}>
        <div className="d-flex justify-content-between fs-8"><span className="text-body-secondary">{t("Race Position")}:</span><span ref={racePositionRef} className="font-monospace text-info fw-bold">--</span></div>
        <div className="d-flex justify-content-between fs-8"><span className="text-body-secondary">{t("Current Lap")}:</span><span ref={currentLapRef} className="font-monospace text-body fw-bold">--:--.---</span></div>
        <div className="d-flex justify-content-between fs-8"><span className="text-body-secondary">{t("Last Lap")}:</span><span ref={lastLapRef} className="font-monospace text-body">--:--.---</span></div>
        <div className="d-flex justify-content-between fs-8"><span className="text-primary fw-bold">{t("Best Lap")}:</span><span ref={bestLapRef} className="fw-bold font-monospace text-primary">--:--.---</span></div>
      </div>
    </div>
  );
});

export default VehicleDynamicsDisplay;
