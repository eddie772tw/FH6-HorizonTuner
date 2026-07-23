import React, { useState, useEffect, useRef } from 'react';
import { useTheme, getDefaultCSSTemplate } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { validateCSS } from '../utils/cssValidator';

const ThemeView: React.FC = () => {
  const {
    themeSettings,
    updateThemeSettings,
    resetTheme,
    saveToSlot,
    loadFromSlot,
    exportThemeJSON,
    importThemeJSON
  } = useTheme();
  const { t } = useSettings();

  const [cssValidation, setCssValidation] = useState<{ isValid: boolean; error?: string }>({ isValid: true });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If customCSS is currently empty, automatically populate with active template
  useEffect(() => {
    if (!themeSettings.customCSS || themeSettings.customCSS.trim() === '') {
      const defaultTemplate = getDefaultCSSTemplate(themeSettings);
      updateThemeSettings({ customCSS: defaultTemplate });
    }
  }, []);

  // Validate CSS when customCSS changes
  useEffect(() => {
    const res = validateCSS(themeSettings.customCSS);
    setCssValidation(res);
  }, [themeSettings.customCSS]);

  const handlePopulateTemplate = () => {
    const defaultTemplate = getDefaultCSSTemplate(themeSettings);
    updateThemeSettings({ customCSS: defaultTemplate });
  };

  const handleApplyPreset = (presetName: string) => {
    if (presetName === 'cyber') {
      updateThemeSettings({
        mode: 'dark',
        primaryColor: '#00f0ff',
        secondaryColor: '#ff003c',
        accentColor: '#7000ff'
      });
    } else if (presetName === 'synthwave') {
      updateThemeSettings({
        mode: 'dark',
        primaryColor: '#ff00aa',
        secondaryColor: '#00ffff',
        accentColor: '#9900ff'
      });
    } else if (presetName === 'highcontrast') {
      updateThemeSettings({
        mode: 'dark',
        primaryColor: '#ffff00',
        secondaryColor: '#ff5500',
        accentColor: '#00ff88'
      });
    } else if (presetName === 'lightglass') {
      updateThemeSettings({
        mode: 'light',
        primaryColor: '#0284c7',
        secondaryColor: '#e11d48',
        accentColor: '#7c3aed'
      });
    }
  };

  const handleExport = () => {
    const jsonStr = exportThemeJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fh6_theme_config_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importThemeJSON(content);
        if (!success) {
          alert('Invalid Theme JSON file format.');
        }
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  return (
    <div style={{ padding: '2rem', color: 'var(--text-primary)', height: '100%', overflowY: 'auto' }}>
      <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
        
        {/* Title & Architecture Banner */}
        <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.2rem' }}>
          <h2 style={{ color: 'var(--primary)', margin: 0, textShadow: '0 0 10px var(--primary-glow)', fontSize: '1.8rem' }}>
            {t("Theme Settings")}
          </h2>
          <div style={{
            marginTop: '0.8rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'rgba(0, 240, 255, 0.08)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            fontSize: '0.88rem',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}>
            <span style={{ fontSize: '1.2rem' }}>⚙️</span>
            <div>
              <strong>{t("CSS Engine Architecture")}: </strong>
              <span>{t("This application is built with Vanilla CSS + Modern CSS Variables + Glassmorphism style.")}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Appearance Mode (Dark / Light) */}
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)', fontSize: '1.15rem' }}>
              {t("Appearance Mode")}
            </h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => updateThemeSettings({ mode: 'dark' })}
                style={{
                  flex: 1,
                  padding: '0.8rem 1.2rem',
                  borderRadius: '8px',
                  border: themeSettings.mode === 'dark' ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                  background: themeSettings.mode === 'dark' ? 'rgba(0, 240, 255, 0.15)' : 'var(--glass-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: themeSettings.mode === 'dark' ? '0 0 12px var(--primary-glow)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>🌙</span> {t("Dark Mode")}
              </button>
              <button
                onClick={() => updateThemeSettings({ mode: 'light' })}
                style={{
                  flex: 1,
                  padding: '0.8rem 1.2rem',
                  borderRadius: '8px',
                  border: themeSettings.mode === 'light' ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                  background: themeSettings.mode === 'light' ? 'rgba(0, 240, 255, 0.15)' : 'var(--glass-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: themeSettings.mode === 'light' ? '0 0 12px var(--primary-glow)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>☀️</span> {t("Light Mode")}
              </button>
            </div>
          </div>

          {/* Color Settings */}
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)', fontSize: '1.15rem' }}>
              {t("Colors")}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem' }}>
              
              <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
                  {t("Primary Color")}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <input
                    type="color"
                    value={themeSettings.primaryColor}
                    onChange={(e) => updateThemeSettings({ primaryColor: e.target.value })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '42px', height: '42px' }}
                  />
                  <input
                    type="text"
                    value={themeSettings.primaryColor}
                    onChange={(e) => updateThemeSettings({ primaryColor: e.target.value })}
                    className="cyber-input"
                    style={{ width: '110px', textAlign: 'center', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
                  {t("Secondary Color")}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <input
                    type="color"
                    value={themeSettings.secondaryColor}
                    onChange={(e) => updateThemeSettings({ secondaryColor: e.target.value })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '42px', height: '42px' }}
                  />
                  <input
                    type="text"
                    value={themeSettings.secondaryColor}
                    onChange={(e) => updateThemeSettings({ secondaryColor: e.target.value })}
                    className="cyber-input"
                    style={{ width: '110px', textAlign: 'center', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
                  {t("Accent Color")}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <input
                    type="color"
                    value={themeSettings.accentColor}
                    onChange={(e) => updateThemeSettings({ accentColor: e.target.value })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '42px', height: '42px' }}
                  />
                  <input
                    type="text"
                    value={themeSettings.accentColor}
                    onChange={(e) => updateThemeSettings({ accentColor: e.target.value })}
                    className="cyber-input"
                    style={{ width: '110px', textAlign: 'center', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <h3 style={{ marginBottom: '0.8rem', color: 'var(--primary)', fontSize: '1.15rem' }}>
              {t("Presets")}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button onClick={() => handleApplyPreset('cyber')} className="cyber-btn-glow" style={presetBtnStyle}>
                ⚡ {t("Minimal Cyber")}
              </button>
              <button onClick={() => handleApplyPreset('synthwave')} className="cyber-btn-glow" style={presetBtnStyle}>
                🌆 {t("Neon Synthwave")}
              </button>
              <button onClick={() => handleApplyPreset('highcontrast')} className="cyber-btn-glow" style={presetBtnStyle}>
                🪞 {t("High Contrast Dark")}
              </button>
              <button onClick={() => handleApplyPreset('lightglass')} className="cyber-btn-glow" style={presetBtnStyle}>
                💎 {t("Clean Light Glass")}
              </button>
            </div>
          </div>

          {/* Style Storage Slots (3 Slots) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.15rem' }}>
                {t("Style Storage Slots")} (Max 3)
              </h3>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button onClick={handleExport} className="cyber-btn-glow" style={actionBtnStyle}>
                  📤 {t("Export Theme JSON")}
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="cyber-btn-glow" style={actionBtnStyle}>
                  📥 {t("Import Theme JSON")}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {themeSettings.slots.map(slot => (
                <div
                  key={slot.id}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.8rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{slot.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {slot.savedAt ? `Saved ${slot.savedAt}` : 'Empty'}
                    </span>
                  </div>

                  {/* Preview Colors */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: slot.primaryColor, border: '1px solid #fff' }} title="Primary" />
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: slot.secondaryColor, border: '1px solid #fff' }} title="Secondary" />
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: slot.accentColor, border: '1px solid #fff' }} title="Accent" />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      {slot.mode === 'light' ? '☀️ Light' : '🌙 Dark'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <button
                      onClick={() => saveToSlot(slot.id)}
                      style={{ ...slotBtnStyle, background: 'rgba(0, 240, 255, 0.15)', color: 'var(--primary)', border: '1px solid var(--primary)' }}
                    >
                      💾 {t("Save Current")}
                    </button>
                    <button
                      onClick={() => loadFromSlot(slot.id)}
                      style={{ ...slotBtnStyle, background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                    >
                      🚀 {t("Load Slot")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom CSS Editor & Validation */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.15rem' }}>
                {t("Custom CSS & Style Editor")}
              </h3>

              {/* Syntax Validation Status Badge */}
              <div style={{
                padding: '0.35rem 0.8rem',
                borderRadius: '20px',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: cssValidation.isValid ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 0, 60, 0.2)',
                border: cssValidation.isValid ? '1px solid #00ff88' : '1px solid #ff003c',
                color: cssValidation.isValid ? '#00ff88' : '#ff003c'
              }}>
                <span>{cssValidation.isValid ? '✓' : '⚠️'}</span>
                <span>{cssValidation.isValid ? t("Valid CSS Syntax") : (cssValidation.error || t("Invalid CSS Syntax"))}</span>
              </div>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.8rem', lineHeight: '1.4' }}>
              {t("Add your custom CSS rules. The current active style rules are loaded below by default so you can start customizing directly:")}
            </p>

            <textarea
              value={themeSettings.customCSS}
              onChange={(e) => updateThemeSettings({ customCSS: e.target.value })}
              className="cyber-input"
              style={{
                width: '100%',
                minHeight: '260px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.9rem',
                lineHeight: '1.5',
                resize: 'vertical',
                padding: '1rem',
                tabSize: 2
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
              <button
                onClick={handlePopulateTemplate}
                className="cyber-btn-glow"
                style={{
                  background: 'rgba(0, 240, 255, 0.1)',
                  border: '1px solid var(--primary)',
                  color: 'var(--primary)',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                🔄 {t("Load Current CSS Template")}
              </button>

              <button
                onClick={resetTheme}
                className="cyber-btn-glow"
                style={{
                  background: 'rgba(255, 0, 60, 0.2)',
                  border: '1px solid var(--secondary)',
                  color: 'var(--secondary)',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                ⚠️ {t("Reset to Defaults")}
              </button>
            </div>
          </div>

          {/* CSS Cheatsheet & Variables Reference */}
          <div style={{
            padding: '1.2rem',
            borderRadius: '12px',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--glass-border)'
          }}>
            <h4 style={{ color: 'var(--primary)', marginBottom: '0.8rem', fontSize: '1rem' }}>
              💡 {t("CSS Cheatsheet & Supported Variables")}
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem', fontSize: '0.85rem' }}>
              <div>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                  {t("Available CSS Variables:")}
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <li><code style={codeStyle}>--primary</code>: Primary brand accent color</li>
                  <li><code style={codeStyle}>--secondary</code>: Secondary warning/accent color</li>
                  <li><code style={codeStyle}>--accent</code>: Highlight purple/cyan accent</li>
                  <li><code style={codeStyle}>--glass-bg</code>: Panel translucent background</li>
                  <li><code style={codeStyle}>--glass-border</code>: Panel glass border color</li>
                  <li><code style={codeStyle}>--glass-blur</code>: Panel backdrop blur radius</li>
                  <li><code style={codeStyle}>--panel-radius</code>: Main panel corner radius</li>
                  <li><code style={codeStyle}>--input-bg</code>: Form input background</li>
                  <li><code style={codeStyle}>--bg-gradient</code>: Page overall background gradient</li>
                </ul>
              </div>

              <div>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                  {t("Target UI Selectors:")}
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <li><code style={codeStyle}>.glass-panel</code>: Main content cards & panels</li>
                  <li><code style={codeStyle}>.cyber-input</code>: Text inputs & dropdown selects</li>
                  <li><code style={codeStyle}>.cyber-btn-glow</code>: Interactive glowing buttons</li>
                  <li><code style={codeStyle}>[data-theme="dark"]</code>: Dark mode root target</li>
                  <li><code style={codeStyle}>[data-theme="light"]</code>: Light mode root target</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

const presetBtnStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-primary)',
  padding: '0.5rem 0.9rem',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
  transition: 'all 0.2s ease'
};

const actionBtnStyle: React.CSSProperties = {
  background: 'rgba(0, 240, 255, 0.1)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-primary)',
  padding: '0.4rem 0.8rem',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 500
};

const slotBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.6rem',
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
  transition: 'all 0.2s ease'
};

const codeStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  padding: '0.1rem 0.3rem',
  borderRadius: '3px',
  color: 'var(--primary)',
  fontFamily: 'monospace'
};

export default ThemeView;
