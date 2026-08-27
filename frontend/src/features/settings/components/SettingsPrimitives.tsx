import React from 'react';

interface SettingsSectionProps {
  title: React.ReactNode;
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

interface SettingsItemProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

interface SettingsSwitchProps {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  headerAside,
  children,
  className = '',
}) => (
  <section className={`settings-section glass-panel d-flex flex-column gap-3 ${className}`.trim()}>
    <header className="settings-section-header d-flex justify-content-between align-items-center flex-wrap gap-2 border-bottom pb-2">
      <h3 className="settings-section-title text-primary fs-6 fw-bold m-0">{title}</h3>
      {headerAside}
    </header>
    {children}
  </section>
);

export const SettingsItem: React.FC<SettingsItemProps> = ({
  label,
  description,
  htmlFor,
  children,
  className = '',
}) => (
  <div className={`settings-row d-flex justify-content-between align-items-center border-bottom pb-3 ${className}`.trim()}>
    <div className="min-width-0">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="settings-item-label form-label fw-semibold mb-0">
          {label}
        </label>
      ) : (
        <div className="settings-item-label form-label fw-semibold mb-0">{label}</div>
      )}
      {description && <div className="settings-item-description form-text">{description}</div>}
    </div>
    <div className="settings-control">{children}</div>
  </div>
);

export const SettingsSwitch: React.FC<SettingsSwitchProps> = ({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}) => (
  <label
    htmlFor={id}
    className="settings-row settings-switch form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3 mb-0"
  >
    <span className="min-width-0">
      <span className="settings-item-label form-check-label d-block fw-semibold">{label}</span>
      {description && <span className="settings-item-description form-text d-block">{description}</span>}
    </span>
    <input
      type="checkbox"
      className="form-check-input ms-auto fs-5 flex-shrink-0"
      id={id}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
  </label>
);
