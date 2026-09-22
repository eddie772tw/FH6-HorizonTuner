import { useId } from 'react';
import type { HudConfig, HudElements } from '../hudConfig';
import type { HudPanelSharedProps } from '../hudPanelTypes';

export interface HudLayoutPanelProps extends HudPanelSharedProps {
  t: (key: string) => string;
  /** Retains the runtime's nested patch and tire slip/temperature dependency semantics. */
  onElementToggle: (key: keyof HudElements) => void;
}

type NumericConfigKey = {
  [Key in keyof HudConfig]-?: NonNullable<HudConfig[Key]> extends number ? Key : never;
}[keyof HudConfig];

interface RangeSetting {
  key: NumericConfigKey;
  label: string;
  ariaLabel?: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  percent?: boolean;
  numericInput?: boolean;
}

const CORNER_OFFSETS: readonly RangeSetting[] = [
  { key: 'telemetryCornerOffsetX', label: 'Corner Cards X-Offset', min: -500, max: 500, step: 5, fallback: 0 },
  { key: 'telemetryCornerOffsetY', label: 'Corner Cards Y-Offset', min: -300, max: 300, step: 5, fallback: 0 },
];
const MERGED_OFFSET: RangeSetting = { key: 'telemetryMergedChartsOffsetX', label: 'Merged Charts X-Offset', min: -500, max: 500, step: 10, fallback: 0 };
const INDIVIDUAL_OFFSETS: readonly RangeSetting[] = [
  { key: 'telemetryPedalOffsetX', label: 'Pedal Chart X-Offset', min: -500, max: 500, step: 10, fallback: 0 },
  { key: 'telemetryPowerTorqueOffsetX', label: 'Power / Torque X-Offset', min: -500, max: 500, step: 10, fallback: 0 },
];
const scale = (key: NumericConfigKey, label: string, ariaLabel = label): RangeSetting => (
  { key, label, ariaLabel, min: 0.5, max: 2, step: 0.05, fallback: 1, percent: true }
);
const COMMON_SCALES = [
  scale('telemetryGRadarScale', 'G-Force Radar Scale', 'G-Radar Scale'),
  scale('telemetryCornersScale', '4-Corner Wheel Cards Scale', 'Corner Speed / Temp Scale'),
];
const MERGED_SCALE = scale('telemetryMergedChartsScale', 'Merged Charts Scale');
const INDIVIDUAL_SCALES = [scale('telemetryPedalScale', 'Pedal Chart Scale'), scale('telemetryPowerTorqueScale', 'Power / Torque Scale')];
const OTHER_SIZES: readonly RangeSetting[] = [
  scale('telemetryCardFontScale', 'Card Font Scale'),
  { key: 'telemetryOpacity', label: 'Telemetry Opacity', ariaLabel: 'HUD Window Opacity', min: 0.1, max: 1, step: 0.05, fallback: 0.65, percent: true, numericInput: true },
];

function RangeControl({ setting, config, onConfigPatch, t }: Pick<HudLayoutPanelProps, 'config' | 'onConfigPatch' | 't'> & { setting: RangeSetting }) {
  const id = useId();
  const value = config[setting.key] ?? setting.fallback;
  const change = (next: number) => {
    const clamped = Math.max(setting.min, Math.min(setting.max, next));
    onConfigPatch({
      [setting.key]: clamped,
      ...(setting.key === 'telemetryPedalOffsetX' && config.telemetrySideBySideCharts ? { telemetryPowerTorqueOffsetX: clamped } : {}),
    });
  };
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
        <label htmlFor={id} className="fs-7 text-body-secondary">{t(setting.label)}:</label>
        {setting.numericInput ? (
          <div className="d-flex align-items-center gap-1">
            <input type="number" min={setting.min * 100} max={setting.max * 100} value={Math.round(value * 100)}
              aria-label={t(setting.label)} className="form-control form-control-sm text-center fw-bold text-primary"
              style={{ width: '65px' }} onChange={event => change(Number(event.target.value) / 100)} />
            <span className="text-primary fw-bold fs-7">%</span>
          </div>
        ) : <span className="text-primary fw-bold fs-7 text-nowrap">{setting.percent ? `${Math.round(value * 100)}%` : `${value} px`}</span>}
      </div>
      <input id={id} type="range" className="form-range" min={setting.min} max={setting.max} step={setting.step}
        value={value} aria-label={t(setting.ariaLabel ?? setting.label)} onChange={event => change(Number(event.target.value))} />
    </div>
  );
}

function Toggle({ label, checked, disabled, onToggle }: { label: string; checked: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <label className="form-check form-switch py-1 m-0">
      <input type="checkbox" className="form-check-input" checked={checked} disabled={disabled} onChange={onToggle} />
      <span className="form-check-label fs-7">{label}</span>
    </label>
  );
}

const TELEMETRY_TOGGLES: readonly { key: keyof HudElements; label: string; defaultOn?: boolean }[] = [
  { key: 'showTeleSuspension', label: 'Suspension Travel' },
  { key: 'showTeleTiresSlip', label: 'Tire Slip Radar', defaultOn: true },
  { key: 'showTeleTiresTemp', label: 'Tire Temp Histogram', defaultOn: true },
  { key: 'showTeleAttitude', label: 'G-Force & Attitude' },
  { key: 'showTelePedals', label: 'Throttle & Brake Trace' },
  { key: 'showPowerTorque', label: 'Power & Torque Trace', defaultOn: true },
];

function PositionControl({ label, value, onChange, t }: { label: string; value: 'top' | 'bottom'; onChange: (position: 'top' | 'bottom') => void; t: HudLayoutPanelProps['t'] }) {
  return (
    <label className="d-flex justify-content-between align-items-center gap-2 fs-7 text-body-secondary">
      {t(label)}:
      <select value={value} onChange={event => onChange(event.target.value as 'top' | 'bottom')}
        className="form-select form-select-sm" style={{ width: 'auto', minWidth: '110px' }}>
        <option value="bottom">{t('Bottom')}</option><option value="top">{t('Top')}</option>
      </select>
    </label>
  );
}

export function HudLayoutPanel({ config, disabled = false, onConfigPatch, onElementToggle, t }: HudLayoutPanelProps) {
  const id = useId();
  const merged = config.telemetrySideBySideCharts === true;
  const rangeProps = { config, onConfigPatch, t };
  return (
    <fieldset disabled={disabled} className="border-0 p-0 m-0 row g-4" style={{ minWidth: 0 }} aria-labelledby={`${id}-title`}>
      <legend id={`${id}-title`} className="visually-hidden">{t('HUD Style Settings')}</legend>
      <section className="col-12 col-lg-4 d-flex flex-column gap-3" aria-labelledby={`${id}-position`}>
        <h3 id={`${id}-position`} className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">{t('Offset & Position Settings')}</h3>
        {CORNER_OFFSETS.map(setting => <RangeControl key={setting.key} setting={setting} {...rangeProps} />)}
        <Toggle label={t('Merge Power & Pedal Charts')} checked={merged} onToggle={() => onConfigPatch({ telemetrySideBySideCharts: !merged })} />
        {merged ? (
          <>
            <RangeControl setting={MERGED_OFFSET} {...rangeProps} />
            <PositionControl label="Merged Charts Position" value={config.telemetryMergedChartsPosition ?? 'bottom'} t={t}
              onChange={telemetryMergedChartsPosition => onConfigPatch({ telemetryMergedChartsPosition })} />
          </>
        ) : (
          <>
            {INDIVIDUAL_OFFSETS.map(setting => <RangeControl key={setting.key} setting={setting} {...rangeProps} />)}
            <PositionControl label="Pedal Position" value={config.telemetryPedalPosition ?? 'bottom'} t={t}
              onChange={telemetryPedalPosition => onConfigPatch({ telemetryPedalPosition })} />
            <PositionControl label="Power/Torque Position" value={config.telemetryPowerTorquePosition ?? 'top'} t={t}
              onChange={telemetryPowerTorquePosition => onConfigPatch({ telemetryPowerTorquePosition })} />
          </>
        )}
        <Toggle label={t('Center Alignment Anchor Frame')} checked={config.elements.showTeleCenterAnchor !== false} onToggle={() => onElementToggle('showTeleCenterAnchor')} />
        <Toggle label={t('Alignment Grid Lines')} checked={!!config.elements.showTeleGridLines} onToggle={() => onElementToggle('showTeleGridLines')} />
      </section>
      <section className="col-12 col-lg-4 d-flex flex-column gap-3" aria-labelledby={`${id}-size`}>
        <h3 id={`${id}-size`} className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">{t('HUD Scale Size')}</h3>
        {COMMON_SCALES.map(setting => <RangeControl key={setting.key} setting={setting} {...rangeProps} />)}
        {merged ? <RangeControl setting={MERGED_SCALE} {...rangeProps} />
          : INDIVIDUAL_SCALES.map(setting => <RangeControl key={setting.key} setting={setting} {...rangeProps} />)}
        {OTHER_SIZES.map(setting => <RangeControl key={setting.key} setting={setting} {...rangeProps} />)}
      </section>
      <section className="col-12 col-lg-4 d-flex flex-column gap-3" aria-labelledby={`${id}-visibility`}>
        <h3 id={`${id}-visibility`} className="fs-6 fw-bold text-primary border-bottom pb-2 m-0">{t('Telemetry HUD Elements')}</h3>
        <Toggle label={t('Toggle Master Telemetry HUD Switch')} checked={config.elements.showTeleMaster !== false} onToggle={() => onElementToggle('showTeleMaster')} />
        <div className="row g-3">
          {TELEMETRY_TOGGLES.map(({ key, label, defaultOn }) => (
            <div className="col-12 col-sm-6 col-lg-12" key={key}>
              <Toggle label={t(label)} checked={defaultOn ? config.elements[key] !== false : !!config.elements[key]}
                disabled={config.elements.showTeleMaster === false} onToggle={() => onElementToggle(key)} />
            </div>
          ))}
        </div>
        <div className="border-top pt-3">
          <h4 className="fs-7 fw-bold text-primary mb-2">{t('Speedometer Settings')}</h4>
          <Toggle label={t('Enabled')} checked={config.elements.showGauge !== false} onToggle={() => onElementToggle('showGauge')} />
        </div>
      </section>
    </fieldset>
  );
}

export default HudLayoutPanel;
