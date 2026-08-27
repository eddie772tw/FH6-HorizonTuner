import React from 'react';
import type { TelemetryData } from '../../../hooks/useTelemetry';
import type { SeriesSummary, SuspensionDetailMetrics, TireDetailMetrics, TelemetryChartPoint } from '../telemetryDetailMath';
import { formatDegrees, formatPercent, formatRaceTime, formatValue, Metric, numberOrNull, TrendChart } from './TelemetryDetailPrimitives';
import { formatRacePosition } from '../../../utils/telemetryDisplay';

type Translate = (key: string) => string;
type Converter = (value: number) => { value: number; label: string };

interface SharedProps {
  t: Translate;
  corners: string[];
  emptyLabel: string;
}

const formatSummary = (summary: SeriesSummary, key: keyof SeriesSummary): string => formatValue(summary[key]);

const cornerLines = [
  { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
  { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
  { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
  { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
];

const SuspensionCornerSummary: React.FC<{
  label: string;
  current: number | null;
  summary: SeriesSummary;
  bottomOut: boolean | null;
  t: Translate;
}> = ({ label, current, summary, bottomOut, t }) => (
  <div className="telemetry-detail-view__corner">
    <h4 className="fs-6 text-primary mb-2">{label}</h4>
    <Metric label={t('Current')} value={formatValue(current)} />
    <Metric label={t('Minimum')} value={formatSummary(summary, 'minimum')} />
    <Metric label={t('Maximum')} value={formatSummary(summary, 'maximum')} />
    <Metric label={t('Average')} value={formatSummary(summary, 'average')} />
    <Metric label={t('Bottom Out')} value={bottomOut === null ? '--' : bottomOut ? t('Yes') : t('No')} tone={bottomOut ? 'text-warning' : undefined} />
  </div>
);

export const SuspensionDetailPanel: React.FC<SharedProps & { current: TelemetryData | null; metrics: SuspensionDetailMetrics; data: TelemetryChartPoint[] }> = ({ t, corners, emptyLabel, current, metrics, data }) => (
  <div className="telemetry-detail-view">
    <div className="telemetry-detail-view__metric-grid">
      {metrics.current.map((current, index) => (
        <SuspensionCornerSummary key={cornerLines[index].dataKey} label={corners[index]} current={current} summary={metrics.summaries[index]} bottomOut={metrics.bottomOut[index]} t={t} />
      ))}
      <Metric label={t('Front Average')} value={formatValue(metrics.frontAverage)} />
      <Metric label={t('Rear Average')} value={formatValue(metrics.rearAverage)} />
      <Metric label={t('Left Average')} value={formatValue(metrics.leftAverage)} />
      <Metric label={t('Right Average')} value={formatValue(metrics.rightAverage)} />
      <Metric label={t('Front/Rear Difference')} value={formatValue(metrics.frontRearDifference)} />
      <Metric label={t('Left/Right Difference')} value={formatValue(metrics.leftRightDifference)} />
      <Metric label={t('Travel Rate')} value={metrics.travelRate === null ? '--' : `${formatValue(metrics.travelRate)} /s`} />
      <Metric label={t('Pitch')} value={formatDegrees(current?.Pitch)} />
      <Metric label={t('Roll')} value={formatDegrees(current?.Roll)} />
    </div>
    <div className="telemetry-detail-view__chart-grid">
      <TrendChart title={t('Suspension Travel Trend')} data={data} emptyLabel={emptyLabel} lines={cornerLines} />
    </div>
  </div>
);

export const TireDetailPanel: React.FC<SharedProps & {
  metrics: TireDetailMetrics;
  temperatureData: TelemetryChartPoint[];
  slipRatioData: TelemetryChartPoint[];
  slipAngleData: TelemetryChartPoint[];
  combinedSlipData: TelemetryChartPoint[];
  surfaceRumbleData: TelemetryChartPoint[];
  convertTemp: Converter;
}> = ({ t, corners, emptyLabel, metrics, temperatureData, slipRatioData, slipAngleData, combinedSlipData, surfaceRumbleData, convertTemp }) => (
  <div className="telemetry-detail-view">
    <div className="telemetry-detail-view__metric-grid">
      {metrics.temperature.map((temperature, index) => {
        const convertedTemperature = temperature === null ? null : convertTemp(temperature);
        return (
          <div className="telemetry-detail-view__corner" key={cornerLines[index].dataKey}>
            <h4 className="fs-6 text-primary mb-2">{corners[index]}</h4>
            <Metric label={t('Temperature')} value={convertedTemperature === null ? '--' : `${formatValue(convertedTemperature.value, 1)} ${convertedTemperature.label}`} />
            <Metric label={t('Slip Ratio')} value={formatValue(metrics.slipRatio[index])} />
            <Metric label={t('Slip Angle')} value={formatDegrees(metrics.slipAngle[index])} />
            <Metric label={t('Combined Slip')} value={formatValue(metrics.combinedSlip[index])} />
          </div>
        );
      })}
    </div>
    <div className="telemetry-detail-view__chart-grid">
      <TrendChart title={t('Tire Temperature Trend')} data={temperatureData} emptyLabel={emptyLabel} lines={cornerLines} />
      <TrendChart title={t('Slip Ratio Trend')} data={slipRatioData} emptyLabel={emptyLabel} lines={cornerLines} />
      <TrendChart title={t('Slip Angle Trend')} data={slipAngleData} emptyLabel={emptyLabel} lines={cornerLines} />
      <TrendChart title={t('Combined Slip Trend')} data={combinedSlipData} emptyLabel={emptyLabel} lines={cornerLines} />
      <TrendChart title={t('Surface Rumble Trend')} data={surfaceRumbleData} emptyLabel={emptyLabel} lines={cornerLines} />
    </div>
  </div>
);

export const DynamicsDetailPanel: React.FC<SharedProps & {
  current: TelemetryData | null;
  accelerationData: TelemetryChartPoint[];
  orientationData: TelemetryChartPoint[];
  speedData: TelemetryChartPoint[];
  rpmData: TelemetryChartPoint[];
  powerData: TelemetryChartPoint[];
  boostData: TelemetryChartPoint[];
  convertPower: Converter;
  convertTorque: Converter;
  convertSpeed: Converter;
  convertBoost: Converter;
}> = ({ t, emptyLabel, current, accelerationData, orientationData, speedData, rpmData, powerData, boostData, convertPower, convertTorque, convertSpeed, convertBoost }) => {
  const powerValue = numberOrNull(current?.PowerWatts);
  const torqueValue = numberOrNull(current?.TorqueNewtons);
  const speedValue = numberOrNull(current?.SpeedMetersPerSecond);
  const boostValue = numberOrNull(current?.Boost);
  const power = powerValue === null ? null : convertPower(powerValue);
  const torque = torqueValue === null ? null : convertTorque(torqueValue);
  const speed = speedValue === null ? null : convertSpeed(speedValue);
  const boost = boostValue === null ? null : convertBoost(boostValue);
  const isEv = current?.EngineIdleRpm === 0;
  const isRegen = isEv && ((powerValue ?? 0) < 0 || (torqueValue ?? 0) < 0);
  return (
    <div className="telemetry-detail-view">
      <div className="telemetry-detail-view__metric-grid">
        <Metric label={t('Speed')} value={speed ? `${formatValue(speed.value, 1)} ${speed.label}` : '--'} />
        <Metric label={t('RPM')} value={formatValue(current?.CurrentEngineRpm, 0)} />
        <Metric label={t('Power')} value={power ? `${formatValue(power.value, 1)} ${power.label}` : '--'} />
        <Metric label={t('Torque')} value={torque ? `${formatValue(torque.value, 1)} ${torque.label}` : '--'} />
        <Metric label={t('Boost / Regeneration')} value={isEv ? (isRegen ? t('ON') : t('OFF')) : boost ? `${formatValue(boost.value, 1)} ${boost.label}` : '--'} />
        <Metric label={t('Acceleration X')} value={formatValue(numberOrNull(current?.AccelerationX) === null ? null : current!.AccelerationX / 9.81)} />
        <Metric label={t('Acceleration Y')} value={formatValue(numberOrNull(current?.AccelerationY) === null ? null : current!.AccelerationY / 9.81)} />
        <Metric label={t('Acceleration Z')} value={formatValue(numberOrNull(current?.AccelerationZ) === null ? null : current!.AccelerationZ / 9.81)} />
        <Metric label={t('Lateral G')} value={formatValue(current ? -current.AccelerationX / 9.81 : null)} />
        <Metric label={t('Longitudinal G')} value={formatValue(current ? current.AccelerationZ / 9.81 : null)} />
        <Metric label={t('Vertical G')} value={formatValue(current ? current.AccelerationY / 9.81 : null)} />
        <Metric label={t('Pitch')} value={formatDegrees(current?.Pitch)} />
        <Metric label={t('Roll')} value={formatDegrees(current?.Roll)} />
        <Metric label={t('Yaw')} value={formatDegrees(current?.Yaw)} />
        <Metric label={t('Current Lap')} value={formatRaceTime(current?.CurrentLap)} />
        <Metric label={t('Distance')} value={current?.DistanceTraveled === undefined ? '--' : `${formatValue(current.DistanceTraveled, 0)} m`} />
        <Metric label={t('Race Position')} value={formatRacePosition(current?.RacePosition)} />
      </div>
      <div className="telemetry-detail-view__chart-grid">
        <TrendChart title={t('Acceleration Trend')} data={accelerationData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'X', label: t('Acceleration X'), color: 'var(--primary)' },
          { dataKey: 'Y', label: t('Acceleration Y'), color: 'var(--secondary)' },
          { dataKey: 'Z', label: t('Acceleration Z'), color: 'var(--accent)' },
        ]} />
        <TrendChart title={t('Orientation Trend')} data={orientationData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'Pitch', label: t('Pitch'), color: 'var(--primary)' },
          { dataKey: 'Roll', label: t('Roll'), color: 'var(--secondary)' },
          { dataKey: 'Yaw', label: t('Yaw'), color: 'var(--accent)' },
        ]} />
        <TrendChart title={t('Speed Trend')} data={speedData} emptyLabel={emptyLabel} lines={[{ dataKey: 'Speed', label: t('Speed'), color: 'var(--primary)' }]} />
        <TrendChart title={t('RPM Trend')} data={rpmData} emptyLabel={emptyLabel} lines={[{ dataKey: 'RPM', label: t('RPM'), color: 'var(--secondary)' }]} />
        <TrendChart title={t('Power and Torque Trend')} data={powerData} emptyLabel={emptyLabel} lines={[{ dataKey: 'Power', label: t('Power'), color: 'var(--primary)' }, { dataKey: 'Torque', label: t('Torque'), color: 'var(--secondary)' }]} />
        <TrendChart title={t('Boost / Regeneration')} data={boostData} emptyLabel={emptyLabel} lines={[{ dataKey: 'Boost', label: t('Boost'), color: 'var(--accent)' }]} />
      </div>
    </div>
  );
};

export const DriverDetailPanel: React.FC<SharedProps & { current: TelemetryData | null; data: TelemetryChartPoint[]; convertSpeed: Converter }> = ({ t, emptyLabel, current, data, convertSpeed }) => (
  <div className="telemetry-detail-view">
    <div className="telemetry-detail-view__metric-grid">
      <Metric label={t('Throttle')} value={formatPercent(current?.AccelInput === undefined ? null : current.AccelInput / 255)} />
      <Metric label={t('Brake')} value={formatPercent(current?.BrakeInput === undefined ? null : current.BrakeInput / 255)} />
      <Metric label={t('Clutch')} value={formatPercent(current?.ClutchInput === undefined ? null : current.ClutchInput / 255)} />
      <Metric label={t('Handbrake')} value={formatPercent(current?.HandBrakeInput === undefined ? null : current.HandBrakeInput / 255)} />
      <Metric label={t('Steering')} value={formatValue(current?.SteerInput)} />
      <Metric label={t('Gear')} value={formatValue(current?.Gear, 0)} />
      <Metric label={t('RPM')} value={formatValue(current?.CurrentEngineRpm, 0)} />
      <Metric label={t('Speed')} value={current?.SpeedMetersPerSecond === undefined ? '--' : `${formatValue(convertSpeed(current.SpeedMetersPerSecond).value, 1)} ${convertSpeed(current.SpeedMetersPerSecond).label}`} />
    </div>
    <div className="telemetry-detail-view__chart-grid">
      <TrendChart title={t('Driver Input Trend')} data={data} emptyLabel={emptyLabel} lines={[{ dataKey: 'Throttle', label: t('Throttle'), color: 'var(--primary)' }, { dataKey: 'Brake', label: t('Brake'), color: 'var(--secondary)' }, { dataKey: 'Steering', label: t('Steering'), color: 'var(--accent)' }]} />
    </div>
  </div>
);

export const TraceDetailPanel: React.FC<SharedProps & { driverData: TelemetryChartPoint[]; powerData: TelemetryChartPoint[] }> = ({ t, emptyLabel, driverData, powerData }) => (
  <div className="telemetry-detail-view">
    <div className="telemetry-detail-view__metric-grid">
      <Metric label={t('Throttle')} value="--" />
      <Metric label={t('Brake')} value="--" />
      <Metric label={t('Power')} value="--" />
      <Metric label={t('Torque')} value="--" />
    </div>
    <div className="telemetry-detail-view__chart-grid">
      <TrendChart title={t('Pedal Trace')} data={driverData} emptyLabel={emptyLabel} lines={[{ dataKey: 'Throttle', label: t('Throttle'), color: 'var(--primary)' }, { dataKey: 'Brake', label: t('Brake'), color: 'var(--secondary)' }]} />
      <TrendChart title={t('Power and Torque Trend')} data={powerData} emptyLabel={emptyLabel} lines={[{ dataKey: 'Power', label: t('Power'), color: 'var(--primary)' }, { dataKey: 'Torque', label: t('Torque'), color: 'var(--secondary)' }]} />
    </div>
  </div>
);
