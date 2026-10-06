import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import AppearanceModePanel from './components/AppearanceModePanel';
import ColorPickerPanel from './components/ColorPickerPanel';
import CustomCSSEditorPanel from './components/CustomCSSEditorPanel';
import { ModalPortal } from '../../components/common/ModalPortal';
import { useDialogTransition } from '../../hooks/useDialogTransition';
import './theme.css';

interface ThemeViewProps {
  show: boolean;
  onClose: () => void;
}

const ThemeView: React.FC<ThemeViewProps> = ({ show, onClose }) => {
  const { shown, close, panelRef, onTransitionEnd } = useDialogTransition(show, onClose);
  const { themeSettings } = useTheme();
  const { t } = useSettings();

  return (
    <ModalPortal>
      {/* Backdrop */}
      <div
        className={`offcanvas-backdrop fade${shown ? ' show' : ''}`}
        style={{
          display: show ? 'block' : 'none',
          zIndex: 1040,
        }}
        onClick={close}
      />

      {/* Offcanvas panel */}
      <div
        className={`offcanvas offcanvas-end app-menu-drawer settings-drawer theme-sidebar border-start glass-panel shadow-lg${shown ? ' show' : ''}`}
        ref={panelRef}
        onTransitionEnd={onTransitionEnd}
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
            <p className="surface-intro text-body-secondary fs-8 mb-0 mt-1" style={{ lineHeight: '1.3' }}>
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
              onClick={close}
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
