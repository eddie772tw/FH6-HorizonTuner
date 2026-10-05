import React, { useEffect, useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useSettings } from '../../../context/SettingsContext';
import PresetPanel from './PresetPanel';

const ColorField: React.FC<{
  id: string; label: string; value: string; onChange: (value: string) => void;
}> = ({ id, label, value, onChange }) => {
  const [draft, setDraft] = useState(value);
  const valid = /^#[\da-f]{6}$/i.test(draft);
  useEffect(() => setDraft(value), [value]);
  return <div className="theme-color-field">
    <label htmlFor={`${id}-text`}>{label}</label>
    <div className="theme-color-inputs">
      <input id={`${id}-picker`} type="color" value={value} aria-label={label}
        onChange={event => { setDraft(event.target.value); onChange(event.target.value); }} />
      <input id={`${id}-text`} type="text" value={draft} className="form-control font-monospace"
        spellCheck={false} autoComplete="off" maxLength={7} placeholder="#000000" aria-invalid={!valid}
        onChange={event => {
          setDraft(event.target.value);
          if (/^#[\da-f]{6}$/i.test(event.target.value)) onChange(event.target.value);
        }} onBlur={() => setDraft(value)} onKeyDown={event => { if (event.key === 'Escape') setDraft(value); }} />
    </div>
  </div>;
};

const ColorPickerPanel: React.FC = () => {
  const { themeSettings, updateThemeSettings } = useTheme();
  const { t } = useSettings();
  return <section className="theme-colors" aria-labelledby="theme-colors-heading">
    <h3 id="theme-colors-heading">{t('Colors')}</h3>
    <p className="theme-help">{t('Choose a swatch or enter a six-digit HEX color. Presets update all three colors together.')}</p>
    <div className="theme-color-grid">
      <ColorField id="color-primary" label={t('Primary Color')} value={themeSettings.primaryColor}
        onChange={primaryColor => updateThemeSettings({ primaryColor })} />
      <ColorField id="color-secondary" label={t('Secondary Color')} value={themeSettings.secondaryColor}
        onChange={secondaryColor => updateThemeSettings({ secondaryColor })} />
      <ColorField id="color-accent" label={t('Accent Color')} value={themeSettings.accentColor}
        onChange={accentColor => updateThemeSettings({ accentColor })} />
    </div>
    <PresetPanel />
  </section>;
};

export default ColorPickerPanel;
