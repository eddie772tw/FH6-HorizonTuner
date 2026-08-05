import React, { useEffect, useRef } from 'react';
import { telemetryEmitter } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';

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

  const currentLapRef = useRef<HTMLSpanElement>(null);
  const lastLapRef = useRef<HTMLSpanElement>(null);
  const bestLapRef = useRef<HTMLSpanElement>(null);

  const { t, convertPower, convertTorque, convertBoost } = useSettings();
  const powerLabelRef = useRef<HTMLSpanElement>(null);
  const torqueLabelRef = useRef<HTMLSpanElement>(null);
  const thirdStatLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Initial label setup
    if (powerLabelRef.current) powerLabelRef.current.innerText = convertPower(0).label;
    if (torqueLabelRef.current) torqueLabelRef.current.innerText = convertTorque(0).label;

    const handleUpdate = (e: any) => {
      const data = e.detail;
      if ((window as any).__IS_HUD_PAUSED__ || !data) return;

      const isEV = data.EngineIdleRpm === 0;
      const powerData = convertPower(data.PowerWatts || 0);
      const torqueData = convertTorque(data.TorqueNewtons || 0);
      const isRegenActive = isEV && (powerData.value < 0 || torqueData.value < 0);
      const boostData = convertBoost(data.Boost || 0);

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

      const currentLap = data.CurrentLap || 0;
      const bestLap = data.BestLap || 0;
      const lastLap = data.LastLap || 0;

      if (currentLapRef.current) currentLapRef.current.innerText = formatTime(currentLap);
      if (lastLapRef.current) lastLapRef.current.innerText = formatTime(lastLap);
      if (bestLapRef.current) bestLapRef.current.innerText = formatTime(bestLap);
    };

    telemetryEmitter.addEventListener('update', handleUpdate);
    return () => telemetryEmitter.removeEventListener('update', handleUpdate);
  }, [convertPower, convertTorque, convertBoost, t]);

  // Determine static labels for render (isEV check requires React state normally, but here we can't easily, so we just use placeholders and update in hook)
  // Let's use a small React state just for EV toggle so we can render the right titles, but the fast updates happen in the ref.
  const [isEV, setIsEV] = React.useState(false);

  useEffect(() => {
    const handleUpdateEV = (e: any) => {
      const data = e.detail;
      if (!data) return;
      const ev = data.EngineIdleRpm === 0;
      if (ev !== isEV) {
        setIsEV(ev);
      }
    };
    telemetryEmitter.addEventListener('update', handleUpdateEV);
    return () => telemetryEmitter.removeEventListener('update', handleUpdateEV);
  }, [isEV]);


  return (
    <div className="d-flex flex-column justify-content-center flex-grow-1">
      <div className="d-grid gap-2 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{t("Power")}</div>
          <div ref={powerContainerRef} className="fw-bold" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
            <span ref={powerRef}>0</span><span ref={powerLabelRef} className="ms-1" style={{ fontSize: '0.8rem' }}></span>
          </div>
        </div>
        <div>
          <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{t("Torque")}</div>
          <div ref={torqueContainerRef} className="fw-bold" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
            <span ref={torqueRef}>0</span><span ref={torqueLabelRef} className="ms-1" style={{ fontSize: '0.8rem' }}></span>
          </div>
        </div>
        <div>
          <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{isEV ? t("Regen") : t("Boost")}</div>
          <div ref={thirdStatContainerRef} className="fw-bold" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
             <span ref={thirdStatValueRef}>0</span><span ref={thirdStatLabelRef} className="ms-1" style={{ fontSize: '0.8rem' }}></span>
          </div>
        </div>
      </div>
      <div className="d-flex flex-column gap-1 pt-2 border-top" style={{ borderColor: 'var(--divider) !important' }}>
        <div className="d-flex justify-content-between" style={{ fontSize: '0.9rem' }}><span className="text-secondary">{t("Current Lap")}:</span><span ref={currentLapRef} style={{ fontFamily: 'monospace' }}>--:--.---</span></div>
        <div className="d-flex justify-content-between" style={{ fontSize: '0.9rem' }}><span className="text-secondary">{t("Last Lap")}:</span><span ref={lastLapRef} style={{ fontFamily: 'monospace' }}>--:--.---</span></div>
        <div className="d-flex justify-content-between" style={{ fontSize: '0.9rem' }}><span style={{ color: 'var(--primary)' }}>{t("Best Lap")}:</span><span ref={bestLapRef} className="fw-bold" style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>--:--.---</span></div>
      </div>
    </div>
  );
});

export default VehicleDynamicsDisplay;