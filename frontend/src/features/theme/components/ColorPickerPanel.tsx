import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useSettings } from '../../../context/SettingsContext';

const ColorField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ id, label, value, onChange }) => (
  <div style={{
    padding: '1rem',
    borderRadius: '8px',
    background: 'var(--surface-1)',
    border: '1px solid var(--glass-border)',
  }}>
    <label htmlFor={`${id}-text`} style={{ fontSize: '0.95rem', fontWeight: 600, display: 'block', marginBottom: '0.6rem', color: 'var(--text-primary)' }}>
      {label}
    </label>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
      <input
        id={`${id}-picker`}
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '42px', height: '42px', borderRadius: '4px' }}
      />
      <input
        id={`${id}-text`}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="cyber-input"
        style={{ width: '110px', textAlign: 'center', fontFamily: 'monospace' }}
      />
      {/* Live preview swatch */}
      <div style={{
        width: '32px', height: '32px', borderRadius: '6px',
        background: value,
        border: '1px solid var(--glass-border)',
        boxShadow: `0 0 8px ${value}66`,
        flexShrink: 0,
      }} />
    </div>
  </div>
);

const ColorPickerPanel: React.FC = () => {
  const { themeSettings, updateThemeSettings } = useTheme();
  const { t } = useSettings();

  return (
    <div>
      <h3 style={{ marginBottom: '1rem', color: 'var(--primary)', fontSize: '1.15rem' }}>
        {t('Colors')}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem' }}>
        <ColorField
          id="color-primary"
          label={t('Primary Color')}
          value={themeSettings.primaryColor}
          onChange={v => updateThemeSettings({ primaryColor: v })}
        />
        <ColorField
          id="color-secondary"
          label={t('Secondary Color')}
          value={themeSettings.secondaryColor}
          onChange={v => updateThemeSettings({ secondaryColor: v })}
        />
        <ColorField
          id="color-accent"
          label={t('Accent Color')}
          value={themeSettings.accentColor}
          onChange={v => updateThemeSettings({ accentColor: v })}
        />
      </div>
    </div>
  );
};

export default ColorPickerPanel;
