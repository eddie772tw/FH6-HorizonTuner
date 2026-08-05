import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useSettings } from '../../../context/SettingsContext';

interface Preset {
  label: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

const PRESETS: Preset[] = [
  {
    label: 'Neon Cyan',
    primaryColor: '#00f0ff',
    secondaryColor: '#ff003c',
    accentColor: '#7000ff',
  },
  {
    label: 'Cobalt Indigo',
    primaryColor: '#3b82f6',
    secondaryColor: '#f59e0b',
    accentColor: '#8b5cf6',
  },
  {
    label: 'Bronze Espresso',
    primaryColor: '#d4a96a',
    secondaryColor: '#7c9e6e',
    accentColor: '#a07850',
  },
  {
    label: 'Emerald Volt',
    primaryColor: '#10b981',
    secondaryColor: '#06b6d4',
    accentColor: '#f43f5e',
  },
  {
    label: 'Solar Flare',
    primaryColor: '#f97316',
    secondaryColor: '#eab308',
    accentColor: '#ef4444',
  },
  {
    label: 'Synthwave Pink',
    primaryColor: '#ec4899',
    secondaryColor: '#06b6d4',
    accentColor: '#a855f7',
  },
  {
    label: 'crosXover',
    primaryColor: '#7f4448',
    secondaryColor: '#d4cac9',
    accentColor: '#4c4c4c',
  },
  {
    label: 'Retro VFD',
    primaryColor: '#8ffff0',
    secondaryColor: '#ff584d',
    accentColor: '#ffb732',
  },
];

const presetBtnStyle: React.CSSProperties = {
  background: 'var(--surface-1)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-primary)',
  padding: '0.6rem 1rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
};

const PresetPanel: React.FC = () => {
  const { updateThemeSettings } = useTheme();
  const { t } = useSettings();

  const applyPreset = (preset: Preset) => {
    updateThemeSettings({
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentColor: preset.accentColor,
    });
  };

  return (
    <div>
      <h3 style={{ marginBottom: '0.5rem', color: 'var(--primary)', fontSize: '1.15rem' }}>
        {t('Color Presets')}
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        {t('Applies accent color palettes (Primary, Secondary, Accent) without altering your current mode or core theme.')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {PRESETS.map(preset => (
          <button
            key={preset.label}
            id={`preset-${preset.label.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => applyPreset(preset)}
            className="cyber-btn-glow"
            style={presetBtnStyle}
          >
            {/* 3-Color Dots Swatch */}
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <span style={{
                display: 'inline-block', width: '10px', height: '10px',
                borderRadius: '50%', background: preset.primaryColor,
                boxShadow: `0 0 4px ${preset.primaryColor}`,
              }} title="Primary" />
              <span style={{
                display: 'inline-block', width: '8px', height: '8px',
                borderRadius: '50%', background: preset.secondaryColor,
              }} title="Secondary" />
              <span style={{
                display: 'inline-block', width: '8px', height: '8px',
                borderRadius: '50%', background: preset.accentColor,
              }} title="Accent" />
            </div>
            {t(preset.label)}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PresetPanel;
