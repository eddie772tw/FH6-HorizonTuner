import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSettings } from '../../../context/SettingsContext';
import { type TelemetryData } from '../../../hooks/useTelemetry';
import {
  calculateSuspensionMetrics,
  getDynamicsTrendValues,
  getOrientationTrendValues,
  getTireTrendValues,
  radiansToDegrees,
  readTireMetrics,
  type SeriesSummary,
  toChartPoints,
  type TelemetryChartPoint,
  TELEMETRY_CORNERS,
} from '../telemetryDetailMath';
import { useTelemetryHistory } from '../telemetryHistory';
import { type TelemetryCardId } from './TelemetryCardShell';
import { formatRacePosition } from '../../../utils/telemetryDisplay';

interface TelemetryDetailViewProps {
  cardId: TelemetryCardId;
  current: TelemetryData | null;
}

interface ChartLine {
  dataKey: string;
  label: string;
  color: string;
}

const numberOrNull = (value: number | undefined | null): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const formatValue = (value: number | null | undefined, digits = 2): string => (
  numberOrNull(value) === null ? '--' : Number(value).toFixed(digits)
);

const formatPercent = (value: number | null | undefined): string => (
  numberOrNull(value) === null ? '--' : `${(Number(value) * 100).toFixed(0)}%`
);

const formatDegrees = (value: number | null | undefined): string => {
  const degrees = radiansToDegrees(numberOrNull(value));
  return degrees === null ? '--' : `${formatValue(degrees, 1)}°`;
};

const formatRaceTime = (seconds: number | null | undefined): string => {
  const value = numberOrNull(seconds);
  if (value === null || value <= 0) return '--:--.---';
  const minutes = Math.floor(value / 60);
  const remainingSeconds = Math.floor(value % 60);
  const milliseconds = Math.floor((value % 1) * 1000);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

const Metric: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-body' }) => (
  <div className="telemetry-detail-view__metric">
    <span className="text-body-secondary fs-8 text-uppercase">{label}</span>
    <strong className={`font-monospace fs-5 ${tone}`}>{value}</strong>
  </div>
);

const TrendChart: React.FC<{ title: string; data: TelemetryChartPoint[]; lines: ChartLine[]; emptyLabel: string }> = ({ title, data, lines, emptyLabel }) => (
  <div className="telemetry-detail-view__chart glass-panel p-2">
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h4 className="fs-6 text-primary m-0">{title}</h4>
      <span className="text-body-secondary fs-8">30 s</span>
    </div>
    {data.length === 0 || !data.some((point) => lines.some((line) => point[line.dataKey] !== null)) ? (
      <div className="telemetry-detail-view__empty text-body-secondary">{emptyLabel}</div>
    ) : (
      <div className="telemetry-detail-view__chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="var(--divider)" strokeDasharray="3 3" />
            <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{ fontSize: 10 }} unit="s" />
            <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
              labelFormatter={(value) => `${value} s`}
            />
            <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
            {lines.map((line) => (
              <Line key={line.dataKey} type="monotone" dataKey={line.dataKey} name={line.label} stroke={line.color} dot={false} strokeWidth={2} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
);

const cornerKeys = TELEMETRY_CORNERS;

const formatSummary = (summary: SeriesSummary, key: keyof SeriesSummary): string => formatValue(summary[key]);

const SuspensionCornerSummary: React.FC<{
  label: string;
  current: number | null;
  summary: SeriesSummary;
  bottomOut: boolean | null;
  t: (key: string) => string;
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
  const tireTemperatureData = useMemo(() => toChartPoints(history, (sample) => ({
    ...getTireTrendValues(sample).temperature,
  })), [history]);
  const tireSlipRatioData = useMemo(() => toChartPoints(history, (sample) => ({
    ...getTireTrendValues(sample).slipRatio,
  })), [history]);
  const tireSlipAngleData = useMemo(() => toChartPoints(history, (sample) => ({
    ...getTireTrendValues(sample).slipAngle,
  })), [history]);
  const tireCombinedSlipData = useMemo(() => toChartPoints(history, (sample) => ({
    ...getTireTrendValues(sample).combinedSlip,
  })), [history]);
  const tireSurfaceRumbleData = useMemo(() => toChartPoints(history, (sample) => ({
    ...getTireTrendValues(sample).surfaceRumble,
  })), [history]);
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

  if (cardId === 'suspension') {
    return (
      <div className="telemetry-detail-view">
        <div className="telemetry-detail-view__metric-grid">
          {TELEMETRY_CORNERS.map((corner, index) => (
            <SuspensionCornerSummary
              key={corner}
              label={corners[index]}
              current={suspensionMetrics.current[index]}
              summary={suspensionMetrics.summaries[index]}
              bottomOut={suspensionMetrics.bottomOut[index]}
              t={t}
            />
          ))}
          <Metric label={t('Front Average')} value={formatValue(suspensionMetrics.frontAverage)} />
          <Metric label={t('Rear Average')} value={formatValue(suspensionMetrics.rearAverage)} />
          <Metric label={t('Left Average')} value={formatValue(suspensionMetrics.leftAverage)} />
          <Metric label={t('Right Average')} value={formatValue(suspensionMetrics.rightAverage)} />
          <Metric label={t('Front/Rear Difference')} value={formatValue(suspensionMetrics.frontRearDifference)} />
          <Metric label={t('Left/Right Difference')} value={formatValue(suspensionMetrics.leftRightDifference)} />
          <Metric label={t('Travel Rate')} value={suspensionMetrics.travelRate === null ? '--' : `${formatValue(suspensionMetrics.travelRate)} /s`} />
          <Metric label={t('Pitch')} value={formatValue(current?.Pitch)} />
          <Metric label={t('Roll')} value={formatValue(current?.Roll)} />
        </div>
        <TrendChart title={t('Suspension Travel Trend')} data={suspensionData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
          { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
          { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
          { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
        ]} />
      </div>
    );
  }

  if (cardId === 'tires') {
    return (
      <div className="telemetry-detail-view">
        <div className="telemetry-detail-view__metric-grid">
          {cornerKeys.map((key, index) => (
            <div className="telemetry-detail-view__corner" key={key}>
              <h4 className="fs-6 text-primary mb-2">{corners[index]}</h4>
              <Metric label={t('Temperature')} value={tireMetrics.temperature[index] === null ? '--' : `${formatValue(convertTemp(tireMetrics.temperature[index]!).value, 1)} ${convertTemp(tireMetrics.temperature[index]!).label}`} />
              <Metric label={t('Slip Ratio')} value={formatValue(tireMetrics.slipRatio[index])} />
              <Metric label={t('Slip Angle')} value={formatDegrees(tireMetrics.slipAngle[index])} />
              <Metric label={t('Combined Slip')} value={formatValue(tireMetrics.combinedSlip[index])} />
            </div>
          ))}
        </div>
        <TrendChart title={t('Tire Temperature Trend')} data={tireTemperatureData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
          { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
          { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
          { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
        ]} />
        <TrendChart title={t('Slip Ratio Trend')} data={tireSlipRatioData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
          { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
          { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
          { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
        ]} />
        <TrendChart title={t('Slip Angle Trend')} data={tireSlipAngleData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
          { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
          { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
          { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
        ]} />
        <TrendChart title={t('Combined Slip Trend')} data={tireCombinedSlipData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
          { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
          { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
          { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
        ]} />
        <TrendChart title={t('Surface Rumble Trend')} data={tireSurfaceRumbleData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
          { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
          { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
          { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
        ]} />
      </div>
    );
  }

  if (cardId === 'dynamics') {
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
        <TrendChart title={t('Acceleration Trend')} data={dynamicsData} emptyLabel={emptyLabel} lines={[
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
        <TrendChart title={t('Power and Torque Trend')} data={powerData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'Power', label: t('Power'), color: 'var(--primary)' },
          { dataKey: 'Torque', label: t('Torque'), color: 'var(--secondary)' },
        ]} />
        <TrendChart title={t('Boost / Regeneration')} data={boostData} emptyLabel={emptyLabel} lines={[{ dataKey: 'Boost', label: t('Boost'), color: 'var(--accent)' }]} />
      </div>
    );
  }

  if (cardId === 'driver') {
    return (
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
        <TrendChart title={t('Driver Input Trend')} data={driverData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'Throttle', label: t('Throttle'), color: 'var(--primary)' },
          { dataKey: 'Brake', label: t('Brake'), color: 'var(--secondary)' },
          { dataKey: 'Steering', label: t('Steering'), color: 'var(--accent)' },
        ]} />
      </div>
    );
  }

  return (
    <div className="telemetry-detail-view">
      <div className="telemetry-detail-view__metric-grid">
        <Metric label={t('Throttle')} value={formatPercent(current?.AccelInput === undefined ? null : current.AccelInput / 255)} />
        <Metric label={t('Brake')} value={formatPercent(current?.BrakeInput === undefined ? null : current.BrakeInput / 255)} />
        <Metric label={t('Power')} value={current?.PowerWatts === undefined ? '--' : `${formatValue(convertPower(current.PowerWatts).value, 1)} ${convertPower(current.PowerWatts).label}`} />
        <Metric label={t('Torque')} value={current?.TorqueNewtons === undefined ? '--' : `${formatValue(convertTorque(current.TorqueNewtons).value, 1)} ${convertTorque(current.TorqueNewtons).label}`} />
      </div>
      <TrendChart title={t('Pedal Trace')} data={driverData} emptyLabel={emptyLabel} lines={[
        { dataKey: 'Throttle', label: t('Throttle'), color: 'var(--primary)' },
        { dataKey: 'Brake', label: t('Brake'), color: 'var(--secondary)' },
      ]} />
      <TrendChart title={t('Power and Torque Trend')} data={powerData} emptyLabel={emptyLabel} lines={[
        { dataKey: 'Power', label: t('Power'), color: 'var(--primary)' },
        { dataKey: 'Torque', label: t('Torque'), color: 'var(--secondary)' },
      ]} />
    </div>
  );
};

export default React.memo(TelemetryDetailView);
