import React from 'react';
import { useSettings, type UnitSettings } from '../context/SettingsContext';
import { ModalPortal } from './common/ModalPortal';
import type { GeneralUnitSystem, GranularUnitPreference, UnitPreferenceOverride } from '../utils/gameUnitSettings';

interface UnitSettingsSidebarBaseProps {
  idPrefix: string;
  show: boolean;
  title: string;
  onClose: () => void;
}

interface SimpleUnitSettingsSidebarProps extends UnitSettingsSidebarBaseProps {
  preference: UnitPreferenceOverride;
  onChange: (preference: UnitPreferenceOverride) => void;
  mode?: 'simple';
}

interface GranularUnitSettingsSidebarProps extends UnitSettingsSidebarBaseProps {
  preference: GranularUnitPreference;
  onChange: (preference: GranularUnitPreference) => void;
  mode: 'granular';
}

type UnitSettingsSidebarProps = SimpleUnitSettingsSidebarProps | GranularUnitSettingsSidebarProps;

export const UnitSettingsSidebar: React.FC<UnitSettingsSidebarProps> = props => {
  return props.mode === 'granular'
    ? <GranularUnitSettingsSidebar {...props} />
    : <SimpleUnitSettingsSidebar {...props} />;
};

interface UnitSettingsSidebarFrameProps extends UnitSettingsSidebarBaseProps {
  description: string;
  followGlobal: boolean;
  onFollowGlobalChange: (followGlobal: boolean) => void;
  children: React.ReactNode;
}

const UnitSettingsSidebarFrame: React.FC<UnitSettingsSidebarFrameProps> = ({
  idPrefix,
  show,
  title,
  description,
  followGlobal,
  onFollowGlobalChange,
  onClose,
  children
}) => {
  const { t } = useSettings();
  return (
    <ModalPortal>
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
            <p className="text-body-secondary fs-7 mb-0">{description}</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label={t("Close Unit Settings")} />
        </div>
        <div className="offcanvas-body px-4 py-3 overflow-y-auto">
          <div className="form-check form-switch mb-3">
            <input
              id={`${idPrefix}-follow-global`}
              className="form-check-input"
              type="checkbox"
              checked={followGlobal}
              onChange={event => onFollowGlobalChange(event.target.checked)}
            />
            <label className="form-check-label fw-semibold" htmlFor={`${idPrefix}-follow-global`}>{t("Follow App Global Units")}</label>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
};

const SimpleUnitSettingsSidebar: React.FC<SimpleUnitSettingsSidebarProps> = ({ preference, onChange, ...props }) => {
  const { t } = useSettings();
  const update = (patch: Partial<UnitPreferenceOverride>) => onChange({ ...preference, ...patch });

  return (
    <UnitSettingsSidebarFrame
      {...props}
      description={t("Use the same three unit categories as the game, or inherit the app-wide choices.")}
      followGlobal={preference.followGlobal}
      onFollowGlobalChange={followGlobal => update({ followGlobal })}
    >
      <div className="row g-3">
        <div className="col-12 col-md-4">
          <label className="form-label fs-7" htmlFor={`${props.idPrefix}-general`}>{t("General Units")}</label>
          <select id={`${props.idPrefix}-general`} className="form-select form-select-sm" disabled={preference.followGlobal} value={preference.general} onChange={event => update({ general: event.target.value as GeneralUnitSystem })}>
            <option value="metric">{t("Metric")}</option>
            <option value="imperial">{t("Imperial")}</option>
          </select>
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label fs-7" htmlFor={`${props.idPrefix}-power`}>{t("Power Units")}</label>
          <select id={`${props.idPrefix}-power`} className="form-select form-select-sm" disabled={preference.followGlobal} value={preference.power} onChange={event => update({ power: event.target.value as UnitPreferenceOverride['power'] })}>
            <option value="hp">{t("Horsepower (hp)")}</option>
            <option value="kw">{t("Kilowatt (kW)")}</option>
            <option value="ps">{t("Metric Horsepower (PS)")}</option>
          </select>
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label fs-7" htmlFor={`${props.idPrefix}-spring`}>{t("Spring Units")}</label>
          <select id={`${props.idPrefix}-spring`} className="form-select form-select-sm" disabled={preference.followGlobal} value={preference.spring} onChange={event => update({ spring: event.target.value as UnitPreferenceOverride['spring'] })}>
            <option value="kgfmm">{t("Metric (kgf/mm)")}</option>
            <option value="lbsin">{t("Imperial (lbs/in)")}</option>
          </select>
        </div>
      </div>
    </UnitSettingsSidebarFrame>
  );
};

const GranularUnitSettingsSidebar: React.FC<GranularUnitSettingsSidebarProps> = ({ preference, onChange, mode: _, ...props }) => {
  const { t } = useSettings();
  const update = (patch: Partial<UnitSettings>) => onChange({ ...preference, units: { ...preference.units, ...patch } });

  return (
    <UnitSettingsSidebarFrame
      {...props}
      description={t("Choose each telemetry display unit independently, or inherit the app-wide choices.")}
      followGlobal={preference.followGlobal}
      onFollowGlobalChange={followGlobal => onChange({ ...preference, followGlobal })}
    >
      <div className="row g-3">
        <UnitSelect id={`${props.idPrefix}-speed`} label={t("Speed")} value={preference.units.speed} disabled={preference.followGlobal} options={[['kmh', 'km/h'], ['mph', 'mph']]} onChange={value => update({ speed: value as UnitSettings['speed'] })} />
        <UnitSelect id={`${props.idPrefix}-weight`} label={t("Weight")} value={preference.units.weight} disabled={preference.followGlobal} options={[['kg', 'kg'], ['lbs', 'lbs']]} onChange={value => update({ weight: value as UnitSettings['weight'] })} />
        <UnitSelect id={`${props.idPrefix}-temperature`} label={t("Temperature")} value={preference.units.temperature} disabled={preference.followGlobal} options={[['C', '°C'], ['F', '°F']]} onChange={value => update({ temperature: value as UnitSettings['temperature'] })} />
        <UnitSelect id={`${props.idPrefix}-tire-pressure`} label={t("Tire Pressure")} value={preference.units.tirePressure} disabled={preference.followGlobal} options={[['bar', 'bar'], ['psi', 'psi'], ['kpa', 'kPa']]} onChange={value => update({ tirePressure: value as UnitSettings['tirePressure'] })} />
        <UnitSelect id={`${props.idPrefix}-boost-pressure`} label={t("Boost Pressure")} value={preference.units.boostPressure} disabled={preference.followGlobal} options={[['bar', 'bar'], ['psi', 'psi'], ['kpa', 'kPa']]} onChange={value => update({ boostPressure: value as UnitSettings['boostPressure'] })} />
        <UnitSelect id={`${props.idPrefix}-spring`} label={t("Spring Units")} value={preference.units.springRate} disabled={preference.followGlobal} options={[['kgfmm', 'kgf/mm'], ['lbsin', 'lbs/in']]} onChange={value => update({ springRate: value as UnitSettings['springRate'] })} />
        <UnitSelect id={`${props.idPrefix}-ride-height`} label={t("Ride Height")} value={preference.units.rideHeight} disabled={preference.followGlobal} options={[['cm', 'cm'], ['in', 'in']]} onChange={value => update({ rideHeight: value as UnitSettings['rideHeight'] })} />
        <UnitSelect id={`${props.idPrefix}-suspension-force`} label={t("Suspension Force")} value={preference.units.suspensionForce} disabled={preference.followGlobal} options={[['kgf', 'kgf'], ['lbf', 'lbf']]} onChange={value => update({ suspensionForce: value as UnitSettings['suspensionForce'] })} />
        <UnitSelect id={`${props.idPrefix}-power`} label={t("Power Units")} value={preference.units.power} disabled={preference.followGlobal} options={[['hp', t("Horsepower (hp)")], ['kw', t("Kilowatt (kW)")], ['ps', t("Metric Horsepower (PS)")]]} onChange={value => update({ power: value as UnitSettings['power'] })} />
        <UnitSelect id={`${props.idPrefix}-torque`} label={t("Torque")} value={preference.units.torque} disabled={preference.followGlobal} options={[['nm', 'N·m'], ['lbft', 'lb-ft']]} onChange={value => update({ torque: value as UnitSettings['torque'] })} />
      </div>
    </UnitSettingsSidebarFrame>
  );
};

interface UnitSelectProps {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}

const UnitSelect: React.FC<UnitSelectProps> = ({ id, label, value, disabled, options, onChange }) => (
  <div className="col-12 col-sm-6 col-lg-4">
    <label className="form-label fs-7" htmlFor={id}>{label}</label>
    <select id={id} className="form-select form-select-sm" disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>
  </div>
);
