import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';

const ThemeView: React.FC = () => {
  const { themeSettings, updateThemeSettings, resetTheme } = useTheme();
  const { t } = useSettings();

  return (
    <div style={{ padding: '2rem', color: 'var(--text-primary)', height: '100%', overflowY: 'auto' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: '1.5rem', textShadow: '0 0 10px rgba(0, 240, 255, 0.3)' }}>
          {t("Theme Settings")}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Color Settings */}
          <div>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
              {t("Colors")}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '1rem', fontWeight: 500 }}>Primary Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input
                    type="color"
                    value={themeSettings.primaryColor}
                    onChange={(e) => updateThemeSettings({ primaryColor: e.target.value })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '40px', height: '40px' }}
                  />
                  <input
                    type="text"
                    value={themeSettings.primaryColor}
                    onChange={(e) => updateThemeSettings({ primaryColor: e.target.value })}
                    className="cyber-input"
                    style={{ width: '100px', textAlign: 'center' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '1rem', fontWeight: 500 }}>Secondary Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input
                    type="color"
                    value={themeSettings.secondaryColor}
                    onChange={(e) => updateThemeSettings({ secondaryColor: e.target.value })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '40px', height: '40px' }}
                  />
                  <input
                    type="text"
                    value={themeSettings.secondaryColor}
                    onChange={(e) => updateThemeSettings({ secondaryColor: e.target.value })}
                    className="cyber-input"
                    style={{ width: '100px', textAlign: 'center' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '1rem', fontWeight: 500 }}>Accent Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input
                    type="color"
                    value={themeSettings.accentColor}
                    onChange={(e) => updateThemeSettings({ accentColor: e.target.value })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '40px', height: '40px' }}
                  />
                  <input
                    type="text"
                    value={themeSettings.accentColor}
                    onChange={(e) => updateThemeSettings({ accentColor: e.target.value })}
                    className="cyber-input"
                    style={{ width: '100px', textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Custom CSS Setting */}
          <div>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
              {t("Custom CSS")}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Add your own CSS rules to override default styles. These will be injected globally.
            </p>
            <textarea
              value={themeSettings.customCSS}
              onChange={(e) => updateThemeSettings({ customCSS: e.target.value })}
              className="cyber-input"
              style={{
                width: '100%',
                minHeight: '200px',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                resize: 'vertical',
                padding: '1rem'
              }}
              placeholder="/* Add custom CSS here */\n.glass-panel {\n  background: rgba(0,0,0,0.8);\n}"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              onClick={resetTheme}
              className="cyber-btn-glow"
              style={{
                background: 'rgba(255, 0, 60, 0.2)',
                border: '1px solid var(--secondary)',
                color: 'var(--secondary)',
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeView;
