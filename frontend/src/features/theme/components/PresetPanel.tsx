import React from 'react';
import { useTheme, normalizeThemeSettings } from '../../../context/ThemeContext';
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
  {
    label: 'Swiss Signal',
    primaryColor: '#e30613',
    secondaryColor: '#f59e0b',
    accentColor: '#2563eb',
  },
  {
    label: 'Bauhaus Mono',
    primaryColor: '#f1f5f9',
    secondaryColor: '#ef4444',
    accentColor: '#64748b',
  },
];

const PresetPanel: React.FC = () => {
  const { themeSettings, updateThemeSettings } = useTheme();
  const { t } = useSettings();

  const applyPreset = (preset: Preset) => {
    updateThemeSettings({
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentColor: preset.accentColor,
    });
  };

  return (
    <section className="theme-presets" aria-labelledby="theme-presets-heading">
      <h4 id="theme-presets-heading">
        {t('Color Presets')}
      </h4>
      <p className="theme-help">
        {t('Applies accent color palettes (Primary, Secondary, Accent) without altering your current mode or core theme.')}
      </p>
      <div className="theme-presets-grid">
        {PRESETS.map(rawPreset => {
          const preset = { ...rawPreset, ...normalizeThemeSettings({ ...rawPreset, mode: themeSettings.mode }) };
          return (
          <button
            type="button"
            key={preset.label}
            id={`preset-${preset.label.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => applyPreset(preset)}
            aria-pressed={themeSettings.primaryColor === preset.primaryColor
              && themeSettings.secondaryColor === preset.secondaryColor
              && themeSettings.accentColor === preset.accentColor}
            className="theme-choice"
          >
            <span className="theme-preset-swatches" aria-hidden="true">
              <span style={{ background: preset.primaryColor }} />
              <span style={{ background: preset.secondaryColor }} />
              <span style={{ background: preset.accentColor }} />
            </span>
            {t(preset.label)}
          </button>
          );
        })}
      </div>
    </section>
  );
};

export default PresetPanel;
