import React, { useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';

interface RenderSwitchProps {
  checked: boolean;
  onChange: () => void;
  tooltipText?: string;
}

const RenderSwitch: React.FC<RenderSwitchProps> = ({ checked, onChange, tooltipText }) => {
  const { t } = useSettings();
  const [showTooltip, setShowTooltip] = useState(false);
  const labelText = tooltipText || t("Toggle chart rendering for this section");

  return (
    <div
      className="position-relative d-inline-flex align-items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <div className="form-check form-switch m-0 d-flex align-items-center">
        <input
          className="form-check-input mt-0 pointer cursor-pointer"
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={onChange}
          aria-label={labelText}
        />
      </div>

      {showTooltip && (
        <div
          role="tooltip"
          className="position-absolute px-2 py-1 fs-8 text-nowrap pointer-events-none"
          style={{
            top: '100%',
            right: '0',
            marginTop: '6px',
            background: 'var(--bs-body-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--input-radius)',
            zIndex: 1050,
          }}
        >
          {labelText}
        </div>
      )}
    </div>
  );
};

export default RenderSwitch;
