import { useId } from 'react';
import type { HudDisplayUnits } from '../hudDisplayUnits';
import type { HudPanelActions } from '../hudPanelTypes';

export function HudUnitSettings({ followGlobal, units, globalUnits, onConfigPatch, t }: HudPanelActions & {
  followGlobal: boolean; units: HudDisplayUnits; globalUnits: HudDisplayUnits;
}) {
  const id = useId();
  const displayed = followGlobal ? globalUnits : units;
  const onFollowGlobalChange = (followAppUnits: boolean) => onConfigPatch({ followAppUnits });
  const update = <K extends keyof HudDisplayUnits>(key: K, value: HudDisplayUnits[K]) =>
    onConfigPatch({ units: { [key]: value }, ...(key === 'speed' ? { unit: value as HudDisplayUnits['speed'] } : {}) });
  return <div>
    <p className="text-body-secondary fs-7">{t('Choose HUD display units independently or inherit every value from the app.')}</p>
          <div className="form-check form-switch mb-3">
            <input
              id={`${id}-hud-follow-global-units`}
              className="form-check-input"
              type="checkbox"
              checked={followGlobal}
              onChange={event => onFollowGlobalChange(event.target.checked)}
            />
            <label className="form-check-label fw-semibold" htmlFor={`${id}-hud-follow-global-units`}>
              {t("Follow App Global Units")}
            </label>
          </div>
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <label className="form-label fs-7" htmlFor={`${id}-hud-speed-unit`}>{t("Speed Unit")}</label>
              <select
                id={`${id}-hud-speed-unit`}
                className="form-select form-select-sm"
                disabled={followGlobal}
                value={displayed.speed}
                onChange={event => update('speed', event.target.value as HudDisplayUnits['speed'])}
              >
                <option value="kmh">km/h</option>
                <option value="mph">mph</option>
              </select>
            </div>
            <div className="col-6 col-lg-3">
              <label className="form-label fs-7" htmlFor={`${id}-hud-boost-unit`}>{t("Boost Unit")}</label>
              <select
                id={`${id}-hud-boost-unit`}
                className="form-select form-select-sm"
                disabled={followGlobal}
                value={displayed.boostPressure}
                onChange={event => update('boostPressure', event.target.value as HudDisplayUnits['boostPressure'])}
              >
                <option value="bar">bar</option>
                <option value="psi">psi</option>
                <option value="kpa">kPa</option>
              </select>
            </div>
            <div className="col-6 col-lg-3">
              <label className="form-label fs-7" htmlFor={`${id}-hud-torque-unit`}>{t("Torque Unit")}</label>
              <select
                id={`${id}-hud-torque-unit`}
                className="form-select form-select-sm"
                disabled={followGlobal}
                value={displayed.torque}
                onChange={event => update('torque', event.target.value as HudDisplayUnits['torque'])}
              >
                <option value="nm">N·m</option>
                <option value="lbft">lb-ft</option>
              </select>
            </div>
            <div className="col-6 col-lg-3">
              <label className="form-label fs-7" htmlFor={`${id}-hud-power-unit`}>{t("Power Unit")}</label>
              <select
                id={`${id}-hud-power-unit`}
                className="form-select form-select-sm"
                disabled={followGlobal}
                value={displayed.power}
                onChange={event => update('power', event.target.value as HudDisplayUnits['power'])}
              >
                <option value="hp">hp</option>
                <option value="kw">kW</option>
                <option value="ps">PS</option>
              </select>
            </div>
            <div className="col-6 col-lg-3">
              <label className="form-label fs-7" htmlFor={`${id}-hud-temperature-unit`}>{t("Temperature")}</label>
              <select
                id={`${id}-hud-temperature-unit`}
                className="form-select form-select-sm"
                disabled={followGlobal}
                value={displayed.temperature === 'F' ? 'F' : 'C'}
                onChange={event => update('temperature', event.target.value as HudDisplayUnits['temperature'])}
              >
                <option value="C">°C</option>
                <option value="F">°F</option>
              </select>
            </div>
          </div>
  </div>;
}
