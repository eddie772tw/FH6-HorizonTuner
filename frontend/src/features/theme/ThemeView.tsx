import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import AppearanceModePanel from './components/AppearanceModePanel';
import ColorPickerPanel from './components/ColorPickerPanel';
import PresetPanel from './components/PresetPanel';
import SlotManagerPanel from './components/SlotManagerPanel';
import CustomCSSEditorPanel from './components/CustomCSSEditorPanel';

const ThemeView: React.FC = () => {
  const { themeSettings } = useTheme();
  const { t } = useSettings();

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto">
      
      {/* Standardized Header Banner (Aligned with OverlayView) */}
      <div className="border-bottom pb-3 mb-2 flex-shrink-0">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h2 className="text-primary fs-4 fw-bold mb-1" style={{ letterSpacing: '0.5px' }}>
              {t("Theme Customization")}
            </h2>
            <p className="text-body-secondary fs-7 mb-0" style={{ lineHeight: '1.4' }}>
              {t("Personalize application skin, glassmorphism, accent colors, and custom CSS styling")}
            </p>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className="badge text-bg-primary fs-7 px-3 py-2 fw-bold">
              Halfmoon CSS • {themeSettings.mode.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow-1 overflow-auto p-2">


        <div className="d-flex flex-column gap-4">
          <AppearanceModePanel />
          <ColorPickerPanel />
          <PresetPanel />
          <SlotManagerPanel />
          <CustomCSSEditorPanel />
        </div>
      </div>
    </div>
  );
};

export default ThemeView;

