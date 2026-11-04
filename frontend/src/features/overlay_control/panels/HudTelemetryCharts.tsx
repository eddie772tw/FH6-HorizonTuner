import type { HudConfig } from '../hudConfig';
import type { HudPanelActions } from '../hudPanelTypes';
import { HudRange } from './HudSettingsControls';

export function HudPositionSelect({ label, value, onChange, t }: {
  label: string; value: 'top' | 'bottom'; onChange: (value: 'top' | 'bottom') => void; t: HudPanelActions['t'];
}) {
  return <label className="fs-7 d-flex flex-column gap-1">
    {label}
    <select className="form-select form-select-sm" value={value} onChange={event => onChange(event.target.value as 'top' | 'bottom')}>
      <option value="bottom">{t('Bottom')}</option><option value="top">{t('Top')}</option>
    </select>
  </label>;
}

type ChartsConfig = Pick<HudConfig, 'telemetrySideBySideCharts' | 'telemetryMergedChartsScale' |
  'telemetryMergedChartsPosition' | 'telemetryMergedChartsOffsetX' | 'telemetryPedalScale' |
  'telemetryPedalPosition' | 'telemetryPedalOffsetX' | 'telemetryPowerTorqueScale' |
  'telemetryPowerTorquePosition' | 'telemetryPowerTorqueOffsetX'>;

export function HudTelemetryCharts({ config, onConfigPatch, t }: HudPanelActions & { config: ChartsConfig }) {
  return config.telemetrySideBySideCharts === true ? <>
    <HudRange label={t('Merged Charts Scale')} value={config.telemetryMergedChartsScale ?? 1} min={0.5} max={2} step={0.05}
      percent onChange={telemetryMergedChartsScale => onConfigPatch({ telemetryMergedChartsScale })} />
    <HudRange label={t('Merged Charts X-Offset')} value={config.telemetryMergedChartsOffsetX ?? 0} min={-500} max={500} step={10}
      onChange={telemetryMergedChartsOffsetX => onConfigPatch({ telemetryMergedChartsOffsetX })} />
    <HudPositionSelect label={t('Merged Charts Position')} value={config.telemetryMergedChartsPosition ?? 'bottom'} t={t}
      onChange={telemetryMergedChartsPosition => onConfigPatch({ telemetryMergedChartsPosition })} />
  </> : <>
    <HudRange label={t('Pedal Chart Scale')} value={config.telemetryPedalScale ?? 1} min={0.5} max={2} step={0.05}
      percent onChange={telemetryPedalScale => onConfigPatch({ telemetryPedalScale })} />
    <HudRange label={t('Pedal Chart X-Offset')} value={config.telemetryPedalOffsetX ?? 0} min={-500} max={500} step={10}
      onChange={telemetryPedalOffsetX => onConfigPatch({ telemetryPedalOffsetX })} />
    <HudPositionSelect label={t('Pedal Position')} value={config.telemetryPedalPosition ?? 'bottom'} t={t}
      onChange={telemetryPedalPosition => onConfigPatch({ telemetryPedalPosition })} />
    <HudRange label={t('Power / Torque Scale')} value={config.telemetryPowerTorqueScale ?? 1} min={0.5} max={2} step={0.05}
      percent onChange={telemetryPowerTorqueScale => onConfigPatch({ telemetryPowerTorqueScale })} />
    <HudRange label={t('Power / Torque X-Offset')} value={config.telemetryPowerTorqueOffsetX ?? 0} min={-500} max={500} step={10}
      onChange={telemetryPowerTorqueOffsetX => onConfigPatch({ telemetryPowerTorqueOffsetX })} />
    <HudPositionSelect label={t('Power/Torque Position')} value={config.telemetryPowerTorquePosition ?? 'top'} t={t}
      onChange={telemetryPowerTorquePosition => onConfigPatch({ telemetryPowerTorquePosition })} />
  </>;
}
