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
          className="position-absolute shadow-sm rounded-2 px-2 py-1 fs-8 text-nowrap pointer-events-none"
          style={{
            top: '100%',
            right: '0',
            marginTop: '6px',
            background: 'var(--surface-2, rgba(15, 23, 42, 0.95))',
            color: 'var(--bs-body-color, #ffffff)',
            border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.15))',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            zIndex: 1050,
            backdropFilter: 'blur(6px)',
          }}
        >
          {labelText}
        </div>
      )}
    </div>
  );
};

export default RenderSwitch;
