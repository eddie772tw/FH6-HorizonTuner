import React, { useMemo } from 'react';
import type { AnalysisDataPoint } from '../../context/TelemetryRecorderContext';
import { useSettings } from '../../context/SettingsContext';
import { finiteChannel, samplePath, scaledChannel } from './analysisChannels';

interface LapDeltaCanvasProps {
  primaryLapData: AnalysisDataPoint[]; compareLapData?: AnalysisDataPoint[];
  primaryLapNumber: number; compareLapNumber?: number;
}

/** Offline sample-index preview. Spatially matched Road comparisons use their own report. */
const LapDeltaCanvas: React.FC<LapDeltaCanvasProps> = ({
  primaryLapData, compareLapData = [], primaryLapNumber, compareLapNumber = -1,
}) => {
  const { t } = useSettings();
  const series = useMemo(() => {
    const a = primaryLapData.map(p => scaledChannel(p.SpeedMetersPerSecond, 3.6));
    const b = compareLapData.map(p => scaledChannel(p.SpeedMetersPerSecond, 3.6));
    const maximum = Math.max(120, ...a.filter(finiteChannel), ...b.filter(finiteChannel));
    return { maximum, a: samplePath(a, maximum), b: samplePath(b, maximum),
      throttle: samplePath(primaryLapData.map(p => scaledChannel(p.AccelInput, 100 / 255)), 100),
      brake: samplePath(primaryLapData.map(p => scaledChannel(p.BrakeInput, 100 / 255)), 100) };
  }, [primaryLapData, compareLapData]);
  return <section className="glass-panel p-3">
    <div className="d-flex flex-wrap gap-3 mb-2">
      <strong>{t('Speed & Input Delta')}</strong>
      <span style={{ color: 'var(--primary)' }}>{primaryLapNumber < 0 ? t('Current Session') : t('Lap') + ' ' + (primaryLapNumber + 1)}</span>
      {compareLapNumber >= 0 && <span>{t('Comparison Lap:')} {compareLapNumber + 1} ({t('Dashed line')})</span>}
    </div>
    <p className="text-body-secondary small">{t('Sample progress is not aligned track distance. Missing channels remain gaps.')}</p>
    {primaryLapData.length === 0 ? <p>{t('No lap data to display.')}</p> : <>
      <div className="small">{t('Speed')} · 0–{series.maximum.toFixed(0)} km/h</div>
      <svg viewBox="0 0 1000 110" width="100%" height="130" role="img" aria-label={t('Speed by sample progress')}>
        <path d={series.a} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={series.b} fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="small">{t('Throttle & Brake Inputs')} · 0–100%</div>
      <svg viewBox="0 0 1000 110" width="100%" height="100" role="img" aria-label={t('Pedals by sample progress')}>
        <path d={series.throttle} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={series.brake} fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="d-flex justify-content-between small text-body-secondary">
        <span>0% {t('Sample progress')}</span><span>100%</span>
      </div>
    </>}
  </section>;
};
export default LapDeltaCanvas;
