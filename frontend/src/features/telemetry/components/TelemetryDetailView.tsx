import React, { useMemo } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { TelemetryData } from '../../../hooks/useTelemetry';
import {
  calculateSuspensionMetrics,
  getDynamicsTrendValues,
  getOrientationTrendValues,
  getTireTrendValues,
  readTireMetrics,
  toChartPoints,
} from '../telemetryDetailMath';
import { useTelemetryHistory } from '../telemetryHistory';
import type { TelemetryCardId } from './TelemetryCardShell';
import {
  DriverDetailPanel,
  DynamicsDetailPanel,
  SuspensionDetailPanel,
  TireDetailPanel,
  TraceDetailPanel,
} from './TelemetryDetailPanels';

interface TelemetryDetailViewProps {
  cardId: TelemetryCardId;
  current: TelemetryData | null;
}

const TelemetryDetailView: React.FC<TelemetryDetailViewProps> = ({ cardId, current }) => {
  const { t, convertPower, convertTorque, convertSpeed, convertTemp, convertBoost } = useSettings();
  const history = useTelemetryHistory();
  const corners = [t('Front Left'), t('Front Right'), t('Rear Left'), t('Rear Right')];
  const emptyLabel = t('Waiting for live telemetry history');
  const suspensionMetrics = useMemo(() => calculateSuspensionMetrics(current, history), [current, history]);
  const tireMetrics = useMemo(() => readTireMetrics(current), [current]);

  const suspensionData = useMemo(() => toChartPoints(history, (sample) => ({
    FL: sample.suspension[0], FR: sample.suspension[1], RL: sample.suspension[2], RR: sample.suspension[3],
  })), [history]);
  const tireTemperatureData = useMemo(() => toChartPoints(history, (sample) => getTireTrendValues(sample).temperature), [history]);
  const tireSlipRatioData = useMemo(() => toChartPoints(history, (sample) => getTireTrendValues(sample).slipRatio), [history]);
  const tireSlipAngleData = useMemo(() => toChartPoints(history, (sample) => getTireTrendValues(sample).slipAngle), [history]);
  const tireCombinedSlipData = useMemo(() => toChartPoints(history, (sample) => getTireTrendValues(sample).combinedSlip), [history]);
  const tireSurfaceRumbleData = useMemo(() => toChartPoints(history, (sample) => getTireTrendValues(sample).surfaceRumble), [history]);
  const dynamicsData = useMemo(() => toChartPoints(history, getDynamicsTrendValues), [history]);
  const orientationData = useMemo(() => toChartPoints(history, getOrientationTrendValues), [history]);
  const speedData = useMemo(() => toChartPoints(history, (sample) => ({
    Speed: sample.speedMetersPerSecond === null ? null : convertSpeed(sample.speedMetersPerSecond).value,
  })), [history, convertSpeed]);
  const rpmData = useMemo(() => toChartPoints(history, (sample) => ({ RPM: sample.rpm })), [history]);
  const driverData = useMemo(() => toChartPoints(history, (sample) => ({
    Throttle: sample.accelInput === null ? null : sample.accelInput / 255,
    Brake: sample.brakeInput === null ? null : sample.brakeInput / 255,
    Steering: sample.steerInput === null ? null : sample.steerInput / 127,
  })), [history]);
  const powerData = useMemo(() => toChartPoints(history, (sample) => ({
    Power: sample.powerWatts === null ? null : convertPower(sample.powerWatts).value,
    Torque: sample.torqueNewtons === null ? null : convertTorque(sample.torqueNewtons).value,
  })), [history, convertPower, convertTorque]);
  const boostData = useMemo(() => toChartPoints(history, (sample) => ({
    Boost: sample.boost === null ? null : convertBoost(sample.boost).value,
  })), [history, convertBoost]);

  const shared = { t, corners, emptyLabel };
  if (cardId === 'suspension') return <SuspensionDetailPanel {...shared} current={current} metrics={suspensionMetrics} data={suspensionData} />;
  if (cardId === 'tires') return <TireDetailPanel {...shared} metrics={tireMetrics} temperatureData={tireTemperatureData} slipRatioData={tireSlipRatioData} slipAngleData={tireSlipAngleData} combinedSlipData={tireCombinedSlipData} surfaceRumbleData={tireSurfaceRumbleData} convertTemp={convertTemp} />;
  if (cardId === 'dynamics') return <DynamicsDetailPanel {...shared} current={current} accelerationData={dynamicsData} orientationData={orientationData} speedData={speedData} rpmData={rpmData} powerData={powerData} boostData={boostData} convertPower={convertPower} convertTorque={convertTorque} convertSpeed={convertSpeed} convertBoost={convertBoost} />;
  if (cardId === 'driver') return <DriverDetailPanel {...shared} current={current} data={driverData} convertSpeed={convertSpeed} />;
  return <TraceDetailPanel {...shared} driverData={driverData} powerData={powerData} />;
};

export default React.memo(TelemetryDetailView);
