import React from 'react';
import { useSettings } from '../context/SettingsContext';
import type { GeneralUnitSystem, UnitPreferenceOverride } from '../utils/gameUnitSettings';

interface UnitSettingsSidebarProps {
  idPrefix: string;
  show: boolean;
  title: string;
  preference: UnitPreferenceOverride;
  onChange: (preference: UnitPreferenceOverride) => void;
  onClose: () => void;
}

export const UnitSettingsSidebar: React.FC<UnitSettingsSidebarProps> = ({
  idPrefix,
  show,
  title,
  preference,
  onChange,
  onClose
}) => {
  const { t } = useSettings();
  const update = (patch: Partial<UnitPreferenceOverride>) => onChange({ ...preference, ...patch });

  return (
    <>
      <div
        className={`offcanvas-backdrop fade${show ? ' show' : ''}`}
        style={{ display: show ? 'block' : 'none', zIndex: 1040 }}
        onClick={onClose}
      />
      <div
        className={`offcanvas offcanvas-bottom glass-panel shadow-lg${show ? ' show' : ''}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-hidden={!show}
        aria-labelledby={`${idPrefix}-title`}
        style={{
          zIndex: 1050,
          visibility: show ? 'visible' : 'hidden',
          transition: 'transform 0.3s ease-in-out, visibility 0s linear 0s',
          '--bs-offcanvas-height': 'min(360px, 70vh)'
        } as React.CSSProperties}
      >
        <div className="offcanvas-header border-bottom px-4 py-3">
          <div>
            <h5 id={`${idPrefix}-title`} className="offcanvas-title text-primary fw-bold fs-6 mb-1">{title}</h5>
            <p className="text-body-secondary fs-7 mb-0">{t("Use the same three unit categories as the game, or inherit the app-wide choices.")}</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label={t("Close Unit Settings")} />
        </div>
        <div className="offcanvas-body px-4 py-3 overflow-y-auto">
          <div className="form-check form-switch mb-3">
            <input
              id={`${idPrefix}-follow-global`}
              className="form-check-input"
              type="checkbox"
              checked={preference.followGlobal}
              onChange={event => update({ followGlobal: event.target.checked })}
            />
            <label className="form-check-label fw-semibold" htmlFor={`${idPrefix}-follow-global`}>{t("Follow App Global Units")}</label>
          </div>
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label fs-7" htmlFor={`${idPrefix}-general`}>{t("General Units")}</label>
              <select id={`${idPrefix}-general`} className="form-select form-select-sm" disabled={preference.followGlobal} value={preference.general} onChange={event => update({ general: event.target.value as GeneralUnitSystem })}>
                <option value="metric">{t("Metric")}</option>
                <option value="imperial">{t("Imperial")}</option>
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label fs-7" htmlFor={`${idPrefix}-power`}>{t("Power Units")}</label>
              <select id={`${idPrefix}-power`} className="form-select form-select-sm" disabled={preference.followGlobal} value={preference.power} onChange={event => update({ power: event.target.value as UnitPreferenceOverride['power'] })}>
                <option value="hp">{t("Horsepower (hp)")}</option>
                <option value="kw">{t("Kilowatt (kW)")}</option>
                <option value="ps">{t("Metric Horsepower (PS)")}</option>
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label fs-7" htmlFor={`${idPrefix}-spring`}>{t("Spring Units")}</label>
              <select id={`${idPrefix}-spring`} className="form-select form-select-sm" disabled={preference.followGlobal} value={preference.spring} onChange={event => update({ spring: event.target.value as UnitPreferenceOverride['spring'] })}>
                <option value="kgfmm">{t("Metric (kgf/mm)")}</option>
                <option value="lbsin">{t("Imperial (lbs/in)")}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
