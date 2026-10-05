import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { DESIGN_SYSTEMS, coreThemeEntries } from '../../../context/themeCatalog';
import { themeColorProperties } from '../../../context/themeSettings';
import { useSettings } from '../../../context/SettingsContext';

const AppearanceModePanel: React.FC = () => {
  const { themeSettings, updateThemeSettings } = useTheme();
  const { t } = useSettings();
  return <div className="theme-appearance">
    <section aria-labelledby="theme-mode-heading">
      <h3 id="theme-mode-heading">{t('Appearance Mode')}</h3>
      <div className="theme-mode-options">
        {(['dark', 'light'] as const).map(mode => <button key={mode} type="button"
          id={`theme-mode-${mode}`} className="theme-choice"
          aria-pressed={themeSettings.mode === mode} onClick={() => updateThemeSettings({ mode })}>
          {t(mode === 'dark' ? 'Dark Mode' : 'Light Mode')}
        </button>)}
      </div>
    </section>
    <section aria-labelledby="theme-core-heading">
      <h3 id="theme-core-heading">{t('Core Theme')}</h3>
      <p className="theme-help">{t('Choose the overall palette and component design. Color presets customize its accent colors.')}</p>
      <div className="theme-system-groups">
        {Object.entries(DESIGN_SYSTEMS).map(([systemId, system]) => <section key={systemId}
          className="theme-system-group" aria-labelledby={`theme-system-${systemId}`}>
          <h4 id={`theme-system-${systemId}`}>{system.label}</h4>
          <div className="theme-core-options">
            {coreThemeEntries.filter(([, core]) => core.designSystem === systemId).map(([id, core]) => <button
              key={id} type="button" id={`theme-core-${id}`} className="theme-choice theme-core-choice"
              aria-pressed={themeSettings.halfmoonCore === id} onClick={() => updateThemeSettings({ halfmoonCore: id })}>
              {core.designSystem === 'swiss' ? <span className="theme-core-preview" aria-hidden="true"
                data-design-system={core.designSystem} data-bs-core={id} data-bs-theme={themeSettings.mode}
                style={themeColorProperties(themeSettings) as React.CSSProperties}>
                <span className="workspace-panel-header">
                  <span className="workspace-section-heading">Aa</span><span className="badge text-bg-primary">123</span>
                </span>
                <span className="theme-core-preview__body">
                  <span>12.34</span><span className="btn btn-primary btn-sm">Aa</span>
                </span>
              </span> : <span className="theme-core-swatches" aria-hidden="true">
                <span style={{ background: core.swatchPrimary }} /><span style={{ background: core.swatchBg }} />
              </span>}
              <span className="fw-semibold">{core.label}</span>
              <span className="theme-help mb-0">{t(core.description)}</span>
            </button>)}
          </div>
        </section>)}
      </div>
    </section>
  </div>;
};

export default AppearanceModePanel;
