import type { HudConfig, HudElements } from '../hudConfig';
import type { HudPanelActions } from '../hudPanelTypes';
import { HudRange, HudSettingsSection, HudSwitch } from './HudSettingsControls';
import { HudTelemetryCard } from './HudTelemetryCard';
import { HudPositionSelect, HudTelemetryCharts } from './HudTelemetryCharts';

type TelemetryElement = Extract<keyof HudElements, `showTele${string}` | 'showPowerTorque'>;
export type HudTelemetryPanelConfig = Pick<HudConfig, Extract<keyof HudConfig, `telemetry${string}` | `gamepad${string}`>> & {
  elements: Pick<HudElements, TelemetryElement>;
};
export interface HudTelemetryPanelProps extends HudPanelActions {
  config: HudTelemetryPanelConfig;
  onElementChange: (key: TelemetryElement, checked: boolean) => void;
}

export function HudTelemetryPanel({ config, disabled, onConfigPatch, onElementChange, t }: HudTelemetryPanelProps) {
  const elements = config.elements;
  const alignment = config.telemetryGRadarAlignment ?? 'center';
  const cardSettings = t('Size, position and options');
  const toggle = (key: TelemetryElement, label: string, checked: boolean) => (
    <HudSwitch label={t(label)} checked={checked} onChange={value => onElementChange(key, value)} />
  );
  return <fieldset disabled={disabled} className="hud-settings-form d-flex flex-column gap-3">
    <legend className="visually-hidden">{t('Telemetry cards')}</legend>
    <HudSettingsSection title={t('Telemetry cards')}>
      {toggle('showTeleMaster', 'Toggle Master Telemetry HUD Switch', elements.showTeleMaster !== false)}
      <p className="fs-7 text-body-secondary m-0">{t('Hidden elements can still be configured. Changes apply when you show them again.')}</p>
      <div className="hud-settings-grid">
        <HudRange label={t('Telemetry Opacity')} value={config.telemetryOpacity ?? 0.65} min={0.1} max={1} step={0.05}
          percent numericInput onChange={telemetryOpacity => onConfigPatch({ telemetryOpacity })} />
        <HudRange label={t('Card Font Scale')} value={config.telemetryCardFontScale ?? 1} min={0.5} max={2} step={0.05}
          percent onChange={telemetryCardFontScale => onConfigPatch({ telemetryCardFontScale })} />
        {toggle('showTeleCenterAnchor', 'Center Alignment Anchor Frame', elements.showTeleCenterAnchor !== false)}
        {toggle('showTeleGridLines', 'Alignment Grid Lines', !!elements.showTeleGridLines)}
      </div>
    </HudSettingsSection>
    <div className="hud-settings-grid">
      <HudTelemetryCard title={t('Tires & suspension')} settingsLabel={cardSettings} switches={<>
        {toggle('showTeleSuspension', 'Suspension Travel', !!elements.showTeleSuspension)}
        {toggle('showTeleTiresSlip', 'Tire Slip Radar', elements.showTeleTiresSlip !== false)}
        {toggle('showTeleTiresTemp', 'Tire Temp Histogram', elements.showTeleTiresTemp !== false)}
      </>}>
        <HudRange label={t('4-Corner Wheel Cards Scale')} value={config.telemetryCornersScale ?? 1} min={0.5} max={2} step={0.05}
          percent onChange={telemetryCornersScale => onConfigPatch({ telemetryCornersScale })} />
        <HudRange label={t('Corner Cards X-Offset')} value={config.telemetryCornerOffsetX ?? 0} min={-500} max={500} step={5}
          onChange={telemetryCornerOffsetX => onConfigPatch({ telemetryCornerOffsetX })} />
        <HudRange label={t('Corner Cards Y-Offset')} value={config.telemetryCornerOffsetY ?? 0} min={-300} max={300} step={5}
          onChange={telemetryCornerOffsetY => onConfigPatch({ telemetryCornerOffsetY })} />
      </HudTelemetryCard>
      <HudTelemetryCard title={t('G-Force & Attitude')} settingsLabel={cardSettings}
        switches={toggle('showTeleAttitude', 'G-Force & Attitude', !!elements.showTeleAttitude)}>
        <HudRange label={t('G-Force Radar Scale')} value={config.telemetryGRadarScale ?? 1} min={0.5} max={2} step={0.05}
          percent onChange={telemetryGRadarScale => onConfigPatch({ telemetryGRadarScale })} />
        <label className="fs-7 d-flex flex-column gap-1">{t('G-Force Radar Alignment')}
          <select className="form-select form-select-sm" value={alignment} onChange={event => {
            const telemetryGRadarAlignment = event.target.value as 'center' | 'left' | 'right';
            const x = config.telemetryGRadarOffsetX ?? 0;
            onConfigPatch({ telemetryGRadarAlignment, telemetryGRadarOffsetX:
              telemetryGRadarAlignment === 'left' ? Math.max(0, x) : telemetryGRadarAlignment === 'right' ? Math.min(0, x) : x });
          }}>
            <option value="center">{t('Center')}</option><option value="left">{t('Left Edge')}</option><option value="right">{t('Right Edge')}</option>
          </select>
        </label>
        <HudRange label={t('G-Force Radar X-Offset')} value={config.telemetryGRadarOffsetX ?? 0}
          min={alignment === 'left' ? 0 : -500} max={alignment === 'right' ? 0 : 500} step={5}
          onChange={telemetryGRadarOffsetX => onConfigPatch({ telemetryGRadarOffsetX })} />
        <HudRange label={t('G-Force Radar Y-Offset')} value={config.telemetryGRadarOffsetY ?? 0} min={-300} max={300} step={5}
          onChange={telemetryGRadarOffsetY => onConfigPatch({ telemetryGRadarOffsetY })} />
      </HudTelemetryCard>
      <HudTelemetryCard title={t('Power & pedal charts')} settingsLabel={cardSettings} switches={<>
        {toggle('showTelePedals', 'Throttle & Brake Trace', !!elements.showTelePedals)}
        {toggle('showPowerTorque', 'Power & Torque Trace', elements.showPowerTorque !== false)}
        <HudSwitch label={t('Merge Power & Pedal Charts')} checked={config.telemetrySideBySideCharts === true}
          onChange={telemetrySideBySideCharts => onConfigPatch({ telemetrySideBySideCharts })} />
      </>}>
        <HudTelemetryCharts config={config} onConfigPatch={onConfigPatch} t={t} />
      </HudTelemetryCard>
      <HudTelemetryCard title={t('Tape Compass HUD')} settingsLabel={cardSettings}
        switches={toggle('showTeleCompass', 'Tape Compass HUD', elements.showTeleCompass !== false)}>
        <HudPositionSelect label={t('Compass Position')} value={config.telemetryCompassPosition ?? 'top'} t={t}
          onChange={telemetryCompassPosition => onConfigPatch({ telemetryCompassPosition })} />
      </HudTelemetryCard>
      <HudTelemetryCard title={t('Controller Telemetry Card')} settingsLabel={cardSettings}
        switches={toggle('showTeleGamepad', 'Controller Telemetry Card', elements.showTeleGamepad === true)}>
        <label className="fs-7 d-flex flex-column gap-1">{t('Controller Layout')}
          <select className="form-select form-select-sm" value={config.gamepadLayout ?? 'xbox'}
            onChange={event => onConfigPatch({ gamepadLayout: event.target.value as 'xbox' | 'dualsense' })}>
            <option value="xbox">{t('Xbox Wireless Controller')}</option><option value="dualsense">{t('PlayStation DualSense')}</option>
          </select>
        </label>
        <HudRange label={t('Controller X-Offset')} value={config.gamepadOffsetX ?? 0} min={-50} max={50} step={0.5} suffix="%"
          onChange={gamepadOffsetX => onConfigPatch({ gamepadOffsetX })} />
        <HudRange label={t('Controller Y-Offset')} value={config.gamepadOffsetY ?? 0} min={-50} max={50} step={0.5} suffix="%"
          onChange={gamepadOffsetY => onConfigPatch({ gamepadOffsetY })} />
      </HudTelemetryCard>
    </div>
  </fieldset>;
}
