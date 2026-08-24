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
import { useTelemetryHistory, type TelemetryHistorySample } from '../telemetryHistory';
import { type TelemetryCardId } from './TelemetryCardShell';

interface TelemetryDetailViewProps {
  cardId: TelemetryCardId;
  current: TelemetryData | null;
}

interface ChartLine {
  dataKey: string;
  label: string;
  color: string;
}

type ChartPoint = Record<string, number | null> & { time: number };

const cornerKeys = ['FL', 'FR', 'RL', 'RR'] as const;

const numberOrNull = (value: number | undefined | null): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const formatValue = (value: number | null | undefined, digits = 2): string => (
  numberOrNull(value) === null ? '--' : Number(value).toFixed(digits)
);

const formatPercent = (value: number | null | undefined): string => (
  numberOrNull(value) === null ? '--' : `${(Number(value) * 100).toFixed(0)}%`
);

const getFour = (values: number[] | undefined, index: number): number | null => (
  Array.isArray(values) ? numberOrNull(values[index]) : null
);

const toChartPoints = (
  history: TelemetryHistorySample[],
  selector: (sample: TelemetryHistorySample) => Record<string, number | null>,
): ChartPoint[] => {
  const first = history[0]?.timeSeconds ?? 0;
  return history.map((sample) => ({
    time: Number((sample.timeSeconds - first).toFixed(1)),
    ...selector(sample),
  }));
};

const Metric: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-body' }) => (
  <div className="telemetry-detail-view__metric">
    <span className="text-body-secondary fs-8 text-uppercase">{label}</span>
    <strong className={`font-monospace fs-5 ${tone}`}>{value}</strong>
  </div>
);

const TrendChart: React.FC<{ title: string; data: ChartPoint[]; lines: ChartLine[]; emptyLabel: string }> = ({ title, data, lines, emptyLabel }) => (
  <div className="telemetry-detail-view__chart glass-panel p-2">
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h4 className="fs-6 text-primary m-0">{title}</h4>
      <span className="text-body-secondary fs-8">30 s</span>
    </div>
    {data.length === 0 ? (
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

const TelemetryDetailView: React.FC<TelemetryDetailViewProps> = ({ cardId, current }) => {
  const { t, convertPower, convertTorque, convertSpeed } = useSettings();
  const history = useTelemetryHistory();
  const corners = [t('Front Left'), t('Front Right'), t('Rear Left'), t('Rear Right')];
  const emptyLabel = t('Waiting for live telemetry history');

  const suspensionData = useMemo(() => toChartPoints(history, (sample) => ({
    FL: sample.suspension[0], FR: sample.suspension[1], RL: sample.suspension[2], RR: sample.suspension[3],
  })), [history]);
  const tireData = useMemo(() => toChartPoints(history, (sample) => ({
    FL: sample.combinedSlip?.[0] ?? null,
    FR: sample.combinedSlip?.[1] ?? null,
    RL: sample.combinedSlip?.[2] ?? null,
    RR: sample.combinedSlip?.[3] ?? null,
  })), [history]);
  const dynamicsData = useMemo(() => toChartPoints(history, (sample) => ({
    Lateral: -sample.acceleration[0] / 9.81,
    Longitudinal: sample.acceleration[2] / 9.81,
    Vertical: sample.acceleration[1] / 9.81,
  })), [history]);
  const driverData = useMemo(() => toChartPoints(history, (sample) => ({
    Throttle: sample.accelInput === null ? null : sample.accelInput / 255,
    Brake: sample.brakeInput === null ? null : sample.brakeInput / 255,
    Steering: sample.steerInput === null ? null : sample.steerInput / 127,
  })), [history]);
  const powerData = useMemo(() => toChartPoints(history, (sample) => ({
    Power: sample.powerWatts === null ? null : convertPower(sample.powerWatts).value,
    Torque: sample.torqueNewtons === null ? null : convertTorque(sample.torqueNewtons).value,
  })), [history, convertPower, convertTorque]);

  if (cardId === 'suspension') {
    const values = cornerKeys.map((_, index) => getFour(current?.NormalizedSuspensionTravel, index));
    return (
      <div className="telemetry-detail-view">
        <div className="telemetry-detail-view__metric-grid">
          {values.map((value, index) => <Metric key={cornerKeys[index]} label={corners[index]} value={formatValue(value)} />)}
          <Metric label={t('Front Average')} value={formatValue(values[0] === null || values[1] === null ? null : (values[0] + values[1]) / 2)} />
          <Metric label={t('Rear Average')} value={formatValue(values[2] === null || values[3] === null ? null : (values[2] + values[3]) / 2)} />
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
              <Metric label={t('Temperature')} value={formatValue(getFour(current?.TireTemp, index), 1)} />
              <Metric label={t('Slip Ratio')} value={formatValue(getFour(current?.TireSlipRatio, index))} />
              <Metric label={t('Slip Angle')} value={formatValue(getFour(current?.TireSlipAngle, index))} />
              <Metric label={t('Combined Slip')} value={formatValue(getFour(current?.TireCombinedSlip, index))} />
            </div>
          ))}
        </div>
        <TrendChart title={t('Combined Slip Trend')} data={tireData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
          { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
          { dataKey: 'RL', label: 'RL', color: 'var(--accent)' },
          { dataKey: 'RR', label: 'RR', color: 'var(--bs-warning)' },
        ]} />
      </div>
    );
  }

  if (cardId === 'dynamics') {
    const power = current?.PowerWatts === undefined ? null : convertPower(current.PowerWatts);
    const torque = current?.TorqueNewtons === undefined ? null : convertTorque(current.TorqueNewtons);
    const speed = current?.SpeedMetersPerSecond === undefined ? null : convertSpeed(current.SpeedMetersPerSecond);
    return (
      <div className="telemetry-detail-view">
        <div className="telemetry-detail-view__metric-grid">
          <Metric label={t('Speed')} value={speed ? `${formatValue(speed.value, 1)} ${speed.label}` : '--'} />
          <Metric label={t('RPM')} value={formatValue(current?.CurrentEngineRpm, 0)} />
          <Metric label={t('Power')} value={power ? `${formatValue(power.value, 1)} ${power.label}` : '--'} />
          <Metric label={t('Torque')} value={torque ? `${formatValue(torque.value, 1)} ${torque.label}` : '--'} />
          <Metric label={t('Lateral G')} value={formatValue(current ? -current.AccelerationX / 9.81 : null)} />
          <Metric label={t('Longitudinal G')} value={formatValue(current ? current.AccelerationZ / 9.81 : null)} />
          <Metric label={t('Pitch')} value={formatValue(current?.Pitch)} />
          <Metric label={t('Roll')} value={formatValue(current?.Roll)} />
        </div>
        <TrendChart title={t('Acceleration Trend')} data={dynamicsData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'Lateral', label: t('Lateral G'), color: 'var(--primary)' },
          { dataKey: 'Longitudinal', label: t('Longitudinal G'), color: 'var(--secondary)' },
          { dataKey: 'Vertical', label: t('Vertical G'), color: 'var(--accent)' },
        ]} />
        <TrendChart title={t('Power and Torque Trend')} data={powerData} emptyLabel={emptyLabel} lines={[
          { dataKey: 'Power', label: t('Power'), color: 'var(--primary)' },
          { dataKey: 'Torque', label: t('Torque'), color: 'var(--secondary)' },
        ]} />
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
