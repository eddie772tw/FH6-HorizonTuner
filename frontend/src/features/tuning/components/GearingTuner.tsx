import { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useSettings } from '../../../context/SettingsContext';
import type { GearingResult } from '../../../domain/tuning/types';
import type { GearingView } from '../aegoTypes';
import { computeGearingChartData } from './gearingChartData';
import { validGearingView } from './gearingView';

/** Display geometry only. Rust resolves the driven tire and qualified RPM inputs. */
export const GearingTuner = memo(function GearingTuner({ gearing, view }: { gearing: GearingResult; view?: GearingView | null }) {
  const { settings, convertSpeed, t } = useSettings();
  const chart = useMemo(() => !validGearingView(view, gearing) ? null : computeGearingChartData({
    numGears: gearing.gears.length, gears: gearing.gears, finalDrive: gearing.finalDrive,
    maxRpm: view.maxRpm, effectiveRedline: view.effectiveRedline, maxHpRpm: view.powerPeakRpm,
    tireRadiusM: view.tireRadiusM, speedUnit: settings.units.speed, convertSpeed,
  }), [view, gearing, settings.units.speed, convertSpeed]);
  if (!chart || !view) return <p role="status">{t('The gearing chart requires backend-resolved tire and RPM inputs.')}</p>;
  const speedLabel = settings.units.speed === 'mph' ? 'mph' : 'km/h';
  return <section id="aego-gearing-chart" aria-labelledby="aego-chart-title">
    <h4 id="aego-chart-title" className="fs-6">{t('AEGO gear ratios & wheel-speed curve')}</h4>
    <p className="small text-body-secondary">{t('Driven tire axle')}: {t(view.drivenTireAxle === 'front' ? 'Front' : 'Rear')} · {t('Reference RPM')}: {Math.round(view.referenceRpm)} RPM</p>
    <p className="small text-body-secondary">{t('Peak markers are not a measured usable power band. This is wheel-speed geometry, not verified ground speed or performance.')}</p>
    <div className="row g-3 align-items-start">
      <div className="col-12 col-md-4"><div className="table-responsive"><table className="table table-sm">
        <tbody><tr><th scope="row">{t('Final Drive Ratio (FD)')}</th><td className="text-end">{gearing.finalDrive.toFixed(2)}</td></tr>
          {gearing.gears.map((gear, index) => <tr key={index}><th scope="row">{t('Gear')} {index + 1}</th><td className="text-end">{gear.toFixed(2)}</td></tr>)}
        </tbody>
      </table></div></div>
      <div className="col-12 col-md-8" style={{ minWidth: 0 }}>
        <div className="core-theme-chart" style={{ background: 'var(--surface-2)', borderRadius: 'var(--chart-radius)', padding: '0.8rem', border: '1px solid var(--glass-border)' }}>
          <ResponsiveContainer width="100%" aspect={16 / 9} minWidth={0}>
            <LineChart data={chart.chartData} margin={{ top: 15, right: 15, bottom: 5, left: -15 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="var(--chart-grid-dash)" />
              <XAxis dataKey="speed" type="number" domain={[0, chart.xMax]} stroke="var(--text-secondary)" fontSize={10} unit={` ${speedLabel}`} />
              <YAxis type="number" domain={[0, chart.yMax]} stroke="var(--text-secondary)" fontSize={10} tickFormatter={value => Math.round(value).toString()} unit=" RPM" />
              <ReferenceLine y={chart.cutoffRpm} stroke="var(--bs-danger-text-emphasis)" strokeDasharray="4 2"
                label={{ value: `${t('Rev Limiter')}: ${Math.round(chart.cutoffRpm)} RPM`, fill: 'var(--bs-danger-text-emphasis)', fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine y={view.powerPeakRpm} stroke="var(--bs-danger-text-emphasis)" strokeDasharray="3 3"
                label={{ value: `${t('Peak power RPM')}: ${Math.round(view.powerPeakRpm)}`, fill: 'var(--bs-danger-text-emphasis)', fontSize: 10, position: 'top' }} />
              <ReferenceLine y={view.torquePeakRpm} stroke="var(--bs-warning-text-emphasis)" strokeDasharray="3 3"
                label={{ value: `${t('Peak torque RPM')}: ${Math.round(view.torquePeakRpm)}`, fill: 'var(--bs-warning-text-emphasis)', fontSize: 10, position: 'bottom' }} />
              {gearing.gears.map((_, index) => <Line key={index} type="linear" dataKey={`gear${index + 1}`}
                stroke={`color-mix(in srgb, hsl(${index * 45} var(--chart-series-saturation) var(--chart-series-lightness)) 65%, var(--text-primary))`}
                strokeWidth={2} dot={false} isAnimationActive={false} connectNulls name={`${index + 1} Gear`} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  </section>;
});
