import React, { useMemo } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { TelemetryData } from '../../../hooks/useTelemetry';
import {
  calculateSuspensionMetrics,
  getDynamicsTrendValues,
  getOrientationTrendValues,
  readTireMetrics,
  toTireTrendChartData,
  toChartPoints,
} from '../telemetryDetailMath';
import type { TelemetryChartPoint, TireTrendChartData } from '../telemetryDetailMath';
import { useTelemetryHistory } from '../telemetryHistory';
import type { TelemetryCardId } from './TelemetryCardShell';
import {
  DynamicsDetailPanel,
  SuspensionDetailPanel,
  TireDetailPanel,
  TraceDetailPanel,
} from './TelemetryDetailPanels';

interface TelemetryDetailViewProps {
  cardId: TelemetryCardId;
  current: TelemetryData | null;
}

const EMPTY_CHART_DATA: TelemetryChartPoint[] = [];
const EMPTY_TIRE_TREND_DATA: TireTrendChartData = {
  temperature: EMPTY_CHART_DATA,
  slipRatio: EMPTY_CHART_DATA,
  slipAngle: EMPTY_CHART_DATA,
  combinedSlip: EMPTY_CHART_DATA,
  surfaceRumble: EMPTY_CHART_DATA,
};

const TelemetryDetailView: React.FC<TelemetryDetailViewProps> = ({ cardId, current }) => {
  const { t, convertPower, convertTorque, convertSpeed, convertTemp, convertBoost } = useSettings();
  const history = useTelemetryHistory();
  const corners = useMemo(() => [t('Front Left'), t('Front Right'), t('Rear Left'), t('Rear Right')], [t]);
  const emptyLabel = t('Waiting for live telemetry history');
  const suspensionMetrics = useMemo(() => calculateSuspensionMetrics(current, history), [current, history]);
  const tireMetrics = useMemo(() => readTireMetrics(current), [current]);

  const suspensionData = useMemo(() => cardId === 'suspension' ? toChartPoints(history, (sample) => ({
    FL: sample.suspension[0], FR: sample.suspension[1], RL: sample.suspension[2], RR: sample.suspension[3],
  })): EMPTY_CHART_DATA, [cardId, history]);
  const tireTrendData = useMemo(() => cardId === 'tires' ? toTireTrendChartData(history) : EMPTY_TIRE_TREND_DATA, [cardId, history]);
  const dynamicsData = useMemo(() => cardId === 'dynamics' ? toChartPoints(history, getDynamicsTrendValues) : EMPTY_CHART_DATA, [cardId, history]);
  const orientationData = useMemo(() => cardId === 'dynamics' ? toChartPoints(history, getOrientationTrendValues) : EMPTY_CHART_DATA, [cardId, history]);
  const speedData = useMemo(() => (cardId === 'dynamics' ? toChartPoints(history, (sample) => ({
    Speed: sample.speedMetersPerSecond === null ? null : convertSpeed(sample.speedMetersPerSecond).value,
  })) : EMPTY_CHART_DATA), [cardId, history, convertSpeed]);
  const rpmData = useMemo(() => cardId === 'dynamics' ? toChartPoints(history, (sample) => ({ RPM: sample.rpm })) : EMPTY_CHART_DATA, [cardId, history]);
  const driverData = useMemo(() => (cardId === 'traces' ? toChartPoints(history, (sample) => ({
    Throttle: sample.accelInput === null ? null : sample.accelInput / 255,
    Brake: sample.brakeInput === null ? null : sample.brakeInput / 255,
    Steering: sample.steerInput === null ? null : sample.steerInput / 127,
  })) : EMPTY_CHART_DATA), [cardId, history]);
  const powerData = useMemo(() => (cardId === 'dynamics' ? toChartPoints(history, (sample) => ({
    Power: sample.powerWatts === null ? null : convertPower(sample.powerWatts).value,
    Torque: sample.torqueNewtons === null ? null : convertTorque(sample.torqueNewtons).value,
  })) : EMPTY_CHART_DATA), [cardId, history, convertPower, convertTorque]);
  const traceData = useMemo(() => (cardId === 'traces' ? toChartPoints(history, (sample) => ({
    RPM: sample.rpm,
    Power: sample.powerWatts === null ? null : convertPower(sample.powerWatts).value,
    Torque: sample.torqueNewtons === null ? null : convertTorque(sample.torqueNewtons).value,
  })) : EMPTY_CHART_DATA), [cardId, history, convertPower, convertTorque]);
  const boostData = useMemo(() => (cardId === 'dynamics' ? toChartPoints(history, (sample) => ({
    Boost: sample.boost === null ? null : convertBoost(sample.boost).value,
  })) : EMPTY_CHART_DATA), [cardId, history, convertBoost]);

  const shared = { t, corners, emptyLabel };
  if (cardId === 'driver') return null;
  if (cardId === 'suspension') return <SuspensionDetailPanel {...shared} current={current} metrics={suspensionMetrics} data={suspensionData} />;
  if (cardId === 'tires') return <TireDetailPanel {...shared} metrics={tireMetrics} temperatureData={tireTrendData.temperature} slipRatioData={tireTrendData.slipRatio} slipAngleData={tireTrendData.slipAngle} combinedSlipData={tireTrendData.combinedSlip} surfaceRumbleData={tireTrendData.surfaceRumble} convertTemp={convertTemp} />;
  if (cardId === 'dynamics') return <DynamicsDetailPanel {...shared} current={current} accelerationData={dynamicsData} orientationData={orientationData} speedData={speedData} rpmData={rpmData} powerData={powerData} boostData={boostData} convertPower={convertPower} convertTorque={convertTorque} convertSpeed={convertSpeed} convertBoost={convertBoost} />;
  return <TraceDetailPanel {...shared} driverData={driverData} powerData={traceData} rpmData={traceData} />;
};

export default React.memo(TelemetryDetailView);
