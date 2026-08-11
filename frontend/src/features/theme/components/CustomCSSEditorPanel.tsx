import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useSettings } from '../../../context/SettingsContext';
import { validateCSS, CSSValidationResult } from '../../../utils/cssValidator';

const STARTER_CSS = `/* Optional UI overrides. Keep selectors scoped to the app. */
.glass-panel {
  border-radius: calc(var(--panel-radius) + 2px);
}

.cyber-btn-glow {
  box-shadow: 0 0 12px var(--primary-glow);
}`;

const CUSTOM_VARIABLES = [
  ['--primary', 'Brand accent color (user-defined)'],
  ['--secondary', 'Secondary accent color'],
  ['--accent', 'Tertiary accent color'],
  ['--primary-glow', 'Glow shadow for primary'],
  ['--glass-bg', 'Glassmorphism panel background'],
  ['--glass-border', 'Panel border (translucent)'],
  ['--glass-blur', 'Backdrop blur radius'],
  ['--panel-radius', 'Card corner radius'],
  ['--input-radius', 'Input field corner radius'],
  ['--text-primary', 'Maps from --bs-body-color'],
  ['--text-secondary', 'Maps from --bs-secondary-color'],
] as const;

const TARGET_SELECTORS = [
  ['.glass-panel', 'Main content cards & panels'],
  ['.card', 'Main content cards & panels'],
  ['.navbar', 'Navigation bar'],
  ['.offcanvas', 'Theme and terminal sidebars'],
  ['.cyber-input', 'Text inputs & textareas'],
  ['.cyber-btn-glow', 'Interactive glow buttons'],
  ['[data-bs-theme="dark"]', 'Dark mode root target'],
  ['[data-bs-theme="light"]', 'Light mode root target'],
  ['[data-bs-core="modern"]', 'Modern core theme'],
  ['[data-bs-core="elegant"]', 'Elegant core theme'],
] as const;

const CustomCSSEditorPanel: React.FC = () => {
  const {
    themeSettings,
    updateThemeSettings,
    exportThemeJSON,
    importThemeJSON,
  } = useTheme();
  const { t } = useSettings();
  const [draftCSS, setDraftCSS] = useState(themeSettings.customCSS);
  const [cssValidation, setCssValidation] = useState<CSSValidationResult>({ isValid: true });
  const [fileError, setFileError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAppliedCSS = useRef(themeSettings.customCSS);
  const isDirty = draftCSS !== themeSettings.customCSS;

  // External imports and backend updates update the saved value; keep the local draft in sync.
  useEffect(() => {
    if (themeSettings.customCSS !== lastAppliedCSS.current) {
      setDraftCSS(themeSettings.customCSS);
      lastAppliedCSS.current = themeSettings.customCSS;
    }
  }, [themeSettings.customCSS]);

  useEffect(() => {
    setCssValidation(validateCSS(draftCSS));
  }, [draftCSS]);

  const handleApply = () => {
    if (!cssValidation.isValid) return;
    lastAppliedCSS.current = draftCSS;
    updateThemeSettings({ customCSS: draftCSS });
  };

  const handleDiscard = () => {
    setDraftCSS(themeSettings.customCSS);
    setFileError(null);
  };

  const handleInsertStarter = () => {
    const textarea = editorRef.current;
    const start = textarea?.selectionStart ?? draftCSS.length;
    const end = textarea?.selectionEnd ?? draftCSS.length;
    const prefix = draftCSS.slice(0, start);
    const suffix = draftCSS.slice(end);
    const separator = prefix && !prefix.endsWith('\n') ? '\n\n' : '';
    setDraftCSS(`${prefix}${separator}${STARTER_CSS}${suffix}`);
  };

  const handleExport = () => {
    const blob = new Blob([exportThemeJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fh6-theme-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result;
      if (typeof content !== 'string' || !importThemeJSON(content)) {
        setFileError(t('Invalid Theme JSON file format.'));
        return;
      }
      setFileError(null);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const statusLabel = !isDirty
    ? t('Changes saved')
    : cssValidation.isValid
      ? t('Unsaved changes')
      : (cssValidation.error || t('Invalid CSS Syntax'));

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <h3 className="text-primary fs-6 fw-bold m-0">
          {t('Custom CSS & Style Editor')}
        </h3>
        <span className={`badge ${!isDirty ? 'text-bg-success' : cssValidation.isValid ? 'text-bg-warning' : 'text-bg-danger'}`}>
          {statusLabel}
        </span>
      </div>

      <p className="text-body-secondary fs-7 mb-3" style={{ lineHeight: '1.45' }}>
        {t('Custom CSS is optional. Edit a draft, then apply it after validation.')}
      </p>

      <textarea
        ref={editorRef}
        id="custom-css-editor"
        value={draftCSS}
        onChange={event => setDraftCSS(event.target.value)}
        className="form-control font-monospace"
        aria-describedby="custom-css-help"
        spellCheck={false}
        wrap="off"
        style={{
          minHeight: '280px',
          resize: 'vertical',
          lineHeight: '1.55',
          tabSize: 2,
          background: 'var(--surface-2)',
        }}
      />

      <div id="custom-css-help" className="text-body-secondary fs-8 mt-2">
        {cssValidation.error && (
          <span className="text-danger">
            {cssValidation.error}
            {cssValidation.errorLine ? ` (${t('Line #')}${cssValidation.errorLine})` : ''}
          </span>
        )}
        {!cssValidation.error && t('The last applied CSS remains active until you apply valid CSS.')}
      </div>

      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm fw-bold"
            onClick={handleApply}
            disabled={!isDirty || !cssValidation.isValid}
          >
            {t('Apply')}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={handleDiscard}
            disabled={!isDirty}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={handleInsertStarter}
          >
            {t('Insert Starter CSS')}
          </button>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => setDraftCSS('')}
            disabled={!draftCSS}
          >
            {t('Clear Current')}
          </button>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleExport}>
            {t('Export Theme JSON')}
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
            {t('Import Theme JSON')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            hidden
          />
        </div>
      </div>

      {fileError && <div className="alert alert-danger mt-3 mb-0 py-2 fs-8">{fileError}</div>}

      <div className="glass-panel p-3 mt-4">
        <h4 className="text-primary fs-7 fw-bold mb-3">
          {t('CSS Cheatsheet & Supported Variables')}
        </h4>
        <div className="row g-3 fs-8">
          <div className="col-12 col-lg-6">
            <strong className="d-block mb-2">{t('Available CSS Variables:')}</strong>
            <ul className="mb-0 ps-3 text-body-secondary" style={{ lineHeight: '1.8' }}>
              {CUSTOM_VARIABLES.map(([name, description]) => (
                <li key={name}>
                  <code className="text-primary bg-body-secondary px-1 rounded">{name}</code>: {t(description)}
                </li>
              ))}
            </ul>
          </div>
          <div className="col-12 col-lg-6">
            <strong className="d-block mb-2">{t('Target UI Selectors:')}</strong>
            <ul className="mb-0 ps-3 text-body-secondary" style={{ lineHeight: '1.8' }}>
              {TARGET_SELECTORS.map(([selector, description]) => (
                <li key={selector}>
                  <code className="text-primary bg-body-secondary px-1 rounded">{selector}</code>: {t(description)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomCSSEditorPanel;
