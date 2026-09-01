import React from 'react';
import type { UnitSettings } from '../../context/SettingsContext';
import { ModalPortal } from '../../components/common/ModalPortal';

export interface HudDisplayUnits {
  speed: UnitSettings['speed'];
  boostPressure: UnitSettings['boostPressure'];
  torque: UnitSettings['torque'];
  power: UnitSettings['power'];
}

interface HudUnitSettingsSidebarProps {
  show: boolean;
  followGlobal: boolean;
  units: HudDisplayUnits;
  globalUnits: UnitSettings;
  t: (text: string) => string;
  onFollowGlobalChange: (follow: boolean) => void;
  onUnitsChange: (units: HudDisplayUnits) => void;
  onClose: () => void;
}

export const HudUnitSettingsSidebar: React.FC<HudUnitSettingsSidebarProps> = ({
  show,
  followGlobal,
  units,
  globalUnits,
  t,
  onFollowGlobalChange,
  onUnitsChange,
  onClose
}) => {
  const displayed = followGlobal ? globalUnits : units;
  const update = <K extends keyof HudDisplayUnits>(key: K, value: HudDisplayUnits[K]) =>
    onUnitsChange({ ...units, [key]: value });

  return (
    <ModalPortal>
      <div className={`offcanvas-backdrop fade${show ? ' show' : ''}`} style={{ display: show ? 'block' : 'none', zIndex: 1040 }} onClick={onClose} />
      <div
        className={`offcanvas offcanvas-bottom glass-panel shadow-lg${show ? ' show' : ''}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-hidden={!show}
        aria-labelledby="hud-unit-settings-title"
        style={{
          zIndex: 1050,
          visibility: show ? 'visible' : 'hidden',
          transition: 'transform 0.3s ease-in-out, visibility 0s linear 0s',
          '--bs-offcanvas-height': 'min(360px, 70vh)'
        } as React.CSSProperties}
      >
        <div className="offcanvas-header border-bottom px-4 py-3">
          <div>
            <h5 id="hud-unit-settings-title" className="offcanvas-title text-primary fw-bold fs-6 mb-1">{t("HUD Unit Settings")}</h5>
            <p className="text-body-secondary fs-7 mb-0">{t("Choose HUD display units independently or inherit every value from the app.")}</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label={t("Close Unit Settings")} />
        </div>
        <div className="offcanvas-body px-4 py-3 overflow-y-auto">
          <div className="form-check form-switch mb-3">
            <input
              id="hud-follow-global-units"
              className="form-check-input"
              type="checkbox"
              checked={followGlobal}
              onChange={event => onFollowGlobalChange(event.target.checked)}
            />
            <label className="form-check-label fw-semibold" htmlFor="hud-follow-global-units">
              {t("Follow App Global Units")}
            </label>
          </div>
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <label className="form-label fs-7" htmlFor="hud-speed-unit">{t("Speed Unit")}</label>
              <select
                id="hud-speed-unit"
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
              <label className="form-label fs-7" htmlFor="hud-boost-unit">{t("Boost Unit")}</label>
              <select
                id="hud-boost-unit"
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
              <label className="form-label fs-7" htmlFor="hud-torque-unit">{t("Torque Unit")}</label>
              <select
                id="hud-torque-unit"
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
              <label className="form-label fs-7" htmlFor="hud-power-unit">{t("Power Unit")}</label>
              <select
                id="hud-power-unit"
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
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
