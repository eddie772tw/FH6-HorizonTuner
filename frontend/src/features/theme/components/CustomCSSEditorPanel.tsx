import React, { useState, useEffect } from 'react';
import { useTheme, getDefaultCSSTemplate } from '../../../context/ThemeContext';
import { useSettings } from '../../../context/SettingsContext';
import { validateCSS } from '../../../utils/cssValidator';

const codeStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  padding: '0.1rem 0.3rem',
  borderRadius: '3px',
  color: 'var(--primary)',
  fontFamily: 'monospace',
};

const CustomCSSEditorPanel: React.FC = () => {
  const { themeSettings, updateThemeSettings, resetTheme } = useTheme();
  const { t } = useSettings();
  const [cssValidation, setCssValidation] = useState<{ isValid: boolean; error?: string }>({ isValid: true });

  // Auto-populate template if customCSS is empty
  useEffect(() => {
    if (!themeSettings.customCSS || themeSettings.customCSS.trim() === '') {
      const defaultTemplate = getDefaultCSSTemplate(themeSettings);
      updateThemeSettings({ customCSS: defaultTemplate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validate CSS on change
  useEffect(() => {
    const res = validateCSS(themeSettings.customCSS);
    setCssValidation(res);
  }, [themeSettings.customCSS]);

  const handlePopulateTemplate = () => {
    const defaultTemplate = getDefaultCSSTemplate(themeSettings);
    updateThemeSettings({ customCSS: defaultTemplate });
  };

  return (
    <div>
      {/* Header + Validation Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
        <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.15rem' }}>
          {t('Custom CSS & Style Editor')}
        </h3>
        <div style={{
          padding: '0.35rem 0.8rem',
          borderRadius: '20px',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: cssValidation.isValid ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 0, 60, 0.18)',
          border: cssValidation.isValid ? '1px solid #00ff88' : '1px solid #ff003c',
          color: cssValidation.isValid ? '#00ff88' : '#ff003c',
        }}>
          <span>{cssValidation.isValid ? t('Valid CSS Syntax') : (cssValidation.error || t('Invalid CSS Syntax'))}</span>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.8rem', lineHeight: '1.4' }}>
        {t('Add your custom CSS rules. The current active style rules are loaded below by default so you can start customizing directly:')}
      </p>

      <textarea
        id="custom-css-editor"
        value={themeSettings.customCSS}
        onChange={e => updateThemeSettings({ customCSS: e.target.value })}
        className="cyber-input"
        style={{
          width: '100%',
          minHeight: '260px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: '0.9rem',
          lineHeight: '1.5',
          resize: 'vertical',
          padding: '1rem',
          tabSize: 2,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
        <button
          id="load-css-template"
          onClick={handlePopulateTemplate}
          className="cyber-btn-glow"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--primary)',
            color: 'var(--primary)',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          {t('Load Current CSS Template')}
        </button>

        <button
          id="reset-theme"
          onClick={resetTheme}
          className="cyber-btn-glow"
          style={{
            background: 'rgba(255, 0, 60, 0.15)',
            border: '1px solid var(--secondary)',
            color: 'var(--secondary)',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          {t('Reset to Defaults')}
        </button>
      </div>

      {/* Updated CSS Cheatsheet — reflects Halfmoon + FH6 bridge variables */}
      <div style={{
        marginTop: '1.5rem',
        padding: '1.2rem',
        borderRadius: '12px',
        background: 'var(--surface-1)',
        border: '1px solid var(--glass-border)',
      }}>
        <h4 style={{ color: 'var(--primary)', marginBottom: '0.8rem', fontSize: '1rem' }}>
          {t('CSS Cheatsheet & Supported Variables')}
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem', fontSize: '0.85rem' }}>
          {/* FH6 Custom Variables */}
          <div>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>
              {t('FH6 Custom Variables (brand colors):')}
            </strong>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              <li><code style={codeStyle}>--primary</code>: {t('Brand accent color (user-defined)')}</li>
              <li><code style={codeStyle}>--secondary</code>: {t('Secondary accent color')}</li>
              <li><code style={codeStyle}>--accent</code>: {t('Tertiary accent color')}</li>
              <li><code style={codeStyle}>--primary-glow</code>: {t('Glow shadow for primary')}</li>
              <li><code style={codeStyle}>--glass-bg</code>: {t('Glassmorphism panel background')}</li>
              <li><code style={codeStyle}>--glass-border</code>: {t('Panel border (translucent)')}</li>
              <li><code style={codeStyle}>--glass-blur</code>: {t('Backdrop blur radius')}</li>
              <li><code style={codeStyle}>--panel-radius</code>: {t('Card corner radius')}</li>
              <li><code style={codeStyle}>--text-primary</code>: {t('Maps from --bs-body-color')}</li>
              <li><code style={codeStyle}>--text-secondary</code>: {t('Maps from --bs-secondary-color')}</li>
            </ul>
          </div>

          {/* Halfmoon Semantic Variables */}
          <div>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>
              {t('Halfmoon Semantic Variables (--bs-*):')}
            </strong>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              <li><code style={codeStyle}>--bs-primary</code>: {t('Halfmoon theme primary color')}</li>
              <li><code style={codeStyle}>--bs-primary-hsl</code>: {t('Primary in HSL for rgba()')}</li>
              <li><code style={codeStyle}>--bs-body-color</code>: {t('Body text color (auto dark/light)')}</li>
              <li><code style={codeStyle}>--bs-secondary-color</code>: {t('Muted text color')}</li>
              <li><code style={codeStyle}>--bs-body-bg</code>: {t('Page background (Halfmoon managed)')}</li>
              <li><code style={codeStyle}>--bs-body-bg-hsl</code>: {t('Background in HSL')}</li>
              <li><code style={codeStyle}>--bs-border-color</code>: {t('Default border color')}</li>
              <li><code style={codeStyle}>--bs-border-color-translucent</code>: {t('Translucent border')}</li>
              <li><code style={codeStyle}>--bs-secondary-bg</code>: {t('Subtle background for cards')}</li>
              <li><code style={codeStyle}>--bs-form-bg</code>: {t('Input/form background')}</li>
            </ul>
          </div>

          {/* Target Selectors */}
          <div>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>
              {t('Target UI Selectors:')}
            </strong>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              <li><code style={codeStyle}>.glass-panel</code>: {t('Main content cards & panels')}</li>
              <li><code style={codeStyle}>.cyber-input</code>: {t('Text inputs & textareas')}</li>
              <li><code style={codeStyle}>.cyber-select</code>: {t('Dropdown selects')}</li>
              <li><code style={codeStyle}>.cyber-btn-glow</code>: {t('Interactive glow buttons')}</li>
              <li><code style={codeStyle}>[data-bs-theme="dark"]</code>: {t('Dark mode root target')}</li>
              <li><code style={codeStyle}>[data-bs-theme="light"]</code>: {t('Light mode root target')}</li>
              <li><code style={codeStyle}>[data-bs-core="default"]</code>: {t('Default core theme')}</li>
              <li><code style={codeStyle}>[data-bs-core="modern"]</code>: {t('Modern core theme')}</li>
              <li><code style={codeStyle}>[data-bs-core="elegant"]</code>: {t('Elegant core theme')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomCSSEditorPanel;
