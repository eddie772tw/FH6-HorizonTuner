import { useEffect } from 'react';
import { useTelemetry } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';
import type { TuningMeasurementState } from '../tuningMeasurement';

export function TuningPreparedStatus({ measurement, onInvalidate }: {
  measurement: TuningMeasurementState; onInvalidate: () => void;
}) {
  const { data, isConnected } = useTelemetry();
  const { t } = useSettings();
  useEffect(() => {
    if (!isConnected || !data || data.IsRaceOn !== 1 || !measurement.identity) return;
    const identity = measurement.identity;
    if (data.CarOrdinal !== identity.ordinal || data.CarClass !== identity.carClass ||
        data.CarPerformanceIndex !== identity.performanceIndex || data.EngineMaxRpm !== measurement.engineMaxRpm) onInvalidate();
  }, [data, isConnected, measurement, onInvalidate]);
  return <p className="small mb-2" style={{ color: 'var(--text-secondary)' }}>{t('Using the completed driving-data snapshot. Live driving will not change this tune.')}
    {' '}{t('Engine limit received')}: {Math.round(measurement.engineMaxRpm!)} RPM.
    {' '}{t('Repeat collection after changing installed parts, even if the performance index is unchanged.')}</p>;
}
