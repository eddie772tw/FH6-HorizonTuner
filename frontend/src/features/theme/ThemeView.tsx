import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import AppearanceModePanel from './components/AppearanceModePanel';
import ColorPickerPanel from './components/ColorPickerPanel';
import CustomCSSEditorPanel from './components/CustomCSSEditorPanel';
import { ModalPortal } from '../../components/common/ModalPortal';
import { useModalFocus } from '../../hooks/useModalFocus';
import './theme.css';

interface ThemeViewProps {
  show: boolean;
  onClose: () => void;
}

const ThemeView: React.FC<ThemeViewProps> = ({ show, onClose }) => {
  const panelRef = useModalFocus<HTMLDivElement>(show, onClose);
  const { themeSettings } = useTheme();
  const { t } = useSettings();

  return (
    <ModalPortal>
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
        className={`offcanvas offcanvas-end app-menu-drawer settings-drawer theme-sidebar border-start glass-panel shadow-lg${show ? ' show' : ''}`}
        ref={panelRef}
        tabIndex={-1}
        aria-modal="true"
        aria-hidden={!show}
        aria-label={t('Theme Customization')}
        role="dialog"
        style={{
          zIndex: 1050,
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
        <div className="offcanvas-body px-4 py-3 overflow-y-auto">
          <div className="settings-surface theme-settings d-flex flex-column gap-4">
            <AppearanceModePanel />
            <ColorPickerPanel />
            <details className="theme-advanced">
              <summary>{t('Advanced customization')}</summary>
              <div className="pt-3"><CustomCSSEditorPanel /></div>
            </details>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default ThemeView;
