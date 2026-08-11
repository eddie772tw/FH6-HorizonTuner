import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import AppearanceModePanel from './components/AppearanceModePanel';
import ColorPickerPanel from './components/ColorPickerPanel';
import PresetPanel from './components/PresetPanel';
import CustomCSSEditorPanel from './components/CustomCSSEditorPanel';

interface ThemeViewProps {
  show: boolean;
  onClose: () => void;
}

const ThemeView: React.FC<ThemeViewProps> = ({ show, onClose }) => {
  const { themeSettings } = useTheme();
  const { t } = useSettings();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`offcanvas-backdrop fade${show ? ' show' : ''}`}
        style={{
          display: show ? 'block' : 'none',
          zIndex: 1040,
        }}
        onClick={onClose}
      />

      {/* Offcanvas panel */}
      <div
        className={`offcanvas offcanvas-start theme-sidebar border-end glass-panel shadow-lg${show ? ' show' : ''}`}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        style={{
          zIndex: 1050,
          visibility: show ? 'visible' : 'hidden',
          transition: 'transform 0.3s ease-in-out, visibility 0s linear 0s',
        }}
      >
        {/* Header */}
        <div className="offcanvas-header border-bottom px-4 py-3 d-flex justify-content-between align-items-center">
          <div>
            <h5 className="offcanvas-title text-primary fw-bold fs-6 m-0">
              {t("Theme Customization")}
            </h5>
            <p className="text-body-secondary fs-8 mb-0 mt-1" style={{ lineHeight: '1.3' }}>
              {t("Personalize skin, colors, and custom CSS")}
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge text-bg-primary fs-8 px-2 py-1 fw-bold">
              {themeSettings.mode.toUpperCase()}
            </span>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label={t("Close Theme Panel")}
            />
          </div>
        </div>

        {/* Offcanvas Body */}
        <div className="offcanvas-body p-0 overflow-y-auto">
          <div className="d-flex flex-column gap-4 p-4">
            <AppearanceModePanel />
            <ColorPickerPanel />
            <PresetPanel />
            <CustomCSSEditorPanel />
          </div>
        </div>
      </div>
    </>
  );
};

export default ThemeView;
