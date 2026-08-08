import React from 'react';
import { useTheme, HalfmoonCore } from '../../../context/ThemeContext';
import { useSettings } from '../../../context/SettingsContext';

const CORE_THEMES: { id: HalfmoonCore; label: string; description: string; swatchPrimary: string; swatchBg: string }[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Classic neutral tone with clean structure',
    swatchPrimary: '#4dabf7',
    swatchBg: '#1a1c23',
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Slate-tinted dark with navy blue accent',
    swatchPrimary: '#3b5bdb',
    swatchBg: '#1e2a3a',
  },
  {
    id: 'elegant',
    label: 'Elegant',
    description: 'Warm earth tones with refined typography',
    swatchPrimary: '#a07850',
    swatchBg: '#1c1a18',
  },
];

const AppearanceModePanel: React.FC = () => {
  const { themeSettings, updateThemeSettings } = useTheme();
  const { t } = useSettings();

  return (
    <div>
      {/* Dark / Light toggle */}
      <h3 style={{ marginBottom: '1rem', color: 'var(--primary)', fontSize: '1.15rem' }}>
        {t('Appearance Mode')}
      </h3>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        {(['dark', 'light'] as const).map(mode => (
          <button
            key={mode}
            id={`theme-mode-${mode}`}
            onClick={() => updateThemeSettings({ mode })}
            style={{
              flex: 1,
              padding: '0.8rem 1.2rem',
              borderRadius: '8px',
              border: themeSettings.mode === mode
                ? '2px solid var(--primary)'
                : '1px solid var(--glass-border)',
              background: themeSettings.mode === mode
                ? 'var(--surface-3)'
                : 'var(--surface-1)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: themeSettings.mode === mode ? '0 0 12px var(--primary-glow)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {mode === 'dark' ? t('Dark Mode') : t('Light Mode')}
          </button>
        ))}
      </div>

      {/* Halfmoon Core Theme selector */}
      <h3 style={{ marginBottom: '0.75rem', color: 'var(--primary)', fontSize: '1.15rem' }}>
        {t('Core Theme')}
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        {t('Selects the Halfmoon base theme that determines the default color palette and component style.')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.9rem' }}>
        {CORE_THEMES.map(theme => {
          const isActive = themeSettings.halfmoonCore === theme.id;
          return (
            <button
              key={theme.id}
              id={`theme-core-${theme.id}`}
              onClick={() => updateThemeSettings({ halfmoonCore: theme.id })}
              className="glass-panel-interactive"
              style={{
                padding: '1rem',
                borderRadius: '10px',
                border: isActive ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                background: isActive ? 'var(--surface-3)' : 'var(--surface-1)',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: isActive ? '0 0 10px var(--primary-glow)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Color swatch preview */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: theme.swatchPrimary, border: '1px solid rgba(255,255,255,0.2)'
                }} />
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: theme.swatchBg, border: '1px solid rgba(255,255,255,0.2)'
                }} />
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                {theme.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {theme.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AppearanceModePanel;
