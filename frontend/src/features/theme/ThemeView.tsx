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
    <div style={{ padding: '2rem', color: 'var(--text-primary)', height: '100%', overflowY: 'auto' }}>
      <div className="glass-panel" style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>

        {/* Title & Architecture Banner */}
        <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.2rem' }}>
          <h2 style={{ color: 'var(--primary)', margin: 0, textShadow: '0 0 10px var(--primary-glow)', fontSize: '1.8rem' }}>
            {t('Theme Settings')}
          </h2>
          <div style={{
            marginTop: '0.8rem',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            background: 'var(--primary-glow)',
            border: '1px solid var(--primary)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>{t('CSS Engine')}: </strong>
            {t('Halfmoon CSS v2.0.2')} + Glassmorphism Skin
            &nbsp;|&nbsp;
            <strong style={{ color: 'var(--text-primary)' }}>{t('Core Theme')}: </strong>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              {(themeSettings.halfmoonCore || 'default').charAt(0).toUpperCase() +
               (themeSettings.halfmoonCore || 'default').slice(1)}
            </span>
            &nbsp;/&nbsp;
            <span style={{ textTransform: 'capitalize' }}>{themeSettings.mode}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
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
